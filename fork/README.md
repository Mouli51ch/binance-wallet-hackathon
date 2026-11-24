# Local mainnet fork (T-A07)

One command runs Kodo end to end on a local copy of BSC mainnet:

```bash
cd fork && npm install && npm start      # or: node fork/run.mjs
cd web && npm run dev:fork              # in a second terminal: the site reads the fork
```

Needs Node 22 and Foundry (`anvil`, `forge`). If Foundry is not on PATH, set `FOUNDRY_BIN`.
Until T-A01 (PR #6) is merged, point `CONTRACTS_DIR` at a checkout of `feature/t-a01-contract`:
`CONTRACTS_DIR=../bwh-a01/contracts node run.mjs`.

What is real and what is not:

| Part | On the fork |
|---|---|
| Agent ID contract and its holders | real: 5 holders found from mint events, impersonated on the fork only |
| The Agent ID gate | real: a fresh address is refused with `NotAgentIdHolder` |
| Chainlink BNB/USD | real rounds from the last 7 midnights, replayed through `MockFeed` with whole-day time shifts, because a fork never receives new rounds |
| Time | 7 simulated UTC days, moved with anvil |
| Forecasts | made up per holder (a bias and a width), committed and revealed through `submit` |

Measured on 2026-11-24: `submit` with reveal, commit and score costs 123,594 gas (median), 174,719 at most.

Options: `BSC_RPC_URL` (mainnet RPC to read and fork, default publicnode), `FORK_PORT` (default 8545).
Nothing signs with a private key and nothing is sent to mainnet.

## The live contract, end to end (T-A08)

`node live.mjs` (or `npm run live`) runs the **deployed** mainnet PulseForecast from
`deployments/mainnet.json` instead of a new deploy, and sends what the real Kodo skill builds:

1. forks BSC mainnet at its head on port 8547 (`FORK_PORT` to change it)
2. swaps the Chainlink BNB/USD feed for a test feed on the fork only (a fork gets no new rounds);
   the day's moves are made up and printed, starting from the real price now
3. finds 4 real Agent ID holders with nothing locked for tomorrow (`HOLDERS` to change it) and
   impersonates them on the fork only
4. for 6 simulated days: moves the clock to 01:00 UTC, settles the day before, and each holder
   runs `skills/human-pulse/pulse.mjs prepare` and sends the calldata it prints; on the last day
   one holder skips, so the site shows a sealed tile
5. checks every holder has 5 scored days and writes `deployments/fork.json`

Needs Foundry, `CONTRACTS_DIR` pointing at a checkout with `contracts/` (for the test feed's
bytecode) and `npm install` in `skills/human-pulse`. Nothing is signed with a key and nothing is
sent to mainnet. Then, in `web/`: `npm run dev:fork`.
