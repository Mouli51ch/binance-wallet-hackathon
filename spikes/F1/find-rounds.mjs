// T-F01: for the last 7 UTC midnights, find the Chainlink BNB/USD round that was current at the
// boundary (binary search over getRoundData), and measure its age and the feed's heartbeat.
// Read-only. Usage: node spikes/F1/find-rounds.mjs [rpcUrl]
import { writeFileSync } from 'node:fs'

const RPC = process.argv[2] ?? process.env.BSC_RPC_URL ?? 'https://bsc-dataseed.bnbchain.org'
const FEED = '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE'
const DAYS = 7

let id = 0
async function call(data) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'eth_call', params: [{ to: FEED, data }, 'latest'] }),
  })
  if (!res.ok) throw new Error(`RPC ${RPC} answered HTTP ${res.status}. Try another RPC URL as the first argument.`)
  const j = await res.json()
  if (j.error) return null // a missing round reverts
  return j.result
}

const word = (hex, i) => BigInt('0x' + hex.slice(2 + i * 64, 2 + (i + 1) * 64))
const signed = (v) => (v >= 1n << 255n ? v - (1n << 256n) : v)

async function latest() {
  const r = await call('0xfeaf968c')
  return { roundId: word(r, 0), answer: signed(word(r, 1)), updatedAt: Number(word(r, 3)) }
}

async function round(roundId) {
  const r = await call('0x9a6fc8f5' + roundId.toString(16).padStart(64, '0'))
  if (!r || word(r, 3) === 0n) return null
  return { roundId, answer: signed(word(r, 1)), updatedAt: Number(word(r, 3)) }
}

const L = await latest()
const phase = L.roundId >> 64n
const aggLatest = L.roundId & ((1n << 64n) - 1n)
const rid = (agg) => (phase << 64n) | agg
const first = await round(rid(1n))

// Largest round in the current phase updated at or before t.
async function currentAt(t) {
  if (!first || first.updatedAt > t) return null // before this phase: a phase change happened
  let lo = 1n
  let hi = aggLatest
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n
    const r = await round(rid(mid))
    if (r && r.updatedAt <= t) lo = mid
    else hi = mid - 1n
  }
  return round(rid(lo))
}

const today = Math.floor(Date.now() / 1000 / 86400)
const boundaries = []
const gaps = []
for (let d = today - DAYS + 1; d <= today; d++) {
  const t = d * 86400
  const r = await currentAt(t)
  if (!r) {
    boundaries.push({ day: d, utc: new Date(t * 1000).toISOString(), found: false, phaseChange: true })
    continue
  }
  const next = await round(r.roundId + 1n)
  // heartbeat sample: the 10 rounds before the boundary round
  let prev = r
  for (let k = 0; k < 10; k++) {
    const p = await round(prev.roundId - 1n)
    if (!p) break
    gaps.push(prev.updatedAt - p.updatedAt)
    prev = p
  }
  boundaries.push({
    day: d,
    utc: new Date(t * 1000).toISOString(),
    found: true,
    roundId: r.roundId.toString(),
    aggRound: (r.roundId & ((1n << 64n) - 1n)).toString(),
    answer: r.answer.toString(),
    ageSeconds: t - r.updatedAt,
    nextRoundAfterSeconds: next ? next.updatedAt - t : null,
  })
}

gaps.sort((a, b) => a - b)
const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null
const ages = boundaries.filter((b) => b.found).map((b) => b.ageSeconds)
const result = {
  measuredAt: new Date().toISOString(),
  feed: FEED,
  latestRoundId: L.roundId.toString(),
  phase: Number(phase),
  phaseFirstRoundUpdatedAt: first ? new Date(first.updatedAt * 1000).toISOString() : null,
  phaseChangeInWindow: boundaries.some((b) => b.phaseChange),
  medianHeartbeatSeconds: median,
  heartbeatSamples: gaps.length,
  maxAgeAtBoundarySeconds: Math.max(...ages),
  daysOlderThan2h: ages.filter((a) => a > 7200).length,
  boundaries,
}
writeFileSync(new URL('./result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ ...result, boundaries: boundaries.map((b) => `${b.utc} age ${b.ageSeconds}s next +${b.nextRoundAfterSeconds}s`) }, null, 2))
