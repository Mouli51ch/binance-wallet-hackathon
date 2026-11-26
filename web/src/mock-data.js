// SAMPLE DATA ONLY. Shaped like the contract's views (docs/ARCHITECTURE.md 5.3) so T-B02 can swap
// this file for chain reads. Nothing here is a real forecast, a real result or a real wallet: the
// addresses are placeholders (0x0000...00a1 and so on) and the page labels all of it as sample data.
import { dayOf } from './model.js'

const today = dayOf(Date.now())
const addr = (n) => `0x${n.toString(16).padStart(40, '0')}`

export const data = {
  sample: true,
  contract: null, // set by T-B02 from deployments/ once the contract is deployed
  today,
  days: {
    // Tomorrow: commits only, numbers stay hidden until tomorrow starts.
    [today + 1]: { committed: 14 },
    // Today: forecasts revealed so far, and the baseline band.
    [today]: {
      committed: 12,
      revealed: 9,
      crowd: { p10: -310, p50: 25, p90: 340 },
      baseline: { p10: -295, p50: 0, p90: 295 },
      settled: false,
    },
    // Yesterday: settled against Chainlink.
    [today - 1]: {
      committed: 11,
      revealed: 11,
      crowd: { p10: -280, p50: 40, p90: 330 },
      baseline: { p10: -300, p50: 0, p90: 300 },
      settled: true,
      changeBps: 118,
      crowdLoss: 139,
      baselineLoss: 162,
    },
  },
  holders: [
    { address: addr(0xa1), daysScored: 12, totalLoss: 1620, totalBaselineLoss: 1910, daysInBand: 10, streak: 4 },
    { address: addr(0xa2), daysScored: 9, totalLoss: 1302, totalBaselineLoss: 1405, daysInBand: 7, streak: 2 },
    { address: addr(0xa3), daysScored: 14, totalLoss: 2210, totalBaselineLoss: 2275, daysInBand: 12, streak: 1 },
    { address: addr(0xa4), daysScored: 6, totalLoss: 980, totalBaselineLoss: 1001, daysInBand: 4, streak: 0 },
    { address: addr(0xa5), daysScored: 11, totalLoss: 1890, totalBaselineLoss: 1760, daysInBand: 6, streak: 0 },
    { address: addr(0xa6), daysScored: 7, totalLoss: 1240, totalBaselineLoss: 1150, daysInBand: 5, streak: 0 },
    // Fewer than 5 scored days: not ranked yet.
    { address: addr(0xa7), daysScored: 3, totalLoss: 400, totalBaselineLoss: 520, daysInBand: 3, streak: 3 },
  ],
}
