// T-C01: the commit hash must match the deployed contract's, or a forecast can never be revealed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData } from 'viem'
import { PULSE_ABI, buildSubmit, commitHash, parseBps, pickReveal, readForecast } from '../pulse.mjs'

// Shared vectors: each expected hash was returned by commitHash() on the mainnet PulseForecast
// 0xa6EE7846434C385847B4e79EF529531a1124FfF6, for example:
//   cast call --rpc-url https://bsc-rpc.publicnode.com 0xa6EE7846434C385847B4e79EF529531a1124FfF6 \
//     "commitHash(address,uint64,int32,int32,int32,bytes32)(bytes32)" -- \
//     0x00000000000000000000000000000000000000A1 20782 -320 15 290 0x1111...1111
const VECTORS = [
  { voter: '0x00000000000000000000000000000000000000A1', day: 20782n, p: [-320, 15, 290],
    salt: `0x${'11'.repeat(32)}`, hash: '0xd9ce70096955219d63e1893a2b96712c5a970e5fc2ee779b1f5f08c713a162c6' },
  { voter: '0x8ba1f109551bD432803012645Ac136ddd64DBA72', day: 4294967296n, p: [-5000, -5000, 5000],
    salt: `0x${'00'.repeat(31)}ff`, hash: '0x643c49b02f8279396882bdc64b45b225fbb853d482dcb5806a9a6f3d7126d551' },
]

test('commitHash matches the deployed contract on the shared vectors', () => {
  for (const v of VECTORS) assert.equal(commitHash(v.voter, v.day, ...v.p, v.salt), v.hash)
})

test('numbers must be whole bps; a percent passed by mistake is refused with the fix', () => {
  assert.equal(parseBps('-320', 'p10'), -320)
  assert.equal(parseBps('+35', 'p90'), 35)
  assert.throws(() => parseBps('-3.2', 'p10'), /-3\.2 is not a whole number of bps.*-320/)
  assert.throws(() => parseBps('abc', 'p50'), /p50/)
})

test('readForecast checks order and range like the contract', () => {
  assert.deepEqual(readForecast({ p10: '-300', p50: '40', p90: '350' }), [-300, 40, 350])
  assert.throws(() => readForecast({ p10: '50', p50: '40', p90: '350' }), /p10 <= p50 <= p90/)
  assert.throws(() => readForecast({ p10: '-5001', p50: '0', p90: '10' }), /5000/)
})

test('submit calldata decodes to exactly the reveal and the next commit', () => {
  const salt = `0x${'22'.repeat(32)}`, next = `0x${'ab'.repeat(32)}`
  const data = buildSubmit({ nextCommit: next, reveal: { p: [-100, 0, 120], salt } })
  const { functionName, args } = decodeFunctionData({ abi: PULSE_ABI, data })
  assert.equal(functionName, 'submit')
  assert.deepEqual(args, [next, true, -100, 0, 120, salt])
  const commitOnly = decodeFunctionData({ abi: PULSE_ABI, data: buildSubmit({ nextCommit: next }) }).args
  assert.deepEqual(commitOnly, [next, false, 0, 0, 0, `0x${'00'.repeat(32)}`])
})

test('the reveal is the saved forecast whose hash is the one on chain', () => {
  const voter = VECTORS[0].voter, day = 20782n
  const a = { p: [-320, 15, 290], salt: VECTORS[0].salt }
  const b = { p: [-100, 0, 100], salt: `0x${'33'.repeat(32)}` }
  // two prepares for the same day (the user changed their mind): only the one sent is on chain
  assert.deepEqual(pickReveal([b, a], voter, day, VECTORS[0].hash), a)
  assert.equal(pickReveal([b], voter, day, VECTORS[0].hash), null)
})
