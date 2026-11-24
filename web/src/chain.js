// T-B02: read PulseForecast with viem and hand the page the same shape as mock-data.js.
// Read-only: a public client over HTTP, no wallet, no signing.
//
// Which contract is read comes from one place, config.js. Units: forecasts and changes are
// in bps; the contract keeps losses in tenths of a bps, so toView() divides them by 10.
import { createPublicClient, http, parseAbi } from 'viem'

export const PULSE_ABI = parseAbi([
  'function today() view returns (uint64)',
  'function dayInfo(uint64 day) view returns ((uint8 status, int32 changeBps, uint32 sigmaBps, uint32 reveals, int256 openPrice, int256 closePrice, uint256 crowdLoss, uint256 baselineLoss))',
  'function crowdBand(uint64 day) view returns (int32 p10, int32 p50, int32 p90, uint32 n)',
  'function baselineBand(uint64 day) view returns (int32 p10, int32 p50, int32 p90)',
  'function stats(address voter) view returns ((uint32 daysCommitted, uint32 daysScored, uint32 missedReveals, uint32 daysInBand, uint32 beatStreak, uint64 lastScoredDay, uint128 totalLoss, uint128 totalBaselineLoss))',
  'event Committed(address indexed voter, uint64 indexed day)',
])
const COMMITTED = PULSE_ABI.find((x) => x.type === 'event' && x.name === 'Committed')
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
    daysScored: Number(s.daysScored),
    totalLoss: tenths(s.totalLoss),
    totalBaselineLoss: tenths(s.totalBaselineLoss),
    daysInBand: Number(s.daysInBand),
    missedReveals: Number(s.missedReveals),
    streak: Number(s.beatStreak),
  }
}

export async function loadChain(cfg) {
  const client = createPublicClient({ transport: http(cfg.rpc, { retryCount: 2 }), batch: { multicall: true } })
  const read = (functionName, args = []) => client.readContract({ address: cfg.address, abi: PULSE_ABI, functionName, args })

  // Committed events in a bounded window: who forecasts, and how many locked each day. The
  // window is the last LOOKBACK_DAYS of blocks (or since the deploy, if later), measured from the
  // chain's own block rate, so page load does not grow with the contract's age. Forecasters with
  // no commit in that window drop off the leaderboard until they forecast again.
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
      client.getLogs({ address: cfg.address, event: COMMITTED, fromBlock: f, toBlock: t })))
    logs.push(...batch.flat())
  }
  const voters = [...new Set(logs.map((l) => l.args.voter))]
  const committedFor = (d) => logs.filter((l) => Number(l.args.day) === d).length

  // The contract's day, not the browser's: on a fork the chain can be days ahead.
  const today = Number(await read('today'))
  const days = {}
  await Promise.all([today - 1, today, today + 1].map(async (d) => {
    const [info, crowd, baseline] = await Promise.all([read('dayInfo', [BigInt(d)]), read('crowdBand', [BigInt(d)]), read('baselineBand', [BigInt(d)])])
    days[d] = toDay(info, crowd, baseline, committedFor(d))
  }))
  const holders = await Promise.all(voters.map(async (v) => toHolder(v, await read('stats', [v]))))
  return { sample: false, network: cfg.network, contract: cfg.address, today, days, holders }
}
