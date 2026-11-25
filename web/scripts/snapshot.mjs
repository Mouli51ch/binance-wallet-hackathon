// Writes web/public/snapshot.json: the contract's event history from its deploy block to now, so a
// visitor reads only the blocks after this snapshot (T-B03). Run before each deploy:
// `npm run snapshot`. Read-only; the site works without the file.
//
// Free public BSC RPCs keep event history for only about a day (publicnode: about 100,000
// blocks; checked 2026-11-25), so a snapshot can never be rebuilt from scratch later. This script
// therefore starts from the previous snapshot (the local file, else the live site's) and only adds
// new events, and it fails loudly when the gap since the previous snapshot can no longer be read.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, http } from 'viem'
import { mergeLogs, packLogs, readLogs, unpackLogs } from '../src/chain.js'

const LIVE = process.env.SNAPSHOT_BASE ?? 'https://kodo-forecast.vercel.app/snapshot.json'
const RPC_HISTORY = 100000n // blocks of event history the public RPC still serves
const REORG = 30n
const dep = JSON.parse(readFileSync(new URL('../../deployments/mainnet.json', import.meta.url), 'utf8'))
const address = dep.address ?? dep.PulseForecast
const deployBlock = BigInt(dep.deployBlock ?? dep.block)
const out = new URL('../public/snapshot.json', import.meta.url)

const parse = (s) => (s && String(s.address).toLowerCase() === String(address).toLowerCase()
  ? { from: BigInt(s.from), to: BigInt(s.to), logs: unpackLogs(s.logs), recovered: s.recovered } : null)
const local = existsSync(out) ? parse(JSON.parse(readFileSync(out, 'utf8'))) : null
const live = await fetch(`${LIVE}?c=${Date.now()}`).then((r) => (r.ok ? r.json() : null)).then(parse).catch(() => null)
const base = [local, live].filter((b) => b && b.from <= deployBlock).sort((a, b) => (a.to > b.to ? -1 : 1))[0]

const client = createPublicClient({ transport: http(process.env.BSC_RPC_URL ?? 'https://bsc-rpc.publicnode.com', { retryCount: 3, timeout: 30000 }) })
const t = Date.now()
const head = await client.getBlockNumber()
const start = base ? (base.to - REORG > deployBlock ? base.to - REORG : deployBlock) : deployBlock
if (head - start > RPC_HISTORY) {
  console.error(`snapshot: blocks ${start} to ${head - RPC_HISTORY} are older than the public RPC keeps, so events in them cannot be read any more.` +
    (base ? ' The previous snapshot is too old: refresh the snapshot at least once a day.' : ' No previous snapshot was found: get the live site\'s snapshot.json into web/public first.') +
    ' Nothing was written.')
  process.exit(1)
}
const fresh = await readLogs(client, address, start, head)
const logs = mergeLogs([base ? base.logs.filter((l) => l.blockNumber < start) : [], fresh], deployBlock)
writeFileSync(out, JSON.stringify({ network: 'mainnet', address, from: String(deployBlock), to: String(head), logs: packLogs(logs), ...(base?.recovered ? { recovered: base.recovered } : {}) }))
console.log(`snapshot: ${logs.length} events to block ${head} (${fresh.length} new since block ${start}, base: ${base === local ? 'local file' : base ? 'live site' : 'none'}) in ${((Date.now() - t) / 1000).toFixed(1)} s`)
