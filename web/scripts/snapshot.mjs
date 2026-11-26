// Writes web/public/snapshot.json: the contract's event history from its deploy block to now, so a
// visitor reads only the blocks after this snapshot (T-B03). Run before each deploy:
// `npm run snapshot`. Read-only; the site works without the file.
//
// Most free public BSC RPCs keep event history for only about a day (publicnode: about 100,000
// blocks; checked 2026-11-25) and answer older blocks with no events instead of an error.
// rpc-bsc.48.club keeps all of it (checked 2026-11-26), so it is the default here. The script
// starts from the previous snapshot (the local file, else the live site's), adds only new events,
// and fails loudly when the RPC it uses has pruned the blocks it needs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, http } from 'viem'
import { mergeLogs, packLogs, readLogs, unpackLogs } from '../src/chain.js'

const BASES = [process.env.SNAPSHOT_BASE, 'https://kodo-forecast.vercel.app/snapshot.json'].filter(Boolean) // newest wins
const RPC_HISTORY = 100000n // blocks of event history a pruning public RPC still serves
const REORG = 30n
const dep = JSON.parse(readFileSync(new URL('../../deployments/mainnet.json', import.meta.url), 'utf8'))
const address = dep.address ?? dep.PulseForecast
const deployBlock = BigInt(dep.deployBlock ?? dep.block)
const out = new URL('../public/snapshot.json', import.meta.url)

const parse = (s) => (s && String(s.address).toLowerCase() === String(address).toLowerCase()
  ? { from: BigInt(s.from), to: BigInt(s.to), logs: unpackLogs(s.logs), recovered: s.recovered } : null)
const local = existsSync(out) ? parse(JSON.parse(readFileSync(out, 'utf8'))) : null
const remote = await Promise.all(BASES.map((u) => fetch(`${u}?c=${Date.now()}`).then((r) => (r.ok ? r.json() : null)).then(parse).catch(() => null)))
const base = [local, ...remote].filter((b) => b && b.from <= deployBlock).sort((a, b) => (a.to > b.to ? -1 : 1))[0]

const client = createPublicClient({ transport: http(process.env.BSC_RPC_URL ?? 'https://rpc-bsc.48.club', { retryCount: 3, timeout: 30000 }) })
const t = Date.now()
const head = await client.getBlockNumber()
const start = base ? (base.to - REORG > deployBlock ? base.to - REORG : deployBlock) : deployBlock
// every BSC block has some event, so an RPC that returns none for the oldest block needed has pruned it
if (head - start > RPC_HISTORY && (await client.getLogs({ fromBlock: start, toBlock: start })).length === 0) {
  console.error(`snapshot: the RPC returns no events for block ${start}, so it has pruned the history this snapshot needs. ` +
    'Set BSC_RPC_URL to an RPC that keeps the full event history (rpc-bsc.48.club does) and run it again. Nothing was written.')
  process.exit(1)
}
const fresh = await readLogs(client, address, start, head, 8) // 48.club times out on 32 at once
const logs = mergeLogs([base ? base.logs.filter((l) => l.blockNumber < start) : [], fresh], deployBlock)
mkdirSync(new URL('./', out), { recursive: true }) // web/public is not in git
writeFileSync(out, JSON.stringify({ network: 'mainnet', address, from: String(deployBlock), to: String(head), logs: packLogs(logs), ...(base?.recovered ? { recovered: base.recovered } : {}) }))
console.log(`snapshot: ${logs.length} events to block ${head} (${fresh.length} new since block ${start}, base: ${base === local ? 'local file' : base ? 'remote copy' : 'none'}) in ${((Date.now() - t) / 1000).toFixed(1)} s`)
