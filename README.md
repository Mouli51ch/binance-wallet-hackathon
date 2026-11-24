# Human Pulse (working name)

A daily BNB forecast made only by verified humans, one per Binance **Agent ID**. Each holder's AI
agent submits a low, middle and high estimate (p10, p50, p90) of tomorrow's BNB % change in one
confirmed transaction. The contract scores every forecast against Chainlink and compares it with
a simple baseline, so anyone can see the crowd's forecast band and each forecaster's honest track
record.

Built for the Binance Wallet x BNB Chain Agent ID Hackathon.

**Forecasting signal only. Not financial advice. No returns are promised.**

## Status

Work in progress. The board is `TASKS.md`; the design is `docs/ARCHITECTURE.md`.

## Owner permissions

None. The contract has no owner, no admin, no pause, no upgrades, and holds or moves no funds.

## Contributing

Read `CLAUDE.md`, then `TASKS.md` sections 1 to 3: claim a task with a `claim/t-<id>` PR, then do
the work in a `feature/t-<id>-<slug>` PR.
