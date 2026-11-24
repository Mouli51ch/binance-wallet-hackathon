# Human Pulse: project scope

Working name. The final name is picked before the mainnet deploy (OP-2).

Event: Binance Wallet x BNB Chain Agent ID Hackathon.
Submission closes **2026-12-09 08:00 UTC**. Claude-assisted build ends **2026-11-26**.
Team: Jishnu and Mouli. Repo: https://github.com/Mouli51ch/binance-wallet-hackathon

Detail lives elsewhere: design and interfaces in `docs/ARCHITECTURE.md`, tasks and owners in
`TASKS.md`, human-only steps in `OPERATOR_TODO.md`, decisions in `DECISIONS.md`.

## 1. What we are building

A daily BNB forecast made only by verified people, one per Binance Agent ID.

Once a day, an Agent ID holder's AI agent sends three numbers for BNB's change over the next UTC
day: a low (p10), a middle (p50) and a high (p90). The holder sees a preview and confirms one
transaction in Binance. At 00:00 UTC the contract reads Chainlink BNB/USD, scores every forecast
with pinball loss, and compares it with a simple baseline. The crowd's band and each forecaster's
record are public and cannot be edited.

**Why it matters:** every crypto sentiment number can be faked with bots and extra wallets.
Agent ID is one per Binance user and cannot be transferred, so here five hundred wallets are still
one person.

**What it is not:** financial advice, a trading signal service, a prediction market, or anything
that holds or moves money.

## 2. Who it is for

- **Agent ID holders** who want to make a daily call and build a track record nobody can fake.
- **Anyone reading the result:** the daily crowd band and forecaster records on the website.
- **Hackathon judges:** Agent ID depth 30%, practicality 25%, completion 25%, innovation 20%.

## 3. In scope (must ship)

| # | Deliverable | Done when | Owner |
|---|---|---|---|
| 1 | **PulseForecast contract** (Solidity, Foundry) | Deployed on BSC mainnet, source verified on BscScan; Agent ID gate, one forecast per holder per UTC day, chained commit and reveal in one transaction, permissionless settle against Chainlink, pinball scoring, baseline, holder stats | Jishnu |
| 2 | **Tests** | Unit tests with mocks for every rule, fork tests against the real Agent ID contract and Chainlink feed, gas measured | Jishnu |
| 3 | **Agent skill** (`skills/human-pulse/`) | `SKILL.md` and `pulse.mjs`: makes the forecast, stores the salt locally, builds the transaction, runs Developer Mode preview, waits for the user's confirm; never confirms for the user | Mouli |
| 4 | **Keeper** (`keeper/`) | Settles each day just after 00:00 UTC from a GitHub Actions cron; anyone can also settle by hand | Jishnu |
| 5 | **Website** (`web/`) | Public page on Vercel that explains the product and links to the skill; later reads live results from the contract; no wallet connect, no Agent ID names | Mouli |
| 6 | **Submission** | README with "owner permissions: none", submission text with the Agent ID usage description, demo video, handoff guide | both |
| 7 | **Real users** | 30+ distinct Agent ID holders have interacted with the contract by Dec 9, each with their own wallet and gas | both |

## 4. Out of scope (not before Dec 9)

- Any money flow: no token, no rewards, no staking, no paid tier, no fees.
- A paid layer for traders. It is pitch roadmap only.
- Assets other than BNB, horizons other than one day.
- Owner, admin, pause or upgrade powers in the contract.
- Wallet connect, logins, or any server holding user keys or sessions.
- Showing `name.ai` names or mapping names to wallets.
- Off-chain "unique contribution" scoring. Roadmap only.
- Funding other people's wallets or creating wallets to raise the user count.

## 5. Hard constraints

From the official rules and the Agentic Wallet platform:

- Contract on BNB Chain mainnet (chain 56), because Agent ID (`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`) exists only there. Development on a mainnet fork and on testnet.
- Source verified and open source on BscScan; public GitHub repo.
- Custom contract calls only work in Agentic Wallet Developer Mode, which the user turns on in the Binance App. Every call is preview, then user confirm, then execute.
- The skill must never bypass the user's transaction confirmation.
- No promised returns. Every page carries "Forecasting signal only. Not financial advice."
- Name must not use "Binance" or "BNB" to impersonate the brand.
- No secrets in git, chat or PRs: keys live in `.env` or GitHub Actions secrets.

## 6. How a day works

1. **Day D-1:** the agent commits a hash of its forecast for day D. One confirm.
2. **Day D:** the agent reveals the day D numbers and commits day D+1 in the same transaction.
3. **Start of day D+1:** the keeper (or anyone) settles day D with the Chainlink round current at 00:00 UTC. The contract checks the round and voids the day if the price is over 2 hours stale.
4. **Scoring:** each holder's day D forecast is scored with pinball loss against the actual change and compared with the baseline (no change, band from recent volatility). A forecast committed and never revealed scores twice the baseline's loss.

## 7. Schedule

| Date | Milestone | If it slips |
|---|---|---|
| Nov 23 | Repo, CI and board (T-A00); contract and unit tests (T-A01) | Contract work moves to Nov 24 morning, website work pauses |
| Nov 24 | Fork tests, testnet deploy, keeper, skill, test call from a real Agentic Wallet (T-F03) | Cut keeper automation; settle by hand |
| **Nov 25** | **Go/no-go:** final name, mainnet deploy and verify, first real forecast from an Agentic Wallet, website live | No working custom call: stop, ask the organisers, decide in DECISIONS.md |
| Nov 26 | README, submission text, demo script, handoff guide (last Claude day) | Write by hand after Nov 26 |
| Nov 27 to Dec 8 | Recruit 30+ holders, run the keeper, record the demo, submit by Dec 8 12:00 UTC | Under 10 holders on Dec 1: all effort to recruiting |

## 8. Budget

About **0.015 BNB (≈ $8)** for us at today's gas: deployer 0.01 BNB, keeper 0.003 BNB, our own
test forecasts 0.002 BNB. Each forecaster pays their own gas, under one cent a day. Hosting, RPC and
BscScan verification are free.

## 9. Current state (2026-11-23)

- Board, CI workflows, CLAUDE.md and the design are written on branch `feature/t-a00-board`, staged, not committed or pushed. Jishnu has read-only access to the repo until OP-1 is done.
- `web/` holds a landing page in the Sublevel Studio style, using ThreeUI's particle-scroll code. Preview: https://claude.ai/artifact/VUk4J7Ubpp94BqSxhGwXUV (private). Check that the ThreeUI licence allows its code in a public repo.
- Contract, tests, skill and keeper: not started.

## 10. Open questions

- Final project name (OP-2).
- Exact Developer Mode commands and limits (T-F02), and whether a custom call works end to end (T-F03).
- When Claude access ends on Nov 26 (OP-10).
- ThreeUI licence for the landing page code in a public repo.
