// BNB's live price from Chainlink's BNB/USD feed on BNB Smart Chain: the same feed PulseForecast
// settles and scores against, so the number on the page is the one a forecast is measured on.
// Read-only over a public RPC; no key, no wallet.
import { createPublicClient, http, parseAbi } from 'viem'

export const BNB_USD_FEED = '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE'
const MAINNET_RPC = 'https://bsc-rpc.publicnode.com'
const FEED_ABI = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
])
const STALE_S = 7200 // the contract's maxStale: an older round would void the day

/** Pure: one latestRoundData() result to { usd, ageS, stale }. A non-positive answer is refused. */
export function readRound(round, decimals, nowS) {
  const [, answer, , updatedAt] = round
  if (!(answer > 0n) || !(updatedAt > 0n)) throw new Error('Chainlink returned no BNB price.')
  const ageS = Math.max(0, nowS - Number(updatedAt))
  return { usd: Number(answer) / 10 ** decimals, ageS, stale: ageS > STALE_S }
}

/** BNB price at a % move from `usd`, the move in bps. */
export const usdAt = (usd, bps) => usd * (1 + bps / 10000)

let client
export async function bnbPrice() {
  client ??= createPublicClient({ transport: http(MAINNET_RPC, { retryCount: 1, timeout: 10000 }), batch: { multicall: true } })
  const [round, decimals] = await Promise.all([
    client.readContract({ address: BNB_USD_FEED, abi: FEED_ABI, functionName: 'latestRoundData' }),
    client.readContract({ address: BNB_USD_FEED, abi: FEED_ABI, functionName: 'decimals' }),
  ])
  return readRound(round, Number(decimals), Math.floor(Date.now() / 1000))
}

/**
 * The Chainlink round that was current at time t (the last one updated at or before t), the way
 * PulseForecast.settle() checks it. getRound(id) resolves { id, answer, updatedAt } or null.
 * Guesses from the feed's latest spacing, then reads a window of rounds around the guess at once
 * (one batched request), widening only if the guess missed. Null when t is before the phase began.
 */
export async function findRoundAt(getRound, latestId, t) {
  const phase = (latestId >> 64n) << 64n
  const agg = latestId - phase
  const at = (n) => (n >= 1n && n <= agg ? getRound(phase | n) : Promise.resolve(null))
  const [last, prev] = await Promise.all([at(agg), at(agg - 1n)])
  if (last && last.updatedAt <= t) return last
  const gap = last && prev ? Math.max(1, last.updatedAt - prev.updatedAt) : 1800
  const clamp = (n) => (n < 1n ? 1n : n > agg ? agg : n)
  let center = clamp(last ? agg - BigInt(Math.ceil((last.updatedAt - t) / gap)) : agg)
  for (let span = 8n; span < 4n * agg + 64n; span *= 4n) {
    const from = clamp(center - span), to = clamp(center + span)
    const ids = []
    for (let n = from; n <= to; n++) ids.push(n)
    const rs = (await Promise.all(ids.map(at))).filter(Boolean)
    const before = rs.filter((r) => r.updatedAt <= t)
    const best = before[before.length - 1]
    const after = rs.find((r) => r.updatedAt > t)
    if (best && after) return best
    if (!best && from === 1n) return null
    center = best ? clamp(to + span) : clamp(from - span) // all after t: look earlier; all before: later
  }
  return null
}

const RACE_ABI = parseAbi([
  'function feed() view returns (address)',
  'function boundaryPrice(uint64 day) view returns (int256)',
  'function getRoundData(uint80 id) view returns (uint80, int256, uint256, uint256, uint80)',
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() view returns (uint8)',
])
const PATH_POINTS = 24

/**
 * Today's live race data from the contract's own feed: the price at 00:00 UTC (the contract's
 * recorded boundary if it is set, else the Chainlink round current at 00:00), up to 24 rounds of
 * the path since then, and the latest price. Returns { openUsd, nowUsd, moveBps, points, ageS,
 * refresh }, where points are { t, bps } and refresh() reads the latest round again and returns
 * the same shape. Null when today's opening price cannot be found.
 */
export async function raceData({ rpc, contract, today }) {
  const c = createPublicClient({ transport: http(rpc, { retryCount: 1, timeout: 12000 }), batch: { multicall: true } })
  const read = (address, functionName, args = []) => c.readContract({ address, abi: RACE_ABI, functionName, args })
  const feed = contract ? await read(contract, 'feed') : BNB_USD_FEED
  const [decimals, latest, recorded] = await Promise.all([
    read(feed, 'decimals'), read(feed, 'latestRoundData'), contract ? read(contract, 'boundaryPrice', [BigInt(today)]) : 0n])
  const getRound = async (id) => {
    try { const [, answer, , updatedAt] = await read(feed, 'getRoundData', [id]); return updatedAt > 0n ? { id, answer, updatedAt: Number(updatedAt) } : null } catch { return null }
  }
  const t0 = today * 86400
  let open = recorded > 0n ? recorded : null, openId = null
  const KEY = `kodo:open:${String(feed).toLowerCase()}:${today}`
  if (!open) {
    try { const c = JSON.parse(localStorage.getItem(KEY)); if (c?.id && c?.answer) { openId = BigInt(c.id); open = BigInt(c.answer) } } catch {}
  }
  if (!open) {
    const r = await findRoundAt(getRound, latest[0], t0)
    if (r) {
      open = r.answer; openId = r.id
      try { localStorage.setItem(KEY, JSON.stringify({ id: String(r.id), answer: String(r.answer) })) } catch {}
    }
  }
  if (!open || open <= 0n) return null
  const usd = (a) => Number(a) / 10 ** Number(decimals)
  const bps = (a) => Number(((a - open) * 10000n) / open)
  const points = [{ t: t0, bps: 0 }]
  if (openId !== null && latest[0] >> 64n === openId >> 64n && latest[0] > openId + 1n) {
    const n = latest[0] - openId, k = n < BigInt(PATH_POINTS) ? n : BigInt(PATH_POINTS)
    const ids = Array.from({ length: Number(k) - 1 }, (_, i) => openId + (n * BigInt(i + 1)) / k)
    for (const r of (await Promise.all(ids.map(getRound))).filter(Boolean)) if (r.updatedAt > t0) points.push({ t: r.updatedAt, bps: bps(r.answer) })
  }
  const shape = (l) => {
    const last = { t: Math.max(t0, Number(l[3])), bps: bps(l[1]) }
    if (points[points.length - 1].t < last.t) points.push(last)
    return { openUsd: usd(open), nowUsd: usd(l[1]), moveBps: last.bps, points: points.slice(), ageS: Math.max(0, Math.floor(Date.now() / 1000) - Number(l[3])) }
  }
  return { ...shape(latest), refresh: async () => shape(await read(feed, 'latestRoundData')) }
}
