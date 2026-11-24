// SAMPLE DATA ONLY, in the same shape loadChain(cfg, { history: true }) returns, so the app
// works before any contract is deployed. Every view labels it "Sample data". The addresses are
// placeholders (0x0000...00a1), the forecasts are generated, and the daily BNB moves are a fixed
// made-up list. Scoring uses the contract's own maths from model.js.
import { baselineHalf, dayOf, pinballTenths } from '../model.js'

const MOVES = [-250, -42, -688, 147, 203, -46, 95, -130, 60, -220] // bps, oldest first
const STYLES = [[20, 260], [-10, 320], [40, 200], [0, 420], [-30, 160], [10, 300], [-20, 240]] // bias, half-width
const addr = (n) => `0x${n.toString(16).padStart(40, '0')}`

function band(i, day) {
  const [bias, width] = STYLES[i]
  let x = (day * 2654435761 + i * 40503) >>> 0
  const wob = () => ((x = (x * 1103515245 + 12345) >>> 0) % 81) - 40
  const p50 = bias + wob()
  return { p10: p50 - width + wob(), p50, p90: p50 + width + wob() }
}

export function sampleData(now = Date.now()) {
  const today = dayOf(now)
  const first = today - MOVES.length
  const voters = {}, days = {}, stats = {}
  STYLES.forEach((_, i) => {
    voters[addr(0xa1 + i)] = { committed: {}, forecasts: {}, scores: {} }
    stats[addr(0xa1 + i)] = { daysScored: 0, totalLoss: 0, totalBaselineLoss: 0, daysInBand: 0, missedReveals: 0, streak: 0 }
  })
  let variance = 250 * 250
  for (let d = first; d <= today + 1; d++) {
    const x = (days[d] = { day: d, committed: 0, revealed: 0, crowd: null })
    // the newest holder joins late, so one record is still unranked
    const who = Object.keys(voters).filter((_, i) => i < 6 || d >= today - 2)
    x.committed = who.length
    for (const a of who) voters[a].committed[d] = true
    if (d > today) continue
    const sums = [0, 0, 0]
    who.forEach((a) => {
      const b = band(Object.keys(voters).indexOf(a), d)
      voters[a].forecasts[d] = b
      sums[0] += b.p10; sums[1] += b.p50; sums[2] += b.p90
    })
    x.revealed = who.length
    x.crowd = { p10: Math.trunc(sums[0] / who.length), p50: Math.trunc(sums[1] / who.length), p90: Math.trunc(sums[2] / who.length) }
    const h = baselineHalf(Math.floor(Math.sqrt(variance)))
    x.baseline = { p10: -h, p50: 0, p90: h }
    if (d === today) continue
    const y = MOVES[d - first]
    const base = pinballTenths(-h, 0, h, y) / 10
    x.result = { changeBps: y, crowdLoss: pinballTenths(x.crowd.p10, x.crowd.p50, x.crowd.p90, y) / 10, baselineLoss: base }
    for (const a of who) {
      const f = voters[a].forecasts[d]
      const loss = pinballTenths(f.p10, f.p50, f.p90, y) / 10
      const inBand = f.p10 <= y && y <= f.p90
      voters[a].scores[d] = { loss, baselineLoss: base, inBand }
      const s = stats[a]
      s.daysScored++; s.totalLoss += loss; s.totalBaselineLoss += base
      if (inBand) s.daysInBand++
      s.streak = loss < base ? s.streak + 1 : 0
    }
    variance = Math.floor((94 * variance + 6 * y * y) / 100)
  }
  const holders = Object.entries(stats).map(([address, s]) => ({ address, ...s }))
  const landingDay = (d) => {
    const x = days[d] ?? {}
    return { committed: x.committed ?? 0, revealed: x.revealed ?? 0, crowd: x.crowd, baseline: x.baseline,
      settled: !!x.result, changeBps: x.result?.changeBps, crowdLoss: x.result?.crowdLoss, baselineLoss: x.result?.baselineLoss }
  }
  // sample seals: made-up hashes for today and tomorrow, so the sealed tiles have something to draw
  const seals = []
  for (const d of [today, today + 1]) {
    Object.entries(voters).forEach(([a, v], i) => {
      if (!v.committed[d]) return
      const hex = Array.from({ length: 64 }, (_, k) => ((d * 31 + i * 17 + k * 7) % 16).toString(16)).join('')
      seals.push({ voter: a, day: d, hash: `0x${hex}`, at: d * 86400 - 3600 * (8 - i) })
    })
  }
  return {
    seals,
    sample: true, network: 'sample', contract: null, today, chainNow: Math.floor(now / 1000),
    days: { [today - 1]: landingDay(today - 1), [today]: landingDay(today), [today + 1]: landingDay(today + 1) },
    holders, history: { days, voters },
  }
}
