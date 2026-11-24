// BNB's live price from Chainlink's BNB/USD feed on BNB Smart Chain: the same feed PulseForecast
// settles and scores against, so the number on the page is the one a forecast is measured on.
// Read-only over a public RPC; no key, no wallet.
import { createPublicClient, http, parseAbi } from 'viem'

export const BNB_USD_FEED = '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE'
const MAINNET_RPC = 'https://bsc-rpc.publicnode.com'
const FEED_ABI = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
])
const STALE_S = 7200 // the contract's maxStale: an older round would void the day

/** Pure: one latestRoundData() result to { usd, ageS, stale }. A non-positive answer is refused. */
export function readRound(round, decimals, nowS) {
  const [, answer, , updatedAt] = round
  if (!(answer > 0n) || !(updatedAt > 0n)) throw new Error('Chainlink returned no BNB price.')
  const ageS = Math.max(0, nowS - Number(updatedAt))
  return { usd: Number(answer) / 10 ** decimals, ageS, stale: ageS > STALE_S }
}

/** BNB price at a % move from `usd`, the move in bps. */
export const usdAt = (usd, bps) => usd * (1 + bps / 10000)

let client
export async function bnbPrice() {
  client ??= createPublicClient({ transport: http(MAINNET_RPC, { retryCount: 1, timeout: 10000 }), batch: { multicall: true } })
  const [round, decimals] = await Promise.all([
    client.readContract({ address: BNB_USD_FEED, abi: FEED_ABI, functionName: 'latestRoundData' }),
    client.readContract({ address: BNB_USD_FEED, abi: FEED_ABI, functionName: 'decimals' }),
  ])
  return readRound(round, Number(decimals), Math.floor(Date.now() / 1000))
}
