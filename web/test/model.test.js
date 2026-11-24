import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dayLabel, dayResult, leaderboard, pct, shortAddr, validBand } from '../src/model.js'

const addr = (n) => `0x${n.toString(16).padStart(40, '0')}`

test('leaderboard ranks by skill, needs 5 scored days, drops bad addresses', () => {
  const rows = leaderboard([
    { address: addr(1), daysScored: 5, totalLoss: 500, totalBaselineLoss: 600, daysInBand: 4, streak: 2 }, // +20/day
    { address: addr(2), daysScored: 10, totalLoss: 1000, totalBaselineLoss: 1300, daysInBand: 8, streak: 1 }, // +30/day
    { address: addr(3), daysScored: 4, totalLoss: 0, totalBaselineLoss: 999, daysInBand: 4, streak: 4 }, // too few days
    { address: 'alice.ai', daysScored: 9, totalLoss: 0, totalBaselineLoss: 999, daysInBand: 9, streak: 9 }, // not an address
  ])
  assert.deepEqual(rows.map((r) => [r.address, r.skillBps, r.calibration]), [
    ['0x0000…0002', 30, 0.8],
    ['0x0000…0001', 20, 0.8],
  ])
})

test('formatting and validation', () => {
  assert.equal(pct(40), '+0.40%')
  assert.equal(pct(-300), '−3.00%')
  assert.equal(pct(0), '0.00%')
  assert.equal(shortAddr('0x60b9262456de011f7d15a54cdd8c48baaa8b022f'), '0x60B9…022F')
  assert.throws(() => shortAddr('0x123'))
  assert.equal(dayLabel(Date.UTC(2026, 10, 25) / 86_400_000), 'Wed 25 Nov')
  assert.equal(validBand({ p10: -300, p50: 40, p90: 350 }), true)
  assert.equal(validBand({ p10: 50, p50: 40, p90: 350 }), false)
  assert.equal(validBand({ p10: -6000, p50: 40, p90: 350 }), false)
})

test('day result states', () => {
  const crowd = { p10: -280, p50: 40, p90: 330 }
  assert.equal(dayResult(undefined).state, 'missing')
  assert.equal(dayResult({ void: true }).state, 'void')
  assert.equal(dayResult({ settled: false }).state, 'pending')
  assert.equal(dayResult({ settled: true, changeBps: 10, crowd: null }).state, 'no-crowd')
  const r = dayResult({ settled: true, changeBps: 118, crowd, crowdLoss: 139, baselineLoss: 162 })
  assert.deepEqual(r, { state: 'settled', changeBps: 118, crowdBeatBaseline: true, inCrowdBand: true })
})

// Every forecast and where it is: locked (numbers hidden), revealed, scored, or never revealed.
test('forecastRows gives each forecast its stage, newest day first', async () => {
  const { forecastRows } = await import('../src/model.js')
  const A = '0x00000000000000000000000000000000000000a1'
  const history = {
    days: { 9: { day: 9, result: { changeBps: -46 } }, 10: { day: 10 }, 11: { day: 11 } },
    voters: { [A]: {
      committed: { 8: true, 9: true, 10: true, 11: true },
      forecasts: { 9: { p10: -100, p50: 0, p90: 100 }, 10: { p10: -50, p50: 5, p90: 60 } },
      scores: { 9: { loss: 12.5, baselineLoss: 20, inBand: true } },
    } },
  }
  const rows = forecastRows(history, 10)
  assert.deepEqual(rows.map((r) => [r.day, r.stage]), [[11, 'locked'], [10, 'revealed'], [9, 'scored'], [8, 'missed']])
  assert.equal(rows[0].band, null) // locked: the numbers are not public yet
  assert.equal(rows[2].change, -46)
  assert.equal(rows[2].beat, true)
})

// "You" on Today: one forecaster's yesterday, today and tomorrow, whatever case the address is in.
test('myDays picks one forecaster out of the history', async () => {
  const { myDays } = await import('../src/model.js')
  const A = '0x00000000000000000000000000000000000000a1'
  const history = {
    days: { 9: { day: 9, result: { changeBps: 30 } }, 10: { day: 10 }, 11: { day: 11 } },
    voters: {
      [A]: { committed: { 9: true, 10: true, 11: true }, forecasts: { 9: { p10: -50, p50: 0, p90: 80 } }, scores: { 9: { loss: 10, baselineLoss: 20, inBand: true } } },
      '0x00000000000000000000000000000000000000b2': { committed: { 10: true }, forecasts: {}, scores: {} },
    },
  }
  const me = myDays(history, 10, A.toUpperCase().replace('0X', '0x'))
  assert.equal(me.yesterday.stage, 'scored')
  assert.equal(me.today.stage, 'locked') // committed for today, not opened yet: the warning case
  assert.equal(me.tomorrow.stage, 'locked')
  assert.equal(myDays(history, 10, '0x00000000000000000000000000000000000000c3').today, null)
})
