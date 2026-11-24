# DECISIONS.md

Every decision taken after `docs/ARCHITECTURE.md` was written: date, topic, decision, why. Where this file and
another disagree, **this file wins, because it is dated**, and the other file is corrected to
match.

**Hand-written, append-only, newest last.** An `OP-N` whose Status starts with `decided` must have
a row here naming it. Add the row in the same PR as the decision. If two PRs add a row at once,
git conflicts on the last line, and the fix is to keep both rows.

The Why column is one sentence.

| Date | Topic | Decision | Why | Ref |
|---|---|---|---|---|
| 2026-11-23 | Network | Build and test on a local BSC mainnet fork and BSC testnet; the submitted contract is on BSC mainnet. | The Agent ID contract has code only on mainnet (checked by RPC), and both awards count real Agent ID holders. | chat, 23 Nov |
| 2026-11-23 | Forecast format | Each holder submits p10, p50, p90 of next-day BNB % change in basis points, scored by pinball loss against Chainlink. | Up/down carries no volatility or confidence, and a plain range rewarded for containing the price is gamed by making it huge. | chat, 23 Nov |
| 2026-11-23 | Anti-copying | Chained commit-reveal in one transaction per day. | Public forecasts can be copied before the window closes; one transaction keeps Developer Mode friction low. | chat, 23 Nov |
| 2026-11-23 | Money | The mainnet contract holds and moves no funds; the paid trader layer is roadmap only. | Three build days, and no funds means no fund risk and nothing to disclose beyond "no owner". | chat, 23 Nov |
| 2026-11-23 | Name | Build under the working name "Human Pulse"; rename before the mainnet deploy. | The name is taken by a Solana project, but it should not block the build. | OP-2 |
| 2026-11-23 | Process | Hydra's protocol: claim PR, then feature PR, board lint in CI, OP queue for humans. | Two people and their agents work in parallel without stepping on each other. | T-A00 |
| 2026-11-23 | Repo | Code lives in the public repo Mouli51ch/binance-wallet-hackathon. | The rules require open source; Mouli created it. | chat, 23 Nov |
| 2026-11-24 | Demo and site | The demo shows the attacks as read-only simulations ("Three Doors") and the website hero is the crowd band from revealed forecasts. Rejected from the DeepSeek wow-factor answer: `.ai` names, a 100-wallet attack on mainnet, "humans vs AI", the human-oracle pivot. | Real refusals at zero cost and zero rule risk; the band is the one number nobody else can show is real people. | docs/prompts/deepseek-wow-factor.md |
