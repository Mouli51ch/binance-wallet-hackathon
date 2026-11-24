import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findRoundAt } from '../src/price.js'
import { raceVerdict } from '../src/model.js'

// a feed whose round n (in phase 2) was updated at 1000 + 10n seconds; rounds 1 to 100 exist
const PHASE = 2n << 64n
const fake = async (id) => {
  const n = Number(id - PHASE)
  return n >= 1 && n <= 100 ? { id, answer: BigInt(500 + n), updatedAt: 1000 + 10 * n } : null
}

test('findRoundAt finds the Chainlink round current at a moment, as settle() does', async () => {
  assert.equal((await findRoundAt(fake, PHASE | 100n, 1505)).id, PHASE | 50n) // round 50 at 1500, 51 at 1510
  assert.equal((await findRoundAt(fake, PHASE | 100n, 1500)).id, PHASE | 50n) // at exactly its time
  assert.equal((await findRoundAt(fake, PHASE | 100n, 9999)).id, PHASE | 100n) // after the latest: the latest
  assert.equal(await findRoundAt(fake, PHASE | 100n, 500), null) // before the phase began: unknown
})

test('raceVerdict: is BNB inside what people expect, and how many are on target', () => {
  const crowd = { p10: -280, p50: 10, p90: 290 }
  const people = [{ p10: -100, p50: 0, p90: 100 }, { p10: -300, p50: 0, p90: 50 }, { p10: 60, p50: 120, p90: 400 }]
  assert.deepEqual(raceVerdict(84, crowd, 320, people), { zone: 'in', typical: 'in', onTarget: 2, of: 3 })
  assert.deepEqual(raceVerdict(350, crowd, 320, people), { zone: 'high', typical: 'out', onTarget: 1, of: 3 })
  assert.deepEqual(raceVerdict(-500, null, 320, []), { zone: null, typical: 'out', onTarget: 0, of: 0 })
})
