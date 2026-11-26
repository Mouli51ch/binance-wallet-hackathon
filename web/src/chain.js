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
  'function forecastOf(address voter, uint64 day) view returns ((bytes32 hash, int32 p10, int32 p50, int32 p90, bool revealed, bool scored))',
  'function stats(address voter) view returns ((uint32 daysCommitted, uint32 daysScored, uint32 missedReveals, uint32 daysInBand, uint32 beatStreak, uint64 lastScoredDay, uint128 totalLoss, uint128 totalBaselineLoss))',
  'event Committed(address indexed voter, uint64 indexed day)',
  'event Revealed(address indexed voter, uint64 indexed day, int32 p10, int32 p50, int32 p90)',
  'event Settled(uint64 indexed day, int256 openPrice, int256 closePrice, int32 changeBps, uint256 crowdLoss, uint256 baselineLoss)',
  'event Scored(address indexed voter, uint64 indexed day, uint256 loss, uint256 baselineLoss, bool inBand)',
])
const EVENTS = PULSE_ABI.filter((x) => x.type === 'event')
const LOG_SPAN = 5000n // public RPCs cap eth_getLogs ranges
const LOG_PARALLEL = 32 // spans read at once; publicnode answered 40 in parallel in about 3 s
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

/* ---------------------------------------------------------------- event history, cached */
// Reading event history is the slow part on a public RPC (about 2 s per 5,000 blocks, and BSC
// makes about 115,000 blocks a day). So the history is read once and kept: in this browser
// (localStorage), and in a snapshot file written before each deploy (web/public/snapshot.json,
// `npm run snapshot`). A visit then reads only the blocks after the newest copy it has.

/** Pure: logs to a string for storage; bigints survive as "123n". */
export const packLogs = (logs) => JSON.stringify(logs.map((l) => ({ e: l.eventName, a: l.args, b: l.blockNumber, i: l.logIndex })),
  (k, v) => (typeof v === 'bigint' ? `${v}n` : v))
/** Pure: the reverse of packLogs. */
export const unpackLogs = (text) => JSON.parse(text, (k, v) => (typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v))
  .map((x) => ({ eventName: x.e, args: x.a, blockNumber: x.b, logIndex: x.i }))
/** Pure: several sets of logs as one, each log once, in chain order, from block `from` on. */
export function mergeLogs(sets, from) {
  const m = new Map()
  for (const set of sets) for (const l of set) if (BigInt(l.blockNumber) >= from) m.set(`${l.blockNumber}:${l.logIndex}`, l)
  return [...m.values()].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))
}

const HISTORY_PARALLEL = 8 // 48.club times out on 32 at once
const RECENT = 90000n // blocks the main public RPC still has events for (publicnode keeps about 100,000)
const REORG = 30n // re-read the last few blocks of any stored copy, in case they changed
const cacheKey = (cfg) => `kodo:logs:${cfg.network}:${String(cfg.address).toLowerCase()}`
// v2: drops copies made from the hand-recovered snapshot of 2026-11-25 (wrong log index)
// a fork is a fresh chain on every run at the same address, so its history is never stored
function readStored(cfg) {
  if (cfg.network === 'fork') return null
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey(cfg)))
    return c?.v === 2 ? { from: BigInt(c.from), to: BigInt(c.to), logs: unpackLogs(c.logs) } : null
  } catch { return null }
}
function writeStored(cfg, from, to, logs) {
  if (cfg.network === 'fork') return
  try { localStorage.setItem(cacheKey(cfg), JSON.stringify({ v: 2, from: String(from), to: String(to), logs: packLogs(logs) })) } catch {}
}
// The copy deployed with the site, and a fresher one the snapshot workflow publishes every 6 hours
// on the repo's `snapshot` branch (.github/workflows/snapshot.yml). The newest one wins.
const SNAPSHOTS = ['snapshot.json', 'https://raw.githubusercontent.com/Mouli51ch/binance-wallet-hackathon/snapshot/snapshot.json']
async function readSnapshot(cfg) {
  if (cfg.network !== 'mainnet' || typeof fetch !== 'function' || typeof location === 'undefined') return null
  const one = async (url) => {
    try {
      const r = await fetch(new URL(url, location.href), { cache: 'no-cache' })
      if (!r.ok) return null
      const s = await r.json()
      if (String(s.address).toLowerCase() !== String(cfg.address).toLowerCase()) return null
      return { from: BigInt(s.from), to: BigInt(s.to), logs: unpackLogs(s.logs) }
    } catch { return null }
  }
  const all = (await Promise.all(SNAPSHOTS.map(one))).filter(Boolean)
  return all.sort((a, b) => (a.to > b.to ? -1 : 1))[0] ?? null
}

/** Reads logs from `from` to `to` in LOG_SPAN chunks, LOG_PARALLEL at a time. */
export async function readLogs(client, address, from, to, parallel = LOG_PARALLEL) {
  const spans = []
  for (let f = from; f <= to; f += LOG_SPAN) spans.push([f, f + LOG_SPAN - 1n < to ? f + LOG_SPAN - 1n : to])
  const logs = []
  for (let i = 0; i < spans.length; i += parallel) {
    const batch = await Promise.all(spans.slice(i, i + parallel).map(([f, t]) => client.getLogs({ address, events: EVENTS, fromBlock: f, toBlock: t })))
    logs.push(...batch.flat())
  }
  return logs
}

async function scanEvents(client, cfg) {
  const snap = readSnapshot(cfg) // in parallel with the block reads below
  const [head, number] = await Promise.all([client.getBlock(), client.getBlockNumber()])
  const back = await client.getBlock({ blockNumber: number > 1000n ? number - 1000n : 0n })
  const perDay = head.timestamp > back.timestamp ? (86400n * (head.number - back.number)) / (head.timestamp - back.timestamp) : 0n
  const windowStart = head.number - perDay * LOOKBACK_DAYS
  const from = BigInt(cfg.deployBlock) > windowStart ? BigInt(cfg.deployBlock) : windowStart
  // the newest stored copy that reaches back to the window's start
  const copies = [readStored(cfg), await snap].filter((c) => c && c.from <= from && c.to <= head.number)
  const best = copies.sort((a, b) => (a.to > b.to ? -1 : 1))[0]
  const start = best && best.to - REORG > from ? best.to - REORG : from
  // The main RPC answers pruned blocks (older than about a day) with no events instead of an error,
  // so blocks older than RECENT come from an RPC that keeps the full history (slower, CORS open).
  const split = cfg.historyRpc && head.number - start > RECENT ? head.number - RECENT : start - 1n
  const [old, recent] = await Promise.all([
    split >= start ? readLogs(createPublicClient({ transport: http(cfg.historyRpc, { retryCount: 3, timeout: 30000 }) }), cfg.address, start, split, HISTORY_PARALLEL) : [],
    readLogs(client, cfg.address, split + 1n, head.number),
  ])
  const fresh = [...old, ...recent]
  const logs = mergeLogs([...(best ? [best.logs.filter((l) => l.blockNumber < start)] : []), fresh], from)
  writeStored(cfg, from, head.number, logs)
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
  const settled = history ? [...new Set(events.filter((e) => e.eventName === 'Settled').map((e) => Number(e.args.day)))] : []
  const recent = logs.filter((l) => [today, today + 1].includes(Number(l.args.day))).slice(-60)
  const at = {}, sigmaByDay = {}
  // everything below depends only on the logs and today, so it is read in one parallel step
  const days = {}
  const [holders, hashes] = await Promise.all([
    Promise.all(voters.map(async (v) => toHolder(v, await read('stats', [v])))),
    // the seals: every commit for today and tomorrow with its on-chain hash and the time it landed.
    // The hash proves the forecast exists and cannot change; the numbers stay unreadable until revealed.
    Promise.all(recent.map((l) => read('forecastOf', [l.args.voter, l.args.day]).then((f) => f.hash))),
    Promise.all([today - 1, today, today + 1].map(async (d) => {
      const [info, crowd, baseline] = await Promise.all([read('dayInfo', [BigInt(d)]), read('crowdBand', [BigInt(d)]), read('baselineBand', [BigInt(d)])])
      days[d] = toDay(info, crowd, baseline, committedFor(d))
    })),
    Promise.all([...new Set(recent.map((l) => l.blockNumber))].map(async (b) => { at[b] = Number((await client.getBlock({ blockNumber: b })).timestamp) })),
    // each settled day's own sigma gives its baseline band
    Promise.all(settled.map(async (d) => { sigmaByDay[d] = Number((await read('dayInfo', [BigInt(d)])).sigmaBps) })),
  ])
  const seals = recent.map((l, k) => ({ voter: l.args.voter, day: Number(l.args.day), at: at[l.blockNumber], hash: hashes[k] }))
  // chainNow is the chain's clock: on a fork it runs days ahead of the browser's
  const out = { sample: false, network: cfg.network, contract: cfg.address, today, startDay, chainNow: Number(head.timestamp), days, holders, seals }
  if (!history) return out
  return { ...out, history: toHistory(events, sigmaByDay) }
}
