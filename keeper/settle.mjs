// Human Pulse keeper. Run just after 00:00 UTC:
//   1. settle every day boundary that has passed (strictly in order, as the contract requires),
//      using the Chainlink round that was current at that boundary;
//   2. score every holder who committed for a recently settled day and is not scored yet.
// Anyone can do both by hand; this only saves people the trouble.
//
//   node keeper/settle.mjs --dry-run      reads only, sends 0 transactions
//   node keeper/settle.mjs                sends transactions with KEEPER_PRIVATE_KEY
//
// Env: RPC_URL (required), NETWORK (mainnet | testnet, default mainnet), PULSE_ADDRESS and
// PULSE_FROM_BLOCK (else read from deployments/<NETWORK>.json), KEEPER_PRIVATE_KEY,
// LOG_CHUNK (blocks per log query, default 5000), SCORE_DAYS (settled days to sweep, default 3).
import { readFileSync, existsSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const DRY = process.argv.includes('--dry-run')
const DAY = 86400n
const MASK64 = (1n << 64n) - 1n

const pulseAbi = parseAbi([
  'function nextBoundary() view returns (uint64)',
  'function feed() view returns (address)',
  'function settle(uint64 day, uint80 roundId)',
  'function score(address voter, uint64 day)',
  'function dayInfo(uint64 day) view returns ((uint8 status, int32 changeBps, uint32 sigmaBps, uint32 reveals, int256 openPrice, int256 closePrice, uint256 crowdLoss, uint256 baselineLoss))',
  'function forecastOf(address voter, uint64 day) view returns ((bytes32 hash, int32 p10, int32 p50, int32 p90, bool revealed, bool scored))',
  'event Committed(address indexed voter, uint64 indexed day)',
])
const feedAbi = parseAbi([
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function getRoundData(uint80) view returns (uint80, int256, uint256, uint256, uint80)',
])
const SETTLED = 1

function fail(msg) {
  console.error(`keeper: ${msg}`)
  process.exit(1)
}

function config() {
  const network = process.env.NETWORK ?? 'mainnet'
  const rpc = process.env.RPC_URL
  if (!rpc) fail('RPC_URL is not set. Put it in .env or the BSC_RPC_URL GitHub secret (OP-6).')
  let address = process.env.PULSE_ADDRESS
  let fromBlock = process.env.PULSE_FROM_BLOCK ? BigInt(process.env.PULSE_FROM_BLOCK) : undefined
  const file = new URL(`../deployments/${network}.json`, import.meta.url)
  if (!address && existsSync(file)) {
    const d = JSON.parse(readFileSync(file, 'utf8'))
    address = d.PulseForecast
    fromBlock ??= d.block !== undefined ? BigInt(d.block) : undefined
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? '')) {
    fail(`no contract address. Set PULSE_ADDRESS or deploy first so deployments/${network}.json exists (T-A03).`)
  }
  const key = process.env.KEEPER_PRIVATE_KEY
  if (!DRY && !/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) {
    fail('KEEPER_PRIVATE_KEY is missing or malformed. Set it in .env or the GitHub secret (OP-6), or pass --dry-run.')
  }
  return {
    rpc,
    address,
    fromBlock: fromBlock ?? 0n,
    key,
    chunk: BigInt(process.env.LOG_CHUNK ?? 5000),
    scoreDays: Number(process.env.SCORE_DAYS ?? 3),
  }
}

const cfg = config()
const pub = createPublicClient({ transport: http(cfg.rpc) })
const wallet = DRY ? null : createWalletClient({ account: privateKeyToAccount(cfg.key), transport: http(cfg.rpc) })
const pulse = (functionName, args = []) =>
  pub.readContract({ address: cfg.address, abi: pulseAbi, functionName, args })

let feed
async function round(id) {
  try {
    const [, answer, , updatedAt] = await pub.readContract({ address: feed, abi: feedAbi, functionName: 'getRoundData', args: [id] })
    return updatedAt === 0n ? null : { id, answer, updatedAt }
  } catch {
    return null // the proxy reverts for a round that does not exist
  }
}

/** Highest aggregator round that exists in `phase`, by doubling then bisecting. */
async function lastInPhase(phase) {
  const base = phase << 64n
  let hi = 1n
  while (await round(base | (hi * 2n))) hi *= 2n
  let lo = hi
  hi *= 2n
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n
    if (await round(base | mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** The round that was current at unix time t: the last one updated at or before t. */
async function roundAt(t) {
  const [latestId, , , latestAt] = await pub.readContract({ address: feed, abi: feedAbi, functionName: 'latestRoundData' })
  if (latestAt <= t) return latestId
  // The current phase, then the one before it if the boundary predates the current phase.
  for (let phase = latestId >> 64n, tries = 0; phase > 0n && tries < 2; phase--, tries++) {
    const base = phase << 64n
    const first = await round(base | 1n)
    if (!first || first.updatedAt > t) continue
    let lo = 1n
    let hi = phase === latestId >> 64n ? latestId & MASK64 : await lastInPhase(phase)
    while (lo < hi) {
      const mid = (lo + hi + 1n) / 2n
      const r = await round(base | mid)
      if (r && r.updatedAt <= t) lo = mid
      else hi = mid - 1n
    }
    return base | lo
  }
  fail(`no Chainlink round found at or before ${new Date(Number(t) * 1000).toISOString()}. Check the feed address and RPC.`)
}

/** First block with timestamp >= t, between the deploy block and `latest`. */
async function blockAt(t, latest) {
  let lo = cfg.fromBlock
  let hi = latest.number
  if (latest.timestamp < t) return hi
  while (lo < hi) {
    const mid = (lo + hi) / 2n
    const b = await pub.getBlock({ blockNumber: mid })
    if (b.timestamp >= t) hi = mid
    else lo = mid + 1n
  }
  return lo
}

async function send(functionName, args) {
  const label = `${functionName}(${args.join(', ')})`
  try {
    await pub.simulateContract({ address: cfg.address, abi: pulseAbi, functionName, args, account: wallet?.account ?? cfg.address })
  } catch (e) {
    console.log(`skip ${label}: ${e.shortMessage ?? e.message}`)
    return false
  }
  if (DRY) {
    console.log(`dry-run: would send ${label}`)
    return true
  }
  const hash = await wallet.writeContract({ address: cfg.address, abi: pulseAbi, functionName, args, chain: null })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') fail(`${label} reverted in ${hash}. Check the day and round on BscScan, then rerun.`)
  console.log(`sent ${label}: ${hash}`)
  return true
}

feed = await pulse('feed')
const latest = await pub.getBlock()
const now = latest.timestamp

// 1. Settle every passed boundary, in order. A dry run cannot advance nextBoundary, so it plans one.
let nb = await pulse('nextBoundary')
for (let n = 0; nb * DAY <= now && n < 30; n++) {
  const roundId = await roundAt(nb * DAY)
  const ok = await send('settle', [nb - 1n, roundId])
  if (!ok || DRY) break
  nb += 1n
}
if (nb * DAY > now) console.log(`settled up to ${new Date(Number((nb - 1n) * DAY) * 1000).toISOString()}`)

// 2. Score the last few settled days. Commits for day D are sent during day D - 1.
const lastSettled = (DRY ? await pulse('nextBoundary') : nb) - 2n
for (let d = lastSettled; d > lastSettled - BigInt(cfg.scoreDays) && d > 0n; d--) {
  const info = await pulse('dayInfo', [d])
  if (info.status !== SETTLED) continue
  const from = await blockAt((d - 1n) * DAY, latest)
  const to = await blockAt(d * DAY, latest)
  const voters = new Set()
  for (let a = from; a <= to; a += cfg.chunk) {
    const b = a + cfg.chunk - 1n < to ? a + cfg.chunk - 1n : to
    const logs = await pub.getContractEvents({ address: cfg.address, abi: pulseAbi, eventName: 'Committed', args: { day: d }, fromBlock: a, toBlock: b })
    for (const l of logs) voters.add(l.args.voter)
  }
  let scored = 0
  for (const v of voters) {
    const f = await pulse('forecastOf', [v, d])
    if (!f.scored && (await send('score', [v, d]))) scored++
  }
  console.log(`day ${d}: ${voters.size} committed, ${scored} scored now`)
}
