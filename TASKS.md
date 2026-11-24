# TASKS.md, the Human Pulse board

The board and the lock. Nothing else is the board: not an issue tracker, not a chat message.

**If you are an agent or a person about to write code, read sections 1 to 3 first. They are the
whole protocol. Then claim exactly one task and work only on that task.**

Design and interfaces: `docs/ARCHITECTURE.md`. Decisions taken
since: `DECISIONS.md`, which wins where the two disagree, because it is dated. Human-only
blockers: `OPERATOR_TODO.md`.

Repo: https://github.com/Mouli51ch/binance-wallet-hackathon (public, required by the rules).
Team: **Jishnu** and **Mouli**. Process copied from `jishnu-baruah/hydra`.

Event: Binance Wallet x BNB Chain Agent ID Hackathon.
- Submission closes **2026-12-09 08:00 UTC**.
- Claude-assisted build ends **2026-11-26**. Everything after that is people only.
- Only on-chain activity between 2026-11-18 and 2026-12-09 counts.

**Goal by Nov 26:** a judge can follow one live run. An Agent ID holder tells their agent "make
my BNB forecast", sees a preview, confirms in Binance, and the forecast lands in the mainnet
`PulseForecast` contract. After midnight UTC the day settles against Chainlink and the website
shows the crowd band, the result and the leaderboard. A wallet without an Agent ID is refused.

**Goal by Dec 9:** 30+ distinct Agent ID holders have interacted with the contract, and the
submission is in.

---

## 1. The lock: claim before you write code

One task, one owner, one branch, one PR. The race is settled by git, not by asking.

`main` takes pull requests only. A claim is a tiny PR carrying one line. The second claim PR on
the same task conflicts on that exact line and cannot merge.

```bash
git checkout main && git pull --ff-only origin main
git checkout -b claim/t-a01
# edit ONLY the `- Status:` line of the task you want, nothing else in the file
git commit -am "claim T-A01" && git push -u origin claim/t-a01
gh pr create --fill --base main && gh pr merge --auto --squash --delete-branch
```

If the merge is refused for a conflict, or the board lint says the task is already claimed,
**someone beat you to it. Pick another task. Never work on a task claimed by someone else.**

Then branch off the updated `main` and do the work:

```bash
git checkout main && git pull --ff-only origin main
git checkout -b feature/t-a01-pulse-contract
```

Rules the `board` CI job enforces (from T-A00 on):

- A claim PR is branch `claim/t-<id>` and may change **only** `- Status:` lines in `TASKS.md` and
  `OPERATOR_TODO.md`.
- A work PR is branch `feature/t-<id>-<slug>` and must match the `Branch:` in the row you claimed.
- Adding, cutting or rewording a task goes in a `board/<slug>` PR that touches only `TASKS.md`,
  `OPERATOR_TODO.md` and `DECISIONS.md`.
- Two owners on one task fails the lint. `Status: done` without a real `Evidence:` fails the lint.
- `secrets`, `checks` and `hygiene` must be green before merging.

Status values: `open` | `claimed <date> | Owner: <name> | Branch: <branch>` |
`blocked, see OP-N` | `in-review <PR link>` | `done` | `cut <date>: <reason>`.

Hackathon speed rule: a claim PR needs no reviewer. Merge it the moment CI is green.

## 2. Every task ships as a pull request

No exceptions: one-line changes and docs included.

1. Branch from `main` after claiming.
2. Commit small. Scoring maths, commit hashing and settlement checks get their failing test first
   (`superpowers:test-driven-development`). Other code: one meaningful check per change.
3. Run `/code-review` at medium. Add `/security-review` when the diff touches `contracts/src`, a
   key, the keeper, or anything that signs or sends a transaction.
4. Run `superpowers:verification-before-completion` before you call it done.
5. Open the PR into `main`. Fill in every line of the template. Squash-merge.
6. Write the finding you measured into your task row, with its number ("submit costs 182k gas",
   "Developer Mode preview took 6 s").

A second human reviews only what CI cannot see: anything in `contracts/src`, the keeper key
handling, and changes to the interface contract (`docs/ARCHITECTURE.md`: function signatures,
the commit hash encoding, units), which the contract owner and the skill and website owner must
agree on in the PR.

## 3. Rules for agent sessions

- Ponytail `full` is on through the `UserPromptSubmit` hook in `.claude/settings.json`: the
  laziest solution that actually works, never lazy about understanding, validation, errors or
  security.
- One agent session per claimed task, in its own worktree (`superpowers:using-git-worktrees`).
  Parallel agents never share a checkout.
- CI red or a test fails: `superpowers:systematic-debugging` before you change any code.
- Hit something only a human can do (fund a wallet, enable Developer Mode, a Binance App step, a
  Vercel login, a question for the organisers)? Write an `OP-N` in `OPERATOR_TODO.md`, set your
  task to `blocked, see OP-N`, and move to another task. **Never fake a transaction hash, a
  verification link or a measurement.**
- Never paste a private key, seed phrase or keyed RPC URL into a conversation, a file in git or a
  PR. Keys live in `.env` (git-ignored) or in GitHub Actions secrets.
- Search through the `Explore` subagent. Never paste whole files, logs or JSON into the
  conversation.
- Work is credited to the person who ran the agent. No AI co-author lines in commits.
- You may edit only the files in your task's `Touches:` line. Need a file another task owns? Say
  so in the PR and let that owner change it.
- No em dashes or en dashes anywhere, including code, comments, commits and docs.

Default tool per step:

| Step | Tool |
|---|---|
| Scope every change | Ponytail, level `full`, always on |
| Set up the workspace | `superpowers:using-git-worktrees` |
| Find code | `Explore` subagent |
| Library docs (Foundry, viem, Chainlink, Vite) | Context7, then the vendor docs |
| Contract maths, hashing, settlement | `superpowers:test-driven-development` |
| CI red or a test fails | `superpowers:systematic-debugging` |
| Before opening a PR | `/code-review` at medium, plus `/security-review` on `contracts/src`, keeper and keys |
| Claiming a task done | `superpowers:verification-before-completion` |

## 4. Task row format

```
### T-X01, Example task
- Status: open
- Suggested: <name>
- Depends-on: T-A00
- Touches: contracts/src/
- Serves: Completion (judged) ; Pioneer award
- Acceptance: <something with a number in it>
- Evidence: <PR link, tx hash, BscScan link, deployed URL, recording>
- Kill criterion: <only for T-F spikes: when to stop and what to fall back to>
```

`Serves:` names an Innovation Award criterion: **Agent ID depth** (30%), **Practicality** (25%),
**Completion** (25%), **Innovation** (20%), or **Pioneer award** (ranked on Agent ID holder
addresses and transaction count), or `unblocks`. `Acceptance:` must contain a number.
`Suggested:` is who the plan expects to take it; anyone may claim any open task.

ID ranges, split by what each of us did on hydra:

| Range | Area | Suggested |
|---|---|---|
| `T-A` | Contract, tests, deploy, keeper, CI and the board | Jishnu |
| `T-B` | Website | Mouli |
| `T-C` | Agent skill and `pulse.mjs` | Mouli |
| `T-F` | Feasibility spikes, each with a `Kill criterion:` | split |
| `T-D` | Docs, demo, recruiting | split |
| `T-J` | Submission deliverables | split |
| `OP-N` | Human-only items, in `OPERATOR_TODO.md` | owner named per item |

## 5. Priority, and what can run at the same time

Tasks in one wave touch disjoint files, so Jishnu and Mouli (or their agents) can each hold one.

| Wave | When | Jishnu | Mouli |
|---|---|---|---|
| P0 | Nov 23, tonight | T-A00 **first, alone**; then T-A01 | after T-A00: T-F02, T-B01 |
| P1 | Nov 24 | T-A02, T-F01, T-A03, T-A04 | T-C01, T-F03, T-B02 |
| P2 | Nov 25, go/no-go day | T-A05, T-A06 | T-J01 (with Jishnu), T-B03 |
| P3 | Nov 26, last Claude day | T-D01, T-D02 | T-D03, T-D04 |
| P4 | Nov 27 to Dec 9, people only | T-D05 (with Mouli), T-J03 | T-D05, T-J02 |

Exit checks:
- **P0:** `forge test` passes with every unit test in T-A01, and CI runs it.
- **P1:** on BSC testnet, `pulse.mjs` prepares a `submit` that a test wallet sends, the keeper
  settles the day, and the website shows the result.
- **P2:** on BSC mainnet, one real Agent ID holder's `submit` from an Agentic Wallet in Developer
  Mode is on BscScan, the contract is verified, and the website is live on Vercel.
- **P3:** README, submission text, demo script and handoff are merged; nothing needs Claude after.

## 6. Qualification checklist (official rules, read 2026-11-23)

Rules: https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf.
Tick in a `board/` PR as items land.

**Eligibility**
- [ ] Contract deployed on BNB Chain (mainnet, because Agent ID exists only there), source verified and open source on BscScan (T-A05)
- [ ] Agent ID actively used: every commit is gated on `balanceOf(msg.sender) > 0` on `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` (T-A01)
- [ ] Submitted in the window with project name, website, contract address(es), Agent ID usage description (T-J03)

**Agent Application Innovation Award**
- [ ] Product live, with **30+ Agent ID addresses** having interacted with our contract during the submission period (T-D05)
- [ ] Judged: Agent ID depth 30%, Practicality 25%, Completion 25%, Innovation 20% (README and demo speak to each, T-D01, T-J02)

**Agent ID Ecosystem Pioneer Award (one award per project)**
- [ ] Ranked on Agent ID holder addresses interacting, transaction volume or count. Only submitted contract addresses count.

**Safety red lines (any one disqualifies)**
- [ ] No web QR or pairing-code login; no stored sessions acting for users (we have no login at all)
- [ ] The skill never bypasses transaction confirmation (T-C01 review)
- [ ] No unauthorized asset transfers or unlimited approvals (the contract moves no assets)
- [ ] Open source with owner permissions disclosed: README says "no owner, no admin, no pause, no upgrades" (T-D01)
- [ ] Name does not use "Binance" or "BNB" to impersonate the brand (OP-2)
- [ ] No seed phrases, private keys, API secrets or pairing codes collected
- [ ] No promised returns; "passive income" and "automatic money-making" never appear
- [ ] Risk warning on the website (T-B01)
- [ ] Agent ID is not a "look up wallets by name" tool: no `name.ai` names anywhere (T-B01)
- [ ] No volume manipulation or mass account registration: we never fund other people's wallets to interact, never create wallets to inflate numbers

---

# P0, Nov 23. Nothing branches until T-A00 lands.

### T-A00, Repo, CI and the board, copied from hydra
- Status: in-review https://github.com/Mouli51ch/binance-wallet-hackathon/pull/1 | Owner: Jishnu | Branch: feature/t-a00-board
- Suggested: Jishnu
- Depends-on: OP-1
- Touches: CLAUDE.md, TASKS.md, OPERATOR_TODO.md, DECISIONS.md, README.md, .env.example, .gitignore, .gitattributes, PLAN.md, docs/ARCHITECTURE.md, .github/, scripts/board.mjs, .claude/
- Serves: unblocks every task ; Completion (judged)
- Acceptance: hydra's `board.mjs`, `gates.yml`, PR template and Ponytail hook ported with the judged list changed to Agent ID depth, Practicality, Completion, Innovation, Pioneer award; `checks` runs `forge test` instead of pnpm; board lint passes on all rows in this file; 1 claim PR that edits a non-Status line fails CI; `PLAN.md` design moved to `docs/ARCHITECTURE.md` with 0 em or en dashes
- Evidence: <PR link with hygiene, checks and secrets green>

### T-A01, PulseForecast contract and unit tests
- Status: open
- Suggested: Jishnu
- Depends-on: T-A00
- Touches: contracts/ (except contracts/test/fork/ and contracts/script/)
- Serves: Agent ID depth (judged) ; Completion (judged)
- Acceptance: `commit`, `reveal`, `submit`, `settle`, `score` and all views as in `docs/ARCHITECTURE.md` section 5; no owner, no `payable`, no loops; at least 15 unit tests with a mock Agent ID and a mock Chainlink feed covering: non-holder refused, double commit refused, reveal outside its day or with a wrong salt refused, p10 > p50 refused, out-of-range refused, wrong or stale round refused, pinball loss for 3 known cases, baseline sigma update, crowd band average, unrevealed penalty, void day, one-tx `submit`; `forge test` green
- Evidence: <PR link, forge test output summary>

### T-F02, Agentic Wallet Developer Mode: exact commands and limits
- Status: done
- Suggested: Mouli
- Depends-on: T-A00
- Touches: docs/agentic-wallet.md
- Serves: unblocks T-C01 ; Agent ID depth (judged)
- Acceptance: from the official skill (github.com/binance/binance-skills-hub, binance-agentic-wallet) and the Developer Mode docs, `docs/agentic-wallet.md` lists the exact commands for: check Developer Mode, build a custom contract call, preview, execute with the preview's requestId, read the wallet address; plus the daily limit, the expiry, and whether testnet is supported; every claim has its source link; at least 5 commands documented
- Evidence: https://github.com/Mouli51ch/binance-wallet-hackathon/pull/3 ; Finding: 12 commands documented; custom contract calls are supported (kill criterion not hit); Developer Mode lasts 7 days, extended by each use; no testnet documented (7 mainnets listed); requireConfirmation false means no Binance App tap
- Kill criterion: no documented way to call a custom contract after 2 hours, so raise it with the organisers (OP-9) and keep building; the Nov 25 spike decides

### T-B01, Website scaffold with mock data
- Status: done
- Suggested: Mouli
- Depends-on: T-A00
- Touches: web/
- Serves: Completion (judged) ; Practicality (judged)
- Acceptance: Vite + viem static site with 5 sections from `docs/ARCHITECTURE.md` section 7 (today, yesterday, leaderboard, how to join, footer with risk warning) rendering from a mock data file; 0 wallet-connect code; 0 `name.ai` names; addresses shortened; works at 375 px wide; `npm run build` passes
- Evidence: https://github.com/Mouli51ch/binance-wallet-hackathon/pull/5 ; Finding: 5 sections render from sample data; page is 375 px wide at 375 px with no sideways scroll; build runs 3 model tests then builds in about 0.2 s; Vite drops the 3 classic scripts from dist unless copied, so vite.config.js copies them; loss unit assumed bps, T-B02 must confirm

# P1, Nov 24

### T-A02, Fork tests and gas
- Status: open
- Suggested: Jishnu
- Depends-on: T-A01
- Touches: contracts/test/fork/
- Serves: Agent ID depth (judged) ; cost metric
- Acceptance: on a BSC mainnet fork, 1 real Agent ID holder address (found from the Agent ID contract's Transfer events) can `commit` via `vm.prank` and 1 fresh address is refused; `settle` succeeds with a real historical Chainlink round at a real 00:00 UTC boundary; gas for `submit` (reveal + commit + score) measured and written in this row
- Evidence: <PR link, gas numbers>

### T-F01, Chainlink BNB/USD round at a day boundary
- Status: open
- Suggested: Jishnu
- Depends-on: T-A00
- Touches: spikes/F1/
- Serves: unblocks T-A04 ; Practicality (judged)
- Acceptance: for 7 past UTC midnights, a script finds the round current at the boundary by binary search over `getRoundData`; writes the gap between that round's `updatedAt` and midnight, the median heartbeat, and whether any phase change happened; results in `spikes/F1/result.json`
- Evidence: <spikes/F1/result.json at a commit>
- Kill criterion: rounds older than 2 hours at a boundary on 2 of 7 days, so settle with the first round after midnight instead and record the decision in DECISIONS.md

### T-A03, Deploy script and testnet deploy
- Status: open
- Suggested: Jishnu
- Depends-on: T-A01, OP-4
- Touches: contracts/script/, deployments/testnet.json
- Serves: Completion (judged) ; unblocks T-B02
- Acceptance: `forge script` deploys to BSC testnet (chain 97) with a mock Agent ID and a testnet price feed, then verifies on testnet BscScan; the address and block are in `deployments/testnet.json`; 1 full day cycle (commit, reveal, settle, score) run on testnet
- Evidence: <testnet BscScan links>

### T-A04, Keeper script
- Status: open
- Suggested: Jishnu
- Depends-on: T-F01, T-A03
- Touches: keeper/, .github/workflows/keeper.yml
- Serves: Completion (judged) ; Practicality (judged)
- Acceptance: `node keeper/settle.mjs` finds yesterday's boundary round and calls `settle`, then `score` for unscored holders; dry-run mode sends 0 transactions; a GitHub Actions cron at 00:05 UTC runs it with the key from a repo secret (OP-6); 1 successful testnet run
- Evidence: <Actions run link, tx hash>

### T-A07, Local mainnet-fork end-to-end
- Status: done
- Suggested: Mouli
- Depends-on: T-A01
- Touches: fork/, deployments/fork.json
- Serves: Completion (judged) ; unblocks T-B02
- Acceptance: 1 command starts anvil on a BSC mainnet fork, deploys PulseForecast from T-A01 against the real Agent ID contract, has 5 real Agent ID holder addresses (impersonated on the fork only) commit, reveal and get scored over 2 settled days, and 1 fresh address refused; settles against a replay of real Chainlink BNB/USD rounds, because a fork receives no new rounds; writes deployments/fork.json; the website shows the fork data
- Evidence: https://github.com/Mouli51ch/binance-wallet-hackathon/pull/13 ; Finding: submit (reveal + commit + score) costs 123,594 gas median, 174,707 max on the fork; 5 real holders x 5 scored days; fresh address refused; settles on real Chainlink rounds replayed with whole-day shifts

### T-A08, Live-contract fork end-to-end with the real skill
- Status: in-review https://github.com/Mouli51ch/binance-wallet-hackathon/pull/28 | Owner: Mouli | Branch: feature/t-a08-live-fork
- Suggested: Mouli
- Depends-on: T-A05, T-C01, T-A07
- Touches: fork/, deployments/fork.json
- Serves: Completion (judged) ; Agent ID depth (judged)
- Acceptance: 1 command forks BSC mainnet at its head with the deployed PulseForecast from deployments/mainnet.json (not a new deploy), swaps the Chainlink BNB/USD feed for a test feed on the fork only, has at least 3 real Agent ID holder addresses (impersonated on the fork only) forecast through skills/human-pulse/pulse.mjs prepare, moves the fork's clock day by day, settles, and ends with at least 5 scored days per holder; writes deployments/fork.json; the website shows the scores; nothing touches mainnet and no key is used
- Evidence: https://github.com/Mouli51ch/binance-wallet-hackathon/pull/28 ; Finding: the deployed contract and real pulse.mjs calldata scored 4 real holders x 5 days on the fork (submit 123,409 gas median, 174,522 max); the site ranked all 4 and showed 6 settled days; a fork needs the feed swapped because it gets no new Chainlink rounds, and the proxy's storage slot 1 must be cleared or the test feed's latest round reads garbage

### T-B04, App pages: dashboard, history, leaderboard, forecaster, make a forecast
- Status: done
- Suggested: Mouli
- Depends-on: T-B02
- Touches: web/
- Serves: Practicality (judged) ; Completion (judged)
- Acceptance: a read-only app at app.html with 5 views reachable from the landing page: dashboard (today's crowd band against the baseline band, countdown to 00:00 UTC, commits for tomorrow), history (every settled day: BNB move, crowd band, baseline band, both losses), leaderboard (sortable, address search, 5 scored days to rank), forecaster page per address (skill, in-band %, streak, missed reveals, each day's band against the outcome), make a forecast (low, middle and high sliders, how that band would have scored on past settled days, the exact prompt for the agent); 0 wallet-connect code; 0 `name.ai` names; works at 375 px; every view with forecasts carries "Forecasting signal only. Not financial advice."; tested on the T-A07 fork
- Evidence: https://github.com/Mouli51ch/binance-wallet-hackathon/pull/16 ; Finding: events alone rebuild every day and record, but give a baseline only for settled days (today's comes from baselineBand); on the fork the crowd beat the baseline on 4 of 5 settled days, inside its band 80% of the time

### T-C01, Agent skill and pulse.mjs
- Status: done
- Suggested: Mouli
- Depends-on: T-F02, T-A01
- Touches: skills/human-pulse/
- Serves: Agent ID depth (judged) ; Innovation (judged)
- Acceptance: `SKILL.md` follows the 5-step flow in `docs/ARCHITECTURE.md` section 6 and never confirms for the user; `pulse.mjs prepare` writes a salt to a local state file, builds the `submit` calldata whose commit hash matches the contract's in 1 shared test vector; `pulse.mjs status` prints 1 line; tested against the testnet deploy with 1 sent transaction
- Evidence: https://github.com/Mouli51ch/binance-wallet-hackathon/pull/20 ; commit hash matches the deployed mainnet contract on 2 vectors; mainnet-fork end to end against the deployed bytecode (no testnet key here, so no testnet tx) ; Finding: commit costs 77,451 gas and reveal plus commit 135,242; a commit confirmed after 00:00 UTC is filed for the wrong day and can never be revealed, so prepare prints sendBefore and refuses in the last 10 minutes

### T-C02, Skill read mode: anyone asks what the crowd expects
- Status: in-review https://github.com/Mouli51ch/binance-wallet-hackathon/pull/29 | Owner: Mouli | Branch: feature/t-c02-skill-read
- Suggested: Mouli
- Depends-on: T-C01, T-A05
- Touches: skills/human-pulse/
- Serves: Practicality (judged) ; Agent ID depth (judged)
- Acceptance: someone without an Agent ID, wallet or Developer Mode asks their agent what the Kodo crowd expects for BNB and gets 1 plain line from the live contract (the crowd's range and middle in % and in dollars at the live Chainlink price, yesterday's result against a typical day, the risk line); `SKILL.md` splits reading (anyone) from forecasting (Agent ID holders) and the read path runs no `baw` command; the line's wording has 1 test
- Evidence: https://github.com/Mouli51ch/binance-wallet-hackathon/pull/29 ; Finding: before anyone opens a forecast the crowd line can only say none are open yet, because sealed forecasts reveal nothing but their count; dollar levels come from the contract's own feed() so they match what scoring uses

### T-F03, Developer Mode can call a custom contract on mainnet
- Status: open
- Suggested: Mouli
- Depends-on: T-F02, OP-3
- Touches: spikes/F3/
- Serves: unblocks T-J01 ; Agent ID depth (judged)
- Acceptance: from an Agentic Wallet holding an Agent ID, with Developer Mode on, 1 call to a verified mainnet contract (a 20-line `Ping` contract, about $0.05 to deploy) goes through preview, user confirm and execute; preview time, total time and gas written in `spikes/F3/result.json`
- Evidence: <mainnet BscScan tx link>
- Kill criterion: no custom call works by Nov 25 12:00 UTC, so stop building, ask the organisers (OP-9), and decide in DECISIONS.md whether to continue

### T-B02, Website reads the testnet contract
- Status: done
- Suggested: Mouli
- Depends-on: T-B01, T-A03
- Touches: web/
- Serves: Completion (judged) ; Practicality (judged)
- Acceptance: the mock data file is replaced by viem reads of `deployments/testnet.json`; all 5 sections show live testnet data; the hero is the crowd band, "N verified people expect BNB between X% and Y%", built only from revealed forecasts (before any reveal it shows the commit count, never a guessed band), shortened addresses only, never `.ai` names; the contract address and network come from 1 config file so mainnet is a 1-line change; page loads in under 3 s on a public RPC
- Evidence: https://github.com/Mouli51ch/binance-wallet-hackathon/pull/14 ; Finding: contract losses are in tenths of a bps (site was 10x off, now /10 with a test); today comes from the contract, not the browser; fork mode works, testnet waits on T-A03

# P2, Nov 25. Go/no-go day.

### T-A05, Final name, mainnet deploy and verify
- Status: open
- Suggested: Jishnu
- Depends-on: T-A02, OP-2, OP-3
- Touches: contracts/script/, deployments/mainnet.json
- Serves: Completion (judged) ; Pioneer award
- Acceptance: deployed to BSC mainnet (chain 56) with the real Agent ID contract and the Chainlink BNB/USD feed confirmed in T-F01; source verified on BscScan; address and block in `deployments/mainnet.json`; deploy cost in this row
- Evidence: <BscScan verified contract link>

### T-J01, First real forecast from an Agentic Wallet
- Status: open
- Suggested: Mouli
- Depends-on: T-A05, T-C01, T-F03
- Touches: spikes/J1/
- Serves: Agent ID depth (judged) ; Completion (judged)
- Acceptance: 1 Agent ID holder runs the skill end to end on mainnet: forecast shown, preview, confirm, `submit` on BscScan; the next day 1 reveal and 1 score land; 1 non-holder wallet is refused; screen recording saved for the demo
- Evidence: <BscScan tx links, recording>

### T-A06, Keeper live on mainnet
- Status: open
- Suggested: Jishnu
- Depends-on: T-A04, T-A05, OP-5, OP-6
- Touches: .github/workflows/keeper.yml, keeper/
- Serves: Completion (judged) ; Practicality (judged)
- Acceptance: the cron settles the first mainnet day by 00:30 UTC; 3 consecutive days settled by Nov 28; a failure posts a visible Actions error
- Evidence: <Actions run links, settle tx hashes>

### T-B03, Website live on Vercel against mainnet
- Status: in-review https://github.com/Mouli51ch/binance-wallet-hackathon/pull/34 | Owner: Mouli | Branch: feature/t-b03-mainnet-site
- Suggested: Mouli
- Depends-on: T-B02, T-A05, OP-7
- Touches: web/, vercel.json
- Serves: Completion (judged) ; Practicality (judged)
- Acceptance: public Vercel URL shows mainnet data with the crowd band as the hero; risk warning visible; Lighthouse accessibility 90 or more; 0 console errors
- Evidence: https://kodo-forecast.vercel.app reads mainnet PulseForecast 0xa6EE7846434C385847B4e79EF529531a1124FfF6, 0 console errors; Lighthouse accessibility not measured yet ; Finding: on day one nothing is revealed, so the hero must count tomorrow's locked forecasts or it reads "no forecasts" while one exists

# P3, Nov 26. Last day with Claude.

### T-D01, README
- Status: open
- Suggested: Jishnu
- Depends-on: T-A05
- Touches: README.md
- Serves: Agent ID depth (judged) ; Practicality (judged)
- Acceptance: what it is, how to join in 4 steps, how scoring works, contract address with BscScan link, "Owner permissions: none (no owner, no admin, no pause, no upgrades, holds no funds)", risk warning, 1 section per judged criterion
- Evidence: <PR link>

### T-D02, HANDOFF.md: running it without Claude
- Status: open
- Suggested: Jishnu
- Depends-on: T-A06
- Touches: docs/HANDOFF.md
- Serves: unblocks T-D05 ; Completion (judged)
- Acceptance: exact commands for: run the keeper by hand, redeploy the website, check holder count, top up the keeper wallet; what to do for the 5 most likely failures; a person who did not build it follows it in under 15 minutes
- Evidence: <PR link>

### T-D03, Submission text and Agent ID usage description
- Status: open
- Suggested: Mouli
- Depends-on: T-A05
- Touches: docs/SUBMISSION.md
- Serves: Agent ID depth (judged) ; Innovation (judged)
- Acceptance: every submission field drafted (name, website, contract address, Agent ID usage description, team); 0 promises of returns or accuracy; usage description under 150 words
- Evidence: <PR link>

### T-D04, Demo script, 90 seconds
- Status: open
- Suggested: Mouli
- Depends-on: T-J01
- Touches: demo/
- Serves: Innovation (judged) ; Completion (judged)
- Acceptance: 4 scenes timed to 90 s or less: the problem (a crowd number anyone can fake with wallets), a live forecast with preview and confirm, "Three Doors" as read-only `eth_call` simulations against mainnet (a wallet with no Agent ID refused, a second forecast in the same round refused, an Agent ID transfer refused by Binance's own contract and credited to it) then one real forecast accepted, the crowd band and the next-day score. No `.ai` names, no attack wallets created or funded, no "humans vs AI" framing, no judge gimmicks; every number on screen is a real one
- Evidence: <PR link>

# P4, Nov 27 to Dec 9. People only.

### T-D05, Recruit 30+ Agent ID holders
- Status: open
- Suggested: Mouli
- Depends-on: T-J01
- Touches: docs/recruiting.md
- Serves: Pioneer award ; Practicality (judged)
- Acceptance: recruiting starts the day T-J01 lands, not on Nov 27; 15 distinct Agent ID holders have sent a `submit` by Dec 1, 30 by Dec 6, counted from contract events; each joined on their own wallet and their own BNB; progress logged daily
- Evidence: <holder count from events, date>
- Kill criterion: under 10 holders on Dec 1, so all effort goes to recruiting and the Pioneer award

### T-J02, Demo video
- Status: open
- Suggested: Mouli
- Depends-on: T-D04
- Touches: demo/
- Serves: Completion (judged) ; Innovation (judged)
- Acceptance: video of 3 minutes or less following T-D04, showing real mainnet transactions and the live site
- Evidence: <video link>

### T-J03, Submit
- Status: open
- Suggested: Jishnu
- Depends-on: T-D03, T-J02
- Touches: docs/SUBMISSION.md
- Serves: Completion (judged) ; Pioneer award
- Acceptance: submitted by **2026-12-08 12:00 UTC**, 20 hours before the deadline; confirmation saved
- Evidence: <confirmation screenshot>
