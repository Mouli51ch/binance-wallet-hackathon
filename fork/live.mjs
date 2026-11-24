// T-A08: the deployed mainnet PulseForecast and the real Kodo skill, end to end, on a local fork.
//
//   1. forks BNB Smart Chain mainnet at its head with anvil: the live contract from
//      deployments/mainnet.json is on the fork as it is on mainnet (no new deploy)
//   2. swaps the Chainlink BNB/USD feed for a test feed (MockFeed) on the fork only, because a
//      fork receives no new Chainlink rounds; the day's test prices are printed
//   3. finds real Agent ID holders on mainnet with nothing locked for tomorrow, and impersonates
//      them on the fork only
//   4. each simulated day: moves the fork's clock to 01:00 UTC, settles the day before, and every
//      holder runs skills/human-pulse/pulse.mjs prepare and sends the calldata it prints, exactly
//      what an agent would preview and send after the user's yes
//   5. writes deployments/fork.json so `npm run dev:fork` in web/ shows the result
//
// Nothing is signed with a key and nothing is sent to mainnet: mainnet is only read. anvil signs
// for its own unlocked accounts and for impersonated ones, on the fork only.
//
// Run: node live.mjs   (CONTRACTS_DIR: a checkout with contracts/, for the MockFeed bytecode)
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, createTestClient, encodeFunctionData, http, parseAbi, parseAbiItem, parseEther, toHex } from 'viem'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')
const MAINNET_RPC = process.env.BSC_RPC_URL ?? 'https://bsc-rpc.publicnode.com'
const PORT = Number(process.env.FORK_PORT ?? 8547)
const LOCAL = `http://127.0.0.1:${PORT}`
const CONTRACTS = resolve(process.env.CONTRACTS_DIR ?? join(ROOT, 'contracts'))
const FOUNDRY_BIN = process.env.FOUNDRY_BIN ?? join(homedir(), '.foundry', 'bin')
const PULSE = join(ROOT, 'skills', 'human-pulse', 'pulse.mjs')
const HOLDERS = Number(process.env.HOLDERS ?? 4)
const DAYS = 6 // 6 midnights: every holder ends with 5 scored days, enough to rank
// Test BNB moves for the simulated days, in bps. Made up, not real prices: the fork has no future.
const MOVES = [-120, 85, -210, 140, 30, -60, 95]
// Each holder's style: a bias and a half-width in bps, so the leaderboard has some spread.
const STYLES = [[10, 180], [-20, 260], [30, 120], [0, 340], [-10, 220]]

const log = (...a) => console.log('[live]', ...a)
let anvil = null
const fail = (msg) => { console.error(`[live] ${msg}`); anvil?.kill(); process.exit(1) }
const tool = (name) => { const exe = join(FOUNDRY_BIN, process.platform === 'win32' ? `${name}.exe` : name); return existsSync(exe) ? exe : name }

/* ---------------------------------------------------------------- inputs */
const deployment = (() => {
  const p = join(ROOT, 'deployments', 'mainnet.json')
  if (!existsSync(p)) fail('No deployments/mainnet.json. This test runs the deployed contract: pull main, which has it.')
  const d = JSON.parse(readFileSync(p, 'utf8'))
  const address = d.address ?? d.PulseForecast, block = d.deployBlock ?? d.block
  if (!address || !block) fail('deployments/mainnet.json has no contract address or deploy block. Fix the file, then run again.')
  return { address, block, feed: d.feed ?? '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE', agentId: d.agentId ?? '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F' }
})()
if (!existsSync(join(ROOT, 'skills', 'human-pulse', 'node_modules'))) fail('The Kodo skill has no node_modules. Run npm install in skills/human-pulse, then run again.')

function mockFeedCode() {
  const p = join(CONTRACTS, 'out', 'Mocks.sol', 'MockFeed.json')
  if (!existsSync(p)) {
    log(`building contracts in ${CONTRACTS}`)
    const r = spawnSync(tool('forge'), ['build', '--root', CONTRACTS], { stdio: 'inherit' })
    if (r.error || r.status !== 0 || !existsSync(p)) fail(`No MockFeed artifact in ${CONTRACTS}. Set CONTRACTS_DIR to a checkout that has contracts/ (T-A01), with Foundry installed.`)
  }
  return JSON.parse(readFileSync(p, 'utf8')).deployedBytecode.object
}

const PULSE_ABI = parseAbi([
  'function today() view returns (uint64)',
  'function nextBoundary() view returns (uint64)',
  'function settle(uint64 day, uint80 roundId)',
  'function score(address voter, uint64 day)',
  'function forecastOf(address voter, uint64 day) view returns ((bytes32 hash, int32 p10, int32 p50, int32 p90, bool revealed, bool scored))',
  'function stats(address voter) view returns ((uint32 daysCommitted, uint32 daysScored, uint32 missedReveals, uint32 daysInBand, uint32 beatStreak, uint64 lastScoredDay, uint128 totalLoss, uint128 totalBaselineLoss))',
  'function dayInfo(uint64 day) view returns ((uint8 status, int32 changeBps, uint32 sigmaBps, uint32 reveals, int256 openPrice, int256 closePrice, uint256 crowdLoss, uint256 baselineLoss))',
])
const FEED_ABI = parseAbi([
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function setRound(uint80 id, int256 answer, uint256 updatedAt)',
])
const balanceAbi = parseAbi(['function balanceOf(address) view returns (uint256)'])

/* ---------------------------------------------------------------- mainnet reads */
const main = createPublicClient({ transport: http(MAINNET_RPC, { retryCount: 4, retryDelay: 600 }) })

// recent Agent ID holders with nothing locked for tomorrow on the live contract
async function holders(today) {
  const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)')
  const found = []
  let to = await main.getBlockNumber()
  for (let i = 0; i < 40 && found.length < HOLDERS; i++, to -= 3000n) {
    for (const l of (await main.getLogs({ address: deployment.agentId, event: transfer, fromBlock: to - 2999n, toBlock: to })).reverse()) {
      const a = l.args.to
      if (found.length >= HOLDERS || found.includes(a)) continue
      if ((await main.readContract({ address: deployment.agentId, abi: balanceAbi, functionName: 'balanceOf', args: [a] })) === 0n) continue
      const f = await main.readContract({ address: deployment.address, abi: PULSE_ABI, functionName: 'forecastOf', args: [a, today + 1n] })
      if (f.hash === `0x${'00'.repeat(32)}`) found.push(a)
    }
  }
  if (found.length < HOLDERS) fail(`Found only ${found.length} Agent ID holders in recent blocks. Try another BSC_RPC_URL.`)
  return found
}

/* ---------------------------------------------------------------- the fork */
async function rpc(method, params = []) {
  const r = await fetch(LOCAL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json())
  if (r.error) throw new Error(r.error.message)
  return r.result
}
async function startAnvil() {
  try { await fetch(LOCAL, { method: 'POST' }); fail(`Port ${PORT} is already in use. Stop the other node (another fork run?) or set FORK_PORT.`) } catch {}
  anvil = spawn(tool('anvil'), ['--fork-url', MAINNET_RPC, '--port', String(PORT), '--silent'], { stdio: 'inherit' })
  anvil.on('error', (e) => fail(`anvil did not start (${e.message}). Install Foundry or set FOUNDRY_BIN.`))
  for (let i = 0; i < 120; i++) {
    try { await rpc('eth_chainId'); return } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  fail(`anvil did not answer on ${LOCAL} within 60 s. Check the BSC_RPC_URL it forks from.`)
}

const stateFile = join(mkdtempSync(join(tmpdir(), 'kodo-live-')), 'state.json')
// the real skill, as an agent runs it; its JSON is what the agent previews and the user confirms
function prepare(who, [p10, p50, p90]) {
  const r = spawnSync(process.execPath, [PULSE, 'prepare', '--from', who, '--p10', String(p10), '--p50', String(p50), '--p90', String(p90), '--rpc', LOCAL],
    { env: { ...process.env, PULSE_STATE: stateFile }, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`pulse.mjs prepare for ${who.slice(0, 6)}: ${r.stderr.trim()}`)
  return JSON.parse(r.stdout)
}

/* ---------------------------------------------------------------- run */
const today0 = Number((await main.getBlock()).timestamp / 86400n)
const who = await holders(BigInt(today0))
log(`deployed PulseForecast ${deployment.address}, real Agent ID holders: ${who.map((a) => `${a.slice(0, 6)}...${a.slice(-4)}`).join(', ')}`)
log(`starting anvil on a fork of BSC mainnet at ${LOCAL}`)
await startAnvil()
process.on('SIGINT', () => { anvil?.kill(); process.exit(0) })
process.on('exit', () => anvil?.kill())

try {
  const fork = createPublicClient({ transport: http(LOCAL) })
  const test = createTestClient({ mode: 'anvil', transport: http(LOCAL) })
  const read = (functionName, args = []) => fork.readContract({ address: deployment.address, abi: PULSE_ABI, functionName, args })
  const [keeper] = await rpc('eth_accounts')
  const send = async (from, to, data) => {
    const hash = await rpc('eth_sendTransaction', [{ from, to, data, value: '0x0' }])
    const rc = await fork.waitForTransactionReceipt({ hash })
    if (rc.status !== 'success') throw new Error(`transaction ${hash} reverted`)
    return rc
  }
  const now = Number((await fork.getBlock()).timestamp)
  if (86400 - (now % 86400) < 1200) fail('The UTC day ends in under 20 minutes. Run this after 00:00 UTC, so the first forecasts land on the right day.')

  // the test feed: same address, MockFeed code, its `latest` slot cleared of the proxy's storage
  const [, realAnswer] = await main.readContract({ address: deployment.feed, abi: FEED_ABI, functionName: 'latestRoundData' })
  await test.setCode({ address: deployment.feed, bytecode: mockFeedCode() })
  await test.setStorageAt({ address: deployment.feed, index: 1, value: toHex(0n, { size: 32 }) })
  const D0 = Number(await read('today'))
  let b = Number(await read('nextBoundary'))
  if (b > D0) fail(`The live contract already settled up to boundary ${b}. This test expects today's boundary to be next; run it on a fresh fork day.`)
  // one round per boundary from the next unsettled one to the last simulated day, a minute before 00:00
  const bounds = []
  let price = realAnswer
  for (let d = b, k = 0; d <= D0 + DAYS; d++) {
    if (d > D0) price = (price * BigInt(10000 + MOVES[k++ % MOVES.length])) / 10000n
    bounds.push({ day: d, id: BigInt(bounds.length + 1), price })
  }
  for (const r of bounds) {
    await send(keeper, deployment.feed, encodeSetRound(r.id, r.price, BigInt(r.day * 86400 - 60)))
  }
  log(`test feed: ${bounds.length} rounds from $${(Number(realAnswer) / 1e8).toFixed(2)} (the real price now), moves ${MOVES.slice(0, DAYS).map((m) => `${m > 0 ? '+' : ''}${(m / 100).toFixed(2)}%`).join(', ')}`)

  for (const a of who) { await test.impersonateAccount({ address: a }); await test.setBalance({ address: a, value: parseEther('1') }) }
  const settleUpTo = async (D) => {
    for (; b <= D; b++) {
      const r = bounds.find((x) => x.day === b)
      await send(keeper, deployment.address, encodeSettle(BigInt(b - 1), r.id))
    }
  }
  const gas = []
  for (let k = 0; k <= DAYS; k++) {
    const D = D0 + k
    if (k > 0) {
      await test.setNextBlockTimestamp({ timestamp: BigInt(D * 86400 + 3600) })
      await test.mine({ blocks: 1 })
    }
    await settleUpTo(D)
    for (let i = 0; i < who.length; i++) {
      const [bias, half] = STYLES[i % STYLES.length]
      const wob = ((D * 37 + i * 53) % 41) - 20
      const p50 = bias + wob
      const prep = prepare(who[i], [p50 - half, p50, p50 + half])
      if (k === DAYS && i === who.length - 1) {
        // skips opening today, so the site shows one sealed tile; yesterday still gets scored,
        // by anyone, as the keeper would
        await send(keeper, deployment.address, encodeFn(PULSE_ABI, 'score', [who[i], BigInt(D - 1)]))
        log(`day ${dayIso(D)}: ${who[i].slice(0, 6)} skips today, so its forecast stays sealed`)
        continue
      }
      const rc = await send(who[i], prep.to, prep.data)
      gas.push(Number(rc.gasUsed))
    }
    const info = await read('dayInfo', [BigInt(D - 1)])
    const sent = k === DAYS ? who.length - 1 : who.length
    log(`day ${dayIso(D)}: settled ${dayIso(D - 1)} (${['pending', 'settled', 'void'][info.status]}${info.status === 1 ? `, BNB ${(info.changeBps / 100).toFixed(2)}%` : ''}), ${sent} holders sent pulse.mjs calldata`)
  }

  const stats = await Promise.all(who.map((a) => read('stats', [a])))
  stats.forEach((s, i) => log(`  ${who[i].slice(0, 6)}...${who[i].slice(-4)}: ${s.daysScored} scored, ${s.daysInBand} in band, streak ${s.beatStreak}, missed ${s.missedReveals}`))
  if (stats.some((s) => s.daysScored < 5)) throw new Error('a holder has fewer than 5 scored days')
  gas.sort((x, y) => x - y)
  log(`submit gas from pulse.mjs calldata: median ${gas[gas.length >> 1].toLocaleString('en-US')}, max ${gas[gas.length - 1].toLocaleString('en-US')}`)

  const out = join(ROOT, 'deployments', 'fork.json')
  writeFileSync(out, JSON.stringify({
    network: 'fork', chainId: 56, rpc: LOCAL, address: deployment.address, deployBlock: deployment.block,
    note: 'Local anvil fork of BSC mainnet running the deployed PulseForecast. The Chainlink feed is a test feed with made-up moves; the holders are real Agent ID holders impersonated on the fork only.',
  }, null, 2) + '\n')
  log(`wrote ${out}. In web/: npm run dev:fork`)
  log(`fork running at ${LOCAL}, on ${dayIso(D0 + DAYS)}. Ctrl+C to stop.`)
} catch (e) {
  fail(`${e.shortMessage ?? e.message}. Nothing reached mainnet. Fix the cause above and run again.`)
}

function dayIso(d) { return new Date(d * 86400000).toISOString().slice(0, 10) }
function encodeSettle(day, roundId) {
  return encodeFn(PULSE_ABI, 'settle', [day, roundId])
}
function encodeSetRound(id, answer, updatedAt) {
  return encodeFn(FEED_ABI, 'setRound', [id, answer, updatedAt])
}
function encodeFn(abi, functionName, args) { return encodeFunctionData({ abi, functionName, args }) }
