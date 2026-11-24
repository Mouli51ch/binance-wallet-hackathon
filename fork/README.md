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
