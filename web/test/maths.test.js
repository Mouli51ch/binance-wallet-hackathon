import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backtest, baselineHalf, crowdAverage, pinballTenths } from '../src/model.js'

// Worked by hand from PulseForecast._pin: q=0.1 under, q=0.5, q=0.9 over, in tenths of a bps.
test('pinball loss matches the contract formula', () => {
  // y=118 against (-300, 40, 350): 1*418 + 5*78 + (10-9)*232 = 1040
  assert.equal(pinballTenths(-300, 40, 350, 118), 1040)
  // y below everything: (10-1)*10 + (10-5)*20 + (10-9)*30 = 220
  assert.equal(pinballTenths(0, 10, 20, -10), 220)
  assert.equal(pinballTenths(0, 0, 0, 0), 0)
})

test('baseline half-width and crowd average round like Solidity', () => {
  assert.equal(baselineHalf(250), 320) // 250 * 1.2816 = 320.4
  assert.equal(crowdAverage(-7, 2), -3) // truncates toward zero, not floor
  assert.equal(crowdAverage(7, 2), 3)
})

test('backtest counts days that beat the baseline', () => {
  const days = [{ changeBps: 118, baselineLoss: 162 }, { changeBps: -600, baselineLoss: 50 }]
  const r = backtest({ p10: -300, p50: 40, p90: 350 }, days)
  assert.equal(r.days, 2)
  assert.equal(r.beat, 1) // 104 < 162, but day 2 loses: (10-1)*300+(10-5)*640+(10-9)*950 = 6850 tenths = 685 > 50
})
