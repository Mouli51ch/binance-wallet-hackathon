// T-C01 end to end on a local fork of BSC mainnet at its head, against the deployed PulseForecast.
// A real Agent ID holder is impersonated on the fork only; nothing is signed with a key and
// nothing reaches mainnet (mainnet is only read). Two UTC days:
//   day 1  pulse.mjs prepare -> send the calldata -> the commit for tomorrow is on chain
//   day 2  pulse.mjs prepare -> send -> yesterday's numbers revealed from the saved salt + next commit
//   then   prepare again -> refused ("Nothing to send"), and status prints one line
// Run: npm run test:fork   (needs Foundry's anvil; FOUNDRY_BIN if it is not in ~/.foundry/bin)
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, createTestClient, http, parseAbi, parseAbiItem, parseEther } from 'viem'
import { NETWORK, PULSE_ABI } from '../pulse.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const MAINNET = process.env.BSC_RPC_URL ?? NETWORK.rpc
const PORT = Number(process.env.FORK_PORT ?? 8546)
const LOCAL = `http://127.0.0.1:${PORT}`
const AGENT_ID = '0x60b9262456de011f7d15a54cdd8c48baaa8b022f'
const bin = join(process.env.FOUNDRY_BIN ?? join(homedir(), '.foundry', 'bin'), process.platform === 'win32' ? 'anvil.exe' : 'anvil')
const log = (...a) => console.log('[fork-e2e]', ...a)
let anvil
const fail = (m) => { console.error(`[fork-e2e] FAIL: ${m}`); anvil?.kill(); process.exit(1) }

const main = createPublicClient({ transport: http(MAINNET, { retryCount: 2 }) })
const balanceAbi = parseAbi(['function balanceOf(address) view returns (uint256)'])

// a recent Agent ID holder with nothing committed for tomorrow on the live contract
async function holder() {
  const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)')
  const today = await main.readContract({ address: NETWORK.contract, abi: PULSE_ABI, functionName: 'today' })
  let to = await main.getBlockNumber()
  for (let i = 0; i < 40; i++, to -= 3000n) {
    for (const l of (await main.getLogs({ address: AGENT_ID, event: transfer, fromBlock: to - 2999n, toBlock: to })).reverse()) {
      const a = l.args.to
      if ((await main.readContract({ address: AGENT_ID, abi: balanceAbi, functionName: 'balanceOf', args: [a] })) === 0n) continue
      const f = await main.readContract({ address: NETWORK.contract, abi: PULSE_ABI, functionName: 'forecastOf', args: [a, today + 1n] })
      if (f.hash === `0x${'00'.repeat(32)}`) return a
    }
  }
  fail('no Agent ID holder found in recent blocks. Try another BSC_RPC_URL.')
}

async function startAnvil() {
  if (!existsSync(bin)) fail(`anvil not found at ${bin}. Install Foundry or set FOUNDRY_BIN.`)
  anvil = spawn(bin, ['--fork-url', MAINNET, '--port', String(PORT), '--silent'], { stdio: 'inherit' })
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(LOCAL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })).ok) return } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  fail(`anvil did not answer on ${LOCAL} within 60 s. Is port ${PORT} free? Set FORK_PORT.`)
}

const env = { ...process.env, PULSE_STATE: join(mkdtempSync(join(tmpdir(), 'pulse-')), 'state.json') }
function pulse(...args) {
  const r = spawnSync(process.execPath, [join(here, '..', 'pulse.mjs'), ...args, '--rpc', LOCAL], { env, encoding: 'utf8' })
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() }
}

const who = await holder()
log(`holder ${who.slice(0, 6)}...${who.slice(-4)} (impersonated on the fork only)`)
await startAnvil()
const fork = createPublicClient({ transport: http(LOCAL) })
const test = createTestClient({ mode: 'anvil', transport: http(LOCAL) })
await test.impersonateAccount({ address: who })
await test.setBalance({ address: who, value: parseEther('1') })
const read = (functionName, args = []) => fork.readContract({ address: NETWORK.contract, abi: PULSE_ABI, functionName, args })

async function send(prep) {
  const hash = await fetch(LOCAL, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendTransaction', params: [{ from: prep.from, to: prep.to, data: prep.data, value: '0x0' }] }) }).then((r) => r.json())
  if (hash.error) fail(`send reverted: ${hash.error.message}`)
  const rc = await fork.waitForTransactionReceipt({ hash: hash.result })
  if (rc.status !== 'success') fail(`tx ${hash.result} reverted`)
  return rc
}

try {
  // day 1: commit only
  const d1 = await read('today')
  const a = pulse('prepare', '--from', who, '--p10', '-320', '--p50', '15', '--p90', '290')
  if (a.code !== 0) fail(`prepare day 1: ${a.err}`)
  const p1 = JSON.parse(a.out)
  assert.equal(p1.reveal, null)
  assert.equal(p1.commit.p10, -320)
  const rc1 = await send(p1)
  assert.notEqual((await read('forecastOf', [who, d1 + 1n])).hash, `0x${'00'.repeat(32)}`)
  log(`day 1: commit sent, gas ${rc1.gasUsed}. ${p1.summary}`)

  // day 2: one hour into the next UTC day, reveal from the saved salt and commit again
  const ts = (await fork.getBlock()).timestamp
  await test.setNextBlockTimestamp({ timestamp: (ts / 86400n + 1n) * 86400n + 3600n })
  await test.mine({ blocks: 1 })
  const d2 = await read('today')
  assert.equal(d2, d1 + 1n)
  const b = pulse('prepare', '--from', who, '--p10', '-150', '--p50', '0', '--p90', '180')
  if (b.code !== 0) fail(`prepare day 2: ${b.err}`)
  const p2 = JSON.parse(b.out)
  assert.deepEqual([p2.reveal.p10, p2.reveal.p50, p2.reveal.p90], [-320, 15, 290])
  const rc2 = await send(p2)
  const f = await read('forecastOf', [who, d2])
  assert.equal(f.revealed, true)
  assert.deepEqual([f.p10, f.p50, f.p90], [-320, 15, 290])
  assert.notEqual((await read('forecastOf', [who, d2 + 1n])).hash, `0x${'00'.repeat(32)}`)
  log(`day 2: reveal + commit sent, gas ${rc2.gasUsed}. ${p2.summary}`)

  // same day again: nothing left to send
  const c = pulse('prepare', '--from', who, '--p10', '-100', '--p50', '0', '--p90', '100')
  assert.equal(c.code, 1)
  assert.match(c.err, /Nothing to send/)
  log(`day 2 again: refused. ${c.err}`)

  const s = pulse('status', '--from', who)
  assert.equal(s.code, 0)
  assert.equal(s.out.split('\n').length, 1)
  log(`status: ${s.out}`)
  log('PASS')
} catch (e) {
  fail(e.message)
}
anvil.kill()
