import assert from 'node:assert/strict'
import { test } from 'node:test'
import { guessRecord, leanOf, sealGlyph } from '../src/model.js'

const H1 = `0x${'d9ce70096955219d63e1893a2b96712c5a970e5fc2ee779b1f5f08c713a162c6'}`
const H2 = `0x${'643c49b02f8279396882bdc64b45b225fbb853d482dcb5806a9a6f3d7126d551'}`

test('a seal is a 5x5 mirrored pattern fixed by the commit hash', () => {
  const a = sealGlyph(H1)
  assert.equal(a.length, 5)
  for (const row of a) {
    assert.equal(row.length, 5)
    assert.deepEqual(row, row.slice().reverse()) // mirrored left to right
    for (const c of row) assert.ok([0, 1, 2, 3].includes(c))
  }
  assert.deepEqual(sealGlyph(H1), a) // the same hash always draws the same seal
  assert.notDeepEqual(sealGlyph(H2), a)
  assert.ok(a.flat().some((c) => c > 0)) // never blank
})

test('the crowd leans down, flat or up by its middle; guesses score against it', () => {
  assert.equal(leanOf(-26), 'down')
  assert.equal(leanOf(25), 'flat')
  assert.equal(leanOf(-25), 'flat')
  assert.equal(leanOf(40), 'up')
  const days = { 10: { crowd: { p10: -100, p50: 40, p90: 150 } }, 11: { crowd: { p10: -90, p50: -5, p90: 80 } }, 12: {} }
  // day 12 has no crowd yet, so it is pending, not wrong
  assert.deepEqual(guessRecord({ 10: 'up', 11: 'up', 12: 'down' }, days), { right: 1, scored: 2, pending: 1, streak: 0 })
  assert.deepEqual(guessRecord({ 10: 'up', 11: 'flat' }, days), { right: 2, scored: 2, pending: 0, streak: 2 })
})
