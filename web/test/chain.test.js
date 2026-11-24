import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toDay, toHolder } from '../src/chain.js'

// The contract keeps losses in tenths of a bps; the page works in bps.
test('chain reads map to the page shape, losses from tenths of a bps to bps', () => {
  const info = { status: 1, changeBps: 118, sigmaBps: 234, reveals: 2, openPrice: 0n, closePrice: 0n, crowdLoss: 1395n, baselineLoss: 1620n }
  const d = toDay(info, [-280, 40, 330, 2], [-300, 0, 300], 3)
  assert.deepEqual(d, {
    committed: 3, revealed: 2, crowd: { p10: -280, p50: 40, p90: 330 }, baseline: { p10: -300, p50: 0, p90: 300 },
    settled: true, void: false, changeBps: 118, crowdLoss: 139.5, baselineLoss: 162,
  })
  const pending = toDay({ ...info, status: 0 }, [0, 0, 0, 0], [-300, 0, 300], 0)
  assert.equal(pending.crowd, null)
  assert.equal(pending.changeBps, undefined)
  assert.equal(toDay({ ...info, status: 2 }, [0, 0, 0, 0], [0, 0, 0], 0).void, true)

  const h = toHolder('0x0000000000000000000000000000000000000001', {
    daysCommitted: 6, daysScored: 5, missedReveals: 1, daysInBand: 4, beatStreak: 2, lastScoredDay: 9n, totalLoss: 7000n, totalBaselineLoss: 8200n,
  })
  assert.deepEqual(h, { address: '0x0000000000000000000000000000000000000001', daysScored: 5, totalLoss: 700, totalBaselineLoss: 820, daysInBand: 4, missedReveals: 1, streak: 2 })
})

test('events become per-day and per-voter history', async () => {
  const { toHistory } = await import('../src/chain.js')
  const A = '0x00000000000000000000000000000000000000a1', B = '0x00000000000000000000000000000000000000b2'
  const ev = (eventName, args) => ({ eventName, args })
  const h = toHistory([
    ev('Committed', { voter: A, day: 10n }), ev('Committed', { voter: B, day: 10n }),
    ev('Revealed', { voter: A, day: 10n, p10: -300, p50: 40, p90: 350 }),
    ev('Revealed', { voter: B, day: 10n, p10: -301, p50: 0, p90: 300 }),
    ev('Settled', { day: 10n, openPrice: 60000000000n, closePrice: 60708000000n, changeBps: 118, crowdLoss: 1395n, baselineLoss: 1620n }),
    ev('Scored', { voter: A, day: 10n, loss: 1040n, baselineLoss: 1620n, inBand: true }),
  ], { 10: 250 })
  assert.deepEqual(h.days[10].crowd, { p10: -300, p50: 20, p90: 325 }) // (-601)/2 truncates toward zero
  assert.deepEqual(h.days[10].baseline, { p10: -320, p50: 0, p90: 320 })
  assert.equal(h.days[10].committed, 2)
  assert.equal(h.days[10].result.crowdLoss, 139.5)
  assert.equal(h.days[10].result.openPrice, 600)
  assert.deepEqual(h.voters[A].scores[10], { loss: 104, baselineLoss: 162, inBand: true })
  assert.deepEqual(h.voters[B].forecasts[10], { p10: -301, p50: 0, p90: 300 })
})
