# Kodo

Daily BNB forecasts from verified people. Each Binance **Agent ID** holder's AI agent sends one
forecast a day: a low, middle and high estimate (p10, p50 and p90) of BNB's % move. A contract on
BNB Chain scores every forecast against Chainlink and compares it with a simple automatic
forecast, so anyone can see what the crowd expects and how good each forecaster really is. One
Agent ID is one person, so the crowd cannot be filled with bots.

Built for the Binance Wallet x BNB Chain Agent ID Hackathon.

**Forecasting signal only. Not financial advice. No returns are promised.**

- Website: https://kodo-forecast.vercel.app
- Contract: [`0xa6EE7846434C385847B4e79EF529531a1124FfF6`](https://bscscan.com/address/0xa6EE7846434C385847B4e79EF529531a1124FfF6)
  on BSC mainnet, deployed at block 135436524, source verified (`exact_match`) on
  [Sourcify](https://sourcify.dev/#/lookup/0xa6EE7846434C385847B4e79EF529531a1124FfF6)
- Agent skill: [`skills/human-pulse`](skills/human-pulse)

## Owner permissions

Owner permissions: none (no owner, no admin, no pause, no upgrades, holds no funds). Nobody can
change the rules, the scores or the contract after deployment. It reads the Agent ID contract
(`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`) and the Chainlink BNB/USD feed
(`0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE`) and nothing else.

## Ask the crowd (anyone)

No wallet needed. Install the skill (step 2 below) and ask your agent:

> What does the Kodo crowd expect for BNB today?

It answers in one line from the live contract: the crowd's range and middle in % and in dollars at
the current Chainlink price, and how yesterday went against a typical day. The website shows the
same thing, plus a live race of BNB's price against the crowd's range.

## Join as a forecaster in 4 steps

1. **Get an Agent ID.** Use a Binance Agentic Wallet that holds a Binance Agent ID, with
   Developer Mode on. The contract refuses any wallet without one.
2. **Install the skill.** Copy the folder `skills/human-pulse` from this repo into
   `~/.claude/skills/human-pulse`, then run `npm install` inside it.
3. **Forecast.** Tell your agent your view, for example "make my Kodo forecast: BNB between -3%
   and +3%, middle +0.2%". The skill builds the transaction and the Binance wallet shows its
   preview. **You confirm it yourself**: the skill never confirms for you.
4. **Come back daily.** Each day one confirmed transaction opens yesterday's sealed forecast and
   seals the next one. After 00:00 UTC the day is settled and scored, and your record updates on
   the website.

## How scoring works

- **Sealed, then opened.** A forecast for day D is sent during day D - 1 as a hash, so nobody can
  copy it. It is opened (revealed) during day D. Every day runs 00:00 to 24:00 UTC.
- **The real price decides.** At the end of day D the contract takes BNB's move between the
  Chainlink rounds current at the two midnights.
- **Pinball loss.** Each of p10, p50 and p90 gets the standard quantile (pinball) loss. It is a
  proper scoring rule: the best strategy is to say what you actually believe. Lower is better.
- **A typical day as the bar.** The baseline forecast is centred on 0 with a band of
  ±1.2816 σ, where σ is BNB's recent daily volatility (updated after each settled day with
  σ² ← 0.94 σ² + 0.06 change²). It is scored the same way.
- **Skill** = (total baseline loss - total loss) / days scored. Positive means better than a
  typical-day guess. The leaderboard ranks forecasters with at least 5 scored days.
- **No cherry-picking.** A forecast that is sealed but never opened scores 2x the baseline loss
  that day, and every miss is shown on the forecaster's record.
- **The crowd band** is the average of everyone's opened p10, p50 and p90 for the day.

Full design, units and function signatures: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Agent ID depth

- The contract checks `balanceOf` on the Binance Agent ID contract on every forecast, so only
  holders take part and each holder has one record. That is what makes the crowd a crowd of
  people and the leaderboard impossible to farm with fresh wallets.
- The forecast is sent by the holder's own AI agent through the Binance Agentic Wallet, with the
  wallet's preview and the holder's confirmation every time.
- Nobody is identified: the site shows shortened addresses and totals only, never `.ai` names.

## Practicality

- One transaction a day, about 125,000 gas (well under $0.01 on BSC), sent by the forecaster.
- Anyone can read the crowd without a wallet: on the website, or by asking any agent with the
  skill installed.
- The website is read-only. It has no wallet connect and nothing to sign.

## Completion

- Live on BSC mainnet with the source verified, 35 unit tests and 5 mainnet-fork tests.
- A local fork of mainnet runs the deployed contract with real Agent ID holders (impersonated on
  the fork only) through the real skill for 6 days and scores them: `fork/live.mjs`.
- The website reads mainnet directly from public RPCs; a workflow refreshes its cached event
  history every 6 hours.
- A keeper settles each day after 00:00 UTC (`keeper/settle.mjs`). Anyone can run it, since
  `settle` and `score` are open to all. Its daily GitHub Actions run sends transactions once the
  keeper key secret is set; until then it only plans them.

## Innovation

- Forecasts are scored, not voted on: a public, unfakeable track record per verified person,
  measured against a baseline rather than against each other.
- Commit-reveal chained into one transaction a day, so forecasts stay hidden until they cannot
  change, at the cost of a single confirmation.
- The crowd's view is readable by any agent in one sentence, which makes it a signal other agents
  can use.

## Repository

| Folder | What is in it |
| --- | --- |
| `contracts/` | Foundry project: `src/PulseForecast.sol`, unit tests, fork tests, deploy script |
| `skills/human-pulse/` | The agent skill (`SKILL.md`) and `pulse.mjs` (prepare, status, crowd) |
| `web/` | The website (Vite + viem), read-only |
| `keeper/` | The daily settle and score script |
| `fork/` | Local mainnet-fork end-to-end runs |
| `deployments/` | Addresses per network |
| `docs/` | Architecture, Agentic Wallet notes, handoff |

Run the checks:

```sh
cd contracts && forge test --no-match-path "test/fork/*"
cd web && npm ci && npm test
cd skills/human-pulse && npm ci && npm test
```

## Contributing

Read `CLAUDE.md`, then `TASKS.md` sections 1 to 3: claim a task with a `claim/t-<id>` PR, then do
the work in a `feature/t-<id>-<slug>` PR.
