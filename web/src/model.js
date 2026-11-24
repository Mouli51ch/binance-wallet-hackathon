// Pure helpers that turn contract-shaped data into what the page shows. No DOM here, so the
// node test can load it and T-B02 can reuse it when the data comes from the chain.
// Units follow docs/ARCHITECTURE.md section 5: forecasts and changes in basis points
// (100 bps = 1%), days as whole UTC days since 1970-01-01. Losses are assumed to be in bps too;
// T-B02 checks that against the real contract.
import { getAddress } from 'viem'

export const MIN_SCORED_DAYS = 5
const MAX_BPS = 5000

const DAY_MS = 86_400_000
const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** UTC day index to a label like "Tue 25 Nov". */
export function dayLabel(day) {
  if (!Number.isSafeInteger(day) || day < 0) throw new Error(`day must be a whole day index, got ${day}`)
  return dateFmt.format(new Date(day * DAY_MS))
}

/** UTC day index for a timestamp in ms. */
export function dayOf(ms) {
  return Math.floor(ms / DAY_MS)
}

/** Basis points to a signed percentage, "+0.40%" or "−3.00%" (a minus sign, not a dash). */
export function pct(bps, digits = 2) {
  if (!Number.isFinite(bps)) return 'n/a'
  const v = (Math.abs(bps) / 100).toFixed(digits)
  if (Number(v) === 0) return `${(0).toFixed(digits)}%`
  return `${bps < 0 ? '−' : '+'}${v}%`
}

/** A checked, shortened address: "0x1234…abcd". Throws on anything that is not an address. */
export function shortAddr(addr) {
  const a = getAddress(addr)
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

/** A band is three whole bps values with p10 <= p50 <= p90, each within +-5000 bps. */
export function validBand(b) {
  if (!b) return false
  const xs = [b.p10, b.p50, b.p90]
  return xs.every((x) => Number.isInteger(x) && Math.abs(x) <= MAX_BPS) && b.p10 <= b.p50 && b.p50 <= b.p90
}

/** Skill and calibration for one holder, from the contract's stats(voter) fields. */
export function holderRow(s) {
  const scored = s.daysScored
  if (!Number.isInteger(scored) || scored <= 0) return null
  if (!Number.isInteger(s.daysInBand) || s.daysInBand < 0 || s.daysInBand > scored) return null
  return {
    address: shortAddr(s.address),
    full: getAddress(s.address),
    daysScored: scored,
    skillBps: (s.totalBaselineLoss - s.totalLoss) / scored,
    calibration: s.daysInBand / scored,
    streak: s.streak,
  }
}

/** Holders with at least MIN_SCORED_DAYS scored days, best skill first. Bad rows are dropped. */
export function leaderboard(holders, minDays = MIN_SCORED_DAYS) {
  const rows = []
  for (const h of holders) {
    if (!(h.daysScored >= minDays)) continue
    try {
      const r = holderRow(h)
      if (r && Number.isFinite(r.skillBps) && Number.isFinite(r.calibration)) rows.push(r)
    } catch {
      // Not a valid address: data, not something to render. Skip the row.
    }
  }
  return rows.sort((a, b) => b.skillBps - a.skillBps || b.daysScored - a.daysScored)
}

/** What happened on a past day, in one of five states. */
export function dayResult(d) {
  if (!d) return { state: 'missing' }
  if (d.void) return { state: 'void' }
  if (!d.settled) return { state: 'pending' }
  if (!validBand(d.crowd)) return { state: 'no-crowd', changeBps: d.changeBps }
  return {
    state: 'settled',
    changeBps: d.changeBps,
    crowdBeatBaseline: d.crowdLoss < d.baselineLoss,
    inCrowdBand: d.crowd.p10 <= d.changeBps && d.changeBps <= d.crowd.p90,
  }
}

/* ------------------------------------------------ the contract's maths, mirrored for display */

/** PulseForecast.pinballLoss: p10/p50/p90 against outcome y (bps), in tenths of a bps. */
export function pinballTenths(p10, p50, p90, y) {
  const pin = (q, x) => (y - x >= 0 ? q * (y - x) : (10 - q) * (x - y))
  return pin(1, p10) + pin(5, p50) + pin(9, p90)
}

/** PulseForecast.baselineBand half-width for a sigma in bps: sigma * 1.2816, rounded down. */
export function baselineHalf(sigmaBps) {
  return Math.floor((sigmaBps * 12816) / 10000)
}

/** Solidity int division of a band sum by n (truncates toward zero), as crowdBand() does. */
export function crowdAverage(sum, n) {
  return Math.trunc(sum / n)
}

/** How a band would have scored on past settled days: { days, beat, avgSavedBps }. */
export function backtest(band, settledDays) {
  let beat = 0, saved = 0
  for (const d of settledDays) {
    const loss = pinballTenths(band.p10, band.p50, band.p90, d.changeBps) / 10
    if (loss < d.baselineLoss) beat++
    saved += d.baselineLoss - loss
  }
  return { days: settledDays.length, beat, avgSavedBps: settledDays.length ? saved / settledDays.length : 0 }
}
