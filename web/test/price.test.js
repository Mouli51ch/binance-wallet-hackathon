import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readRound, usdAt } from '../src/price.js'

test('Chainlink round to a price, its age and staleness; dollar levels from a % move', () => {
  const now = 1_800_000_000
  assert.deepEqual(readRound([1n, 61234000000n, 0n, BigInt(now - 120), 1n], 8, now), { usd: 612.34, ageS: 120, stale: false })
  assert.equal(readRound([1n, 61234000000n, 0n, BigInt(now - 7201), 1n], 8, now).stale, true)
  assert.throws(() => readRound([1n, 0n, 0n, BigInt(now), 1n], 8, now), /no BNB price/)
  assert.equal(usdAt(600, -320).toFixed(2), '580.80')
})
