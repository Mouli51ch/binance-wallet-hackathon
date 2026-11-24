// T-B02: read PulseForecast with viem and hand the page the same shape as mock-data.js.
// Read-only: a public client over HTTP, no wallet, no signing.
//
// Which contract is read comes from one place, config.js. Units: forecasts and changes are
// in bps; the contract keeps losses in tenths of a bps, so toView() divides them by 10.
import { createPublicClient, http, parseAbi } from 'viem'

export const PULSE_ABI = parseAbi([
  'function today() view returns (uint64)',
  'function startDay() view returns (uint64)',
  'function dayInfo(uint64 day) view returns ((uint8 status, int32 changeBps, uint32 sigmaBps, uint32 reveals, int256 openPrice, int256 closePrice, uint256 crowdLoss, uint256 baselineLoss))',
  'function crowdBand(uint64 day) view returns (int32 p10, int32 p50, int32 p90, uint32 n)',
  'function baselineBand(uint64 day) view returns (int32 p10, int32 p50, int32 p90)',
  'function stats(address voter) view returns ((uint32 daysCommitted, uint32 daysScored, uint32 missedReveals, uint32 daysInBand, uint32 beatStreak, uint64 lastScoredDay, uint128 totalLoss, uint128 totalBaselineLoss))',
  'event Committed(address indexed voter, uint64 indexed day)',
  'event Revealed(address indexed voter, uint64 indexed day, int32 p10, int32 p50, int32 p90)',
  'event Settled(uint64 indexed day, int256 openPrice, int256 closePrice, int32 changeBps, uint256 crowdLoss, uint256 baselineLoss)',
  'event Scored(address indexed voter, uint64 indexed day, uint256 loss, uint256 baselineLoss, bool inBand)',
])
const EVENTS = PULSE_ABI.filter((x) => x.type === 'event')
const LOG_SPAN = 5000n // public RPCs cap eth_getLogs ranges
const LOG_PARALLEL = 6
const LOOKBACK_DAYS = 14n

const STATUS = ['pending', 'settled', 'void']
const tenths = (x) => Number(x) / 10

/** Pure: one day's chain reads to the page's day shape. Tested in test/chain.test.js. */
export function toDay(info, crowd, baseline, committed) {
  const [c10, c50, c90, n] = crowd
  const [b10, b50, b90] = baseline
  const status = STATUS[Number(info.status)] ?? 'pending'
  return {
    committed,
    revealed: Number(n),
    crowd: Number(n) > 0 ? { p10: c10, p50: c50, p90: c90 } : null,
    baseline: { p10: b10, p50: b50, p90: b90 },
    settled: status === 'settled',
    void: status === 'void',
    changeBps: status === 'settled' ? info.changeBps : undefined,
    crowdLoss: tenths(info.crowdLoss),
    baselineLoss: tenths(info.baselineLoss),
  }
}

/** Pure: one stats(voter) tuple to the page's holder shape (losses in bps). */
export function toHolder(address, s) {
  return {
    address,
    daysCommitted: Number(s.daysCommitted),
    daysScored: Number(s.daysScored),
    totalLoss: tenths(s.totalLoss),
    totalBaselineLoss: tenths(s.totalBaselineLoss),
    daysInBand: Number(s.daysInBand),
    missedReveals: Number(s.missedReveals),
    streak: Number(s.beatStreak),
  }
}

/** Pure: decoded events to per-day and per-voter history (losses in bps). Tested in test/chain.test.js. */
export function toHistory(events, sigmaByDay = {}) {
  const days = {}, voters = {}
  const day = (d) => (days[d] ??= { day: d, committed: 0, sums: [0, 0, 0], revealed: 0 })
  const voter = (a) => (voters[a] ??= { committed: {}, forecasts: {}, scores: {} })
  for (const e of events) {
    const d = Number(e.args.day)
    if (e.eventName === 'Committed') { day(d).committed++; voter(e.args.voter).committed[d] = true }
    if (e.eventName === 'Revealed') {
      const x = day(d), { p10, p50, p90 } = e.args
      x.sums[0] += p10; x.sums[1] += p50; x.sums[2] += p90; x.revealed++
      voter(e.args.voter).forecasts[d] = { p10, p50, p90 }
    }
    if (e.eventName === 'Settled') {
      day(d).result = { changeBps: e.args.changeBps, crowdLoss: tenths(e.args.crowdLoss), baselineLoss: tenths(e.args.baselineLoss),
        openPrice: Number(e.args.openPrice) / 1e8, closePrice: Number(e.args.closePrice) / 1e8 }
    }
    if (e.eventName === 'Scored') {
      voter(e.args.voter).scores[d] = { loss: tenths(e.args.loss), baselineLoss: tenths(e.args.baselineLoss), inBand: e.args.inBand }
    }
  }
  for (const x of Object.values(days)) {
    x.crowd = x.revealed ? { p10: Math.trunc(x.sums[0] / x.revealed), p50: Math.trunc(x.sums[1] / x.revealed), p90: Math.trunc(x.sums[2] / x.revealed) } : null
    const sigma = sigmaByDay[x.day]
    if (sigma != null) { const h = Math.floor((sigma * 12816) / 10000); x.baseline = { p10: -h, p50: 0, p90: h } }
    delete x.sums
  }
  return { days, voters }
}

async function scanEvents(client, cfg) {
  const head = await client.getBlock()
  const back = await client.getBlock({ blockNumber: head.number > 1000n ? head.number - 1000n : 0n })
  const perDay = head.timestamp > back.timestamp ? (86400n * (head.number - back.number)) / (head.timestamp - back.timestamp) : 0n
  const windowStart = head.number - perDay * LOOKBACK_DAYS
  let from = BigInt(cfg.deployBlock) > windowStart ? BigInt(cfg.deployBlock) : windowStart
  const spans = []
  for (; from <= head.number; from += LOG_SPAN) spans.push([from, from + LOG_SPAN - 1n < head.number ? from + LOG_SPAN - 1n : head.number])
  const logs = []
  for (let i = 0; i < spans.length; i += LOG_PARALLEL) {
    const batch = await Promise.all(spans.slice(i, i + LOG_PARALLEL).map(([f, t]) =>
      client.getLogs({ address: cfg.address, events: EVENTS, fromBlock: f, toBlock: t })))
    logs.push(...batch.flat())
  }
  return { logs, head }
}

export async function loadChain(cfg, { history = false } = {}) {
  const client = createPublicClient({ transport: http(cfg.rpc, { retryCount: 2 }), batch: { multicall: true } })
  const read = (functionName, args = []) => client.readContract({ address: cfg.address, abi: PULSE_ABI, functionName, args })

  // Committed events in a bounded window: who forecasts, and how many locked each day. The
  // window is the last LOOKBACK_DAYS of blocks (or since the deploy, if later), measured from the
  // chain's own block rate, so page load does not grow with the contract's age. Forecasters with
  // no commit in that window drop off the leaderboard until they forecast again.
  const { logs: events, head } = await scanEvents(client, cfg)
  const logs = events.filter((e) => e.eventName === 'Committed')
  const voters = [...new Set(logs.map((l) => l.args.voter))]
  const committedFor = (d) => logs.filter((l) => Number(l.args.day) === d).length

  // The contract's day, not the browser's: on a fork the chain can be days ahead.
  const [today, startDay] = (await Promise.all([read('today'), read('startDay')])).map(Number)
  const days = {}
  await Promise.all([today - 1, today, today + 1].map(async (d) => {
    const [info, crowd, baseline] = await Promise.all([read('dayInfo', [BigInt(d)]), read('crowdBand', [BigInt(d)]), read('baselineBand', [BigInt(d)])])
    days[d] = toDay(info, crowd, baseline, committedFor(d))
  }))
  const holders = await Promise.all(voters.map(async (v) => toHolder(v, await read('stats', [v]))))
  // chainNow is the chain's clock: on a fork it runs days ahead of the browser's
  const out = { sample: false, network: cfg.network, contract: cfg.address, today, startDay, chainNow: Number(head.timestamp), days, holders }
  if (!history) return out
  // each settled day's own sigma gives its baseline band
  const settled = [...new Set(events.filter((e) => e.eventName === 'Settled').map((e) => Number(e.args.day)))]
  const sigmaByDay = {}
  await Promise.all(settled.map(async (d) => { sigmaByDay[d] = Number((await read('dayInfo', [BigInt(d)])).sigmaBps) }))
  return { ...out, history: toHistory(events, sigmaByDay) }
}
