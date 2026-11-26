import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeLogs, packLogs, unpackLogs } from '../src/chain.js'

const L = (b, i, eventName = 'Committed', args = { voter: '0x00000000000000000000000000000000000000a1', day: 20782n }) => ({ eventName, args, blockNumber: BigInt(b), logIndex: i })

test('event history survives a round trip through the browser cache, bigints included', () => {
  const logs = [L(100, 0), L(101, 3, 'Scored', { voter: '0x00000000000000000000000000000000000000a1', day: 20782n, loss: 1234n, baselineLoss: 2000n, inBand: true }),
    L(102, 1, 'Revealed', { voter: '0x00000000000000000000000000000000000000b2', day: 20783n, p10: -300, p50: 15, p90: 290 })]
  assert.deepEqual(unpackLogs(packLogs(logs)), logs)
})

test('mergeLogs joins cached, snapshot and fresh logs once each, in chain order, inside the window', () => {
  const cached = [L(90, 0), L(100, 0), L(101, 2)]
  const fresh = [L(101, 2), L(101, 1), L(105, 0)] // 101:2 seen twice (the rescan overlap)
  const out = mergeLogs([cached, fresh], 95n)
  assert.deepEqual(out.map((l) => `${l.blockNumber}:${l.logIndex}`), ['100:0', '101:1', '101:2', '105:0']) // 90 is before the window
})
