// T-A07: one command for a local BSC mainnet fork with PulseForecast running on it.
//
//   node fork/run.mjs            (or: cd fork && npm start)
//
// What it does, in order:
//   1. reads mainnet (read-only): 5 real Agent ID holders from the Agent ID contract's mint
//      events, and the real Chainlink BNB/USD round that was current at each of the last 7
//      UTC midnights (the same binary search as spikes/F1)
//   2. starts anvil on a fork of BSC mainnet
//   3. deploys a replay feed (the MockFeed from contracts/test/mocks) loaded with those real
//      rounds moved forward by whole days, because a fork never receives new Chainlink rounds,
//      then deploys PulseForecast against the real Agent ID contract and that feed
//   4. runs 7 simulated UTC days: each day it settles the previous one, and each holder sends
//      one submit() that reveals today, commits tomorrow and scores yesterday. Holders are
//      impersonated on the fork only; a fresh address is shown to be refused.
//   5. writes deployments/fork.json and keeps the fork running for the website
//
// Nothing here signs with a private key: anvil signs for its own unlocked accounts and for
// impersonated ones. Nothing is ever sent to mainnet; the mainnet RPC is only read.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient, createTestClient, createWalletClient, defineChain, http, parseAbiItem, parseEther, toHex,
} from 'viem'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')
const MAINNET_RPC = process.env.BSC_RPC_URL ?? 'https://bsc-rpc.publicnode.com'
const PORT = Number(process.env.FORK_PORT ?? 8545)
const LOCAL = `http://127.0.0.1:${PORT}`
const CONTRACTS = resolve(process.env.CONTRACTS_DIR ?? join(ROOT, 'contracts'))
const FOUNDRY_BIN = process.env.FOUNDRY_BIN ?? join(homedir(), '.foundry', 'bin')
const DAYS = 7 // 7 midnights: 5 scored days per holder, enough for the leaderboard
const HOLDERS = 5

const AGENT_ID = '0x60b9262456de011f7d15a54cdd8c48baaa8b022f'
const FEED = '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE'
const MAX_STALE = 7200n // 2 h, as in docs/ARCHITECTURE.md
const INITIAL_SIGMA = 250 // bps a day

const log = (...a) => console.log('[fork]', ...a)
let anvilProc = null // killed on any exit, so a failed run never leaves the port taken
const fail = (msg) => { console.error(`[fork] ${msg}`); anvilProc?.kill(); process.exit(1) }
const tool = (name) => {
  const exe = join(FOUNDRY_BIN, process.platform === 'win32' ? `${name}.exe` : name)
  return existsSync(exe) ? exe : name
}

/* ---------------------------------------------------------------- contracts */
function artifact(file, name) {
  const p = join(CONTRACTS, 'out', file, `${name}.json`)
  if (!existsSync(p)) {
    log(`building contracts in ${CONTRACTS}`)
    const r = spawnSync(tool('forge'), ['build', '--root', CONTRACTS], { stdio: 'inherit' })
    if (r.error || r.status !== 0 || !existsSync(p)) {
      fail(`No ${file}/${name} artifact in ${CONTRACTS}. The contract is T-A01: run this from a checkout ` +
        `that has contracts/ (or set CONTRACTS_DIR to one), with Foundry installed (FOUNDRY_BIN).`)
    }
  }
  const j = JSON.parse(readFileSync(p, 'utf8'))
  return { abi: j.abi, bytecode: j.bytecode.object }
}
const Pulse = artifact('PulseForecast.sol', 'PulseForecast')
const Replay = artifact('Mocks.sol', 'MockFeed')

/* ---------------------------------------------------------------- mainnet reads */
const main = createPublicClient({ transport: http(MAINNET_RPC, { retryCount: 4, retryDelay: 600 }) })
const feedAbi = [
  { type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [], outputs: [
    { type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
  { type: 'function', name: 'getRoundData', stateMutability: 'view', inputs: [{ type: 'uint80' }], outputs: [
    { type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
]
const balanceAbi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }]

async function round(id) {
  try {
    const [, answer, , updatedAt] = await main.readContract({ address: FEED, abi: feedAbi, functionName: 'getRoundData', args: [id] })
    return updatedAt === 0n ? null : { id, answer, updatedAt: Number(updatedAt) }
  } catch { return null } // a missing round reverts
}

// The round that was current at t: the largest in the current phase updated at or before t.
async function roundAt(t, phase, aggLatest) {
  const rid = (agg) => (phase << 64n) | agg
  let lo = 1n, hi = aggLatest
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n
    const r = await round(rid(mid))
    if (r && r.updatedAt <= t) lo = mid
    else hi = mid - 1n
  }
  const r = await round(rid(lo))
  const next = await round(rid(lo) + 1n)
  if (!r || !next || r.updatedAt > t || next.updatedAt <= t) fail(`Could not find the Chainlink round current at ${new Date(t * 1000).toISOString()}. Try another BSC_RPC_URL.`)
  return { r, next }
}

async function realBoundaries() {
  const [latestId] = await main.readContract({ address: FEED, abi: feedAbi, functionName: 'latestRoundData' })
  const phase = latestId >> 64n, aggLatest = latestId & ((1n << 64n) - 1n)
  // the day of the block the fork will start from, not the wall clock, so the two agree at midnight
  const today = Number((await main.getBlock()).timestamp / 86400n)
  const out = []
  for (let k = 0; k < DAYS; k++) {
    const day = today - DAYS + 1 + k
    out.push({ day, ...(await roundAt(day * 86400, phase, aggLatest)) })
    log(`  midnight ${new Date(day * 86400000).toISOString().slice(0, 10)}: BNB $${(Number(out[k].r.answer) / 1e8).toFixed(2)}`)
  }
  return out
}

async function realHolders() {
  const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)')
  const found = new Set()
  let to = await main.getBlockNumber()
  for (let i = 0; i < 40 && found.size < HOLDERS; i++) {
    const logs = await main.getLogs({ address: AGENT_ID, event: transfer, fromBlock: to - 2999n, toBlock: to })
    for (const l of logs.reverse()) {
      const a = l.args.to
      if (found.size >= HOLDERS || found.has(a)) continue
      const n = await main.readContract({ address: AGENT_ID, abi: balanceAbi, functionName: 'balanceOf', args: [a] })
      if (n > 0n) found.add(a)
    }
    to -= 3000n
  }
  if (found.size < HOLDERS) fail(`Found only ${found.size} Agent ID holders in recent blocks. Try another BSC_RPC_URL.`)
  return [...found]
}

/* ---------------------------------------------------------------- the fork */
async function startAnvil() {
  try { await fetch(LOCAL, { method: 'POST' }); fail(`Port ${PORT} is already in use. Stop the other node or set FORK_PORT.`) } catch {}
  const anvil = anvilProc = spawn(tool('anvil'), ['--fork-url', MAINNET_RPC, '--port', String(PORT), '--silent'], { stdio: ['ignore', 'inherit', 'inherit'] })
  anvil.on('error', (e) => fail(`anvil did not start (${e.message}). Install Foundry or set FOUNDRY_BIN.`))
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(LOCAL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) })
      if (r.ok) return anvil
    } catch {}
    await new Promise((s) => setTimeout(s, 500))
  }
  fail('anvil did not answer within 60 s. Check the BSC_RPC_URL it forks from.')
}

// Deterministic per-holder style: a bias and a width, with a little day-to-day wobble.
function forecastFor(i, day) {
  const bias = [20, -10, 40, 0, -30][i % 5]
  const width = [260, 320, 200, 420, 160][i % 5]
  let x = (day * 2654435761 + i * 40503) >>> 0
  const wob = () => ((x = (x * 1103515245 + 12345) >>> 0) % 81) - 40 // -40..40
  const p50 = bias + wob()
  const clamp = (v) => Math.max(-5000, Math.min(5000, v))
  return { p10: clamp(p50 - width + wob()), p50, p90: clamp(p50 + width + wob()) }
}
const salt = () => toHex(crypto.getRandomValues(new Uint8Array(32)))

async function run() {
  log(`reading mainnet through ${MAINNET_RPC} (read-only)`)
  const [holders, bounds] = await Promise.all([realHolders(), realBoundaries()])
  log(`real Agent ID holders: ${holders.map((a) => `${a.slice(0, 6)}...${a.slice(-4)}`).join(', ')}`)

  log(`starting anvil on a BSC mainnet fork at ${LOCAL}`)
  const anvil = await startAnvil()
  process.on('SIGINT', () => { anvil.kill(); process.exit(0) })

  const transport = http(LOCAL)
  const local = createPublicClient({ transport })
  const chainId = await local.getChainId()
  const chain = defineChain({ id: chainId, name: 'BSC mainnet fork', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: { default: { http: [LOCAL] } } })
  const test = createTestClient({ mode: 'anvil', chain, transport })
  const wallet = createWalletClient({ chain, transport })
  const [deployer] = await wallet.getAddresses()
  const send = async (req) => {
    const hash = await wallet.writeContract(req)
    const rc = await local.waitForTransactionReceipt({ hash })
    if (rc.status !== 'success') fail(`${req.functionName} reverted on the fork (tx ${hash}).`)
    return rc
  }
  const deploy = async (art, args) => {
    const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args, account: deployer })
    return local.waitForTransactionReceipt({ hash })
  }

  const block = await local.getBlock()
  const D0 = Number(block.timestamp / 86400n)
  const shift = (D0 - bounds[0].day) * 86400 // real midnight k becomes simulated midnight D0 + k

  const replay = await deploy(Replay, [])
  for (const { r, next } of bounds) {
    for (const x of [r, next]) {
      await send({ address: replay.contractAddress, abi: Replay.abi, functionName: 'setRound', args: [x.id, x.answer, BigInt(x.updatedAt + shift)], account: deployer })
    }
  }
  const pulseRc = await deploy(Pulse, [AGENT_ID, replay.contractAddress, MAX_STALE, INITIAL_SIGMA])
  const pulse = pulseRc.contractAddress
  log(`PulseForecast ${pulse} (real Agent ID ${AGENT_ID.slice(0, 6)}..., replay feed ${replay.contractAddress.slice(0, 6)}...)`)
  const read = (functionName, args = []) => local.readContract({ address: pulse, abi: Pulse.abi, functionName, args })

  // A fresh address holds no Agent ID: the contract refuses it.
  const fresh = '0x00000000000000000000000000000000000c0de1'
  try {
    await local.simulateContract({ address: pulse, abi: Pulse.abi, functionName: 'commit', args: [toHex(1, { size: 32 })], account: fresh })
    fail('A fresh address could commit, so the Agent ID gate is not working. Check CONTRACTS_DIR is the T-A01 contract and run forge test there.')
  } catch (e) {
    const name = e?.cause?.data?.errorName ?? e?.cause?.reason ?? e.shortMessage
    if (!String(name).includes('NotAgentIdHolder')) fail(`A fresh address was refused for the wrong reason: ${name}. Expected NotAgentIdHolder; check the contract build matches T-A01.`)
    log('fresh address refused: NotAgentIdHolder')
  }

  for (const h of holders) {
    await test.impersonateAccount({ address: h })
    await test.setBalance({ address: h, value: parseEther('1') })
  }

  const kept = holders.map(() => ({})) // per holder: day -> { p10, p50, p90, salt }
  const gas = []
  for (let k = 0; k < DAYS; k++) {
    const D = D0 + k
    if (k > 0) {
      await test.setNextBlockTimestamp({ timestamp: BigInt(D * 86400 + 900) })
      await test.mine({ blocks: 1 })
    }
    // record the boundary at the start of D, which finalises D - 1
    await send({ address: pulse, abi: Pulse.abi, functionName: 'settle', args: [BigInt(D - 1), bounds[k].r.id], account: deployer })
    for (let i = 0; i < holders.length; i++) {
      const next = { ...forecastFor(i, D + 1), salt: salt() }
      kept[i][D + 1] = next
      const nextCommit = await read('commitHash', [holders[i], BigInt(D + 1), next.p10, next.p50, next.p90, next.salt])
      const cur = kept[i][D]
      const rc = await send({
        address: pulse, abi: Pulse.abi, functionName: 'submit', account: holders[i],
        args: [nextCommit, !!cur, cur?.p10 ?? 0, cur?.p50 ?? 0, cur?.p90 ?? 0, cur?.salt ?? toHex(0, { size: 32 })],
      })
      if (cur && k >= 2) gas.push(Number(rc.gasUsed)) // reveal + commit + score
    }
    const info = await read('dayInfo', [BigInt(D - 1)])
    const status = ['pending', 'settled', 'void'][info.status]
    log(`day ${new Date(D * 86400000).toISOString().slice(0, 10)}: settled the day before (${status}, BNB ${(info.changeBps / 100).toFixed(2)}%), ${holders.length} submits`)
  }

  const s0 = await read('stats', [holders[0]])
  if (Number(s0.daysScored) < 2) fail(`Holder 1 has ${s0.daysScored} scored days; expected at least 2. Check the settle and submit lines above for a day that did not settle.`)
  gas.sort((a, b) => a - b)
  const deployBlock = Number(pulseRc.blockNumber)
  const out = {
    network: 'fork', chainId, rpc: LOCAL, address: pulse, deployBlock, startDay: D0,
    agentId: AGENT_ID, feed: replay.contractAddress, feedIsReplay: true,
    note: 'Local anvil fork of BSC mainnet. Chainlink rounds are real rounds replayed with whole-day shifts.',
  }
  mkdirSync(join(ROOT, 'deployments'), { recursive: true })
  writeFileSync(join(ROOT, 'deployments', 'fork.json'), JSON.stringify(out, null, 2) + '\n')
  log(`submit gas (reveal + commit + score): median ${gas[gas.length >> 1]}, max ${gas[gas.length - 1]}`)
  log(`holder 1: ${s0.daysScored} scored days, ${s0.daysInBand} in band, streak ${s0.beatStreak}`)
  log('wrote deployments/fork.json')
  log(`fork running at ${LOCAL}. Start the website with: cd web && npm run dev:fork. Ctrl+C stops the fork.`)
}

run().catch((e) => fail(e?.shortMessage ?? e?.message ?? String(e)))
