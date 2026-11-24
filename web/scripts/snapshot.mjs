// Writes web/public/snapshot.json: the contract's event history from its deploy block to now, so a
// first-time visitor reads only the blocks after this snapshot instead of everything (T-B03).
// Run before each deploy: `npm run snapshot`. Read-only; the site works without the file.
import { readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, http } from 'viem'
import { packLogs, readLogs } from '../src/chain.js'

const dep = JSON.parse(readFileSync(new URL('../../deployments/mainnet.json', import.meta.url), 'utf8'))
const address = dep.address ?? dep.PulseForecast
const from = BigInt(dep.deployBlock ?? dep.block)
if (!address || !from) { console.error('snapshot: deployments/mainnet.json has no address or deploy block. Fix it, then run again.'); process.exit(1) }
const client = createPublicClient({ transport: http(process.env.BSC_RPC_URL ?? 'https://bsc-rpc.publicnode.com', { retryCount: 3, timeout: 30000 }) })
const t = Date.now()
const to = await client.getBlockNumber()
const logs = await readLogs(client, address, from, to)
writeFileSync(new URL('../public/snapshot.json', import.meta.url), JSON.stringify({ network: 'mainnet', address, from: String(from), to: String(to), logs: packLogs(logs) }))
console.log(`snapshot: ${logs.length} events from block ${from} to ${to} in ${((Date.now() - t) / 1000).toFixed(1)} s`)
