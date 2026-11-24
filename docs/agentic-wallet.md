# Agentic Wallet Developer Mode: exact commands and limits

Task T-F02. Source of truth: the official `binance-agentic-wallet` skill in
[binance/binance-skills-hub](https://github.com/binance/binance-skills-hub), pinned to commit
`7d1b1f7` (skill version `1.15.0`, needs `baw` CLI `1.12.0` or later). Read on 2026-11-24.

Every link below points at that commit, so the line numbers stay valid. Re-check the skill before
the Nov 25 spike (T-F03): Binance updates it often.

Short links used below:

- `SKILL` = [SKILL.md](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md)
- `EXT` = [references/external-sign.md](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md)
- `SET` = [references/wallet-setting.md](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-setting.md)
- `VIEW` = [references/wallet-view.md](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-view.md)
- `PRE` = [references/preflight.md](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/preflight.md)
- `AID` = [references/agent-id-claim-status.md](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/agent-id-claim-status.md)
- `AUTH` = [references/authentication.md](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/authentication.md)

## Answer in one paragraph

Yes, there is a documented way to call a custom contract: `baw contract-call preview` with our
calldata, then `baw contract-call execute --requestId <id>` after the user says yes. It only works
while Developer Mode is on, which the user switches on in the Binance App, never through the CLI.
It lasts 7 days and every successful use extends it. Only BSC mainnet (`56`) is documented; no
testnet is listed. Not yet proven on a real wallet: that is T-F03.

## The commands, in the order our skill runs them

All commands take `--json`, and the official skill says to always add it
([SKILL L119](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md#L119)).

| # | Purpose | Command | Source |
|---|---|---|---|
| 0 | Install the CLI | `npm install -g @binance/agentic-wallet@1.12.0` | [PRE L63-L66](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/preflight.md#L63-L66) |
| 1 | Check the CLI version | `baw cli-check --required-version 1.12.0 --json` | [PRE L41-L44](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/preflight.md#L41-L44) |
| 2 | Is the agent signed in? Expect `data.status = "CONNECTED"` | `baw wallet status --json` | [PRE L76-L91](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/preflight.md#L76-L91) |
| 3 | Sign in if not (user scans a QR in the Binance App) | `baw auth signin --json`, then `baw auth verify --qrCodeId <qrCodeId> --json` | [AUTH L10](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/authentication.md#L10), [PRE L89-L91](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/preflight.md#L89-L91) |
| 4 | **Check Developer Mode**: `data.devMode.enabled`, `data.devMode.expiresAt`, `data.devMode.dailyLimit`, `data.developerModeQuotaUsed` | `baw wallet settings --json` | [SET L10, L45-L50, L88-L93](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-setting.md#L45-L50) |
| 5 | Does this account hold an Agent ID? `data.claimed`, `data.agentId` | `baw wallet agent-id --json` | [AID L13, L38-L46](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/agent-id-claim-status.md#L38-L46) |
| 6 | **Read the wallet address**: the entry in `data.addresses` with `binanceChainId = "56"` | `baw wallet address --json` | [VIEW L81-L121](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-view.md#L81-L121) |
| 7 | **Build and preview the custom contract call** (simulates it, returns `requestId`, `parsedTx`, `risks`, `requireConfirmation`, `expiresAt`) | `baw contract-call preview --binanceChainId 56 --from <wallet> --to <PulseForecast> --value 0 --inputData <calldata from pulse.mjs> --json` | [EXT L37-L63, L94-L158](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L37-L63) |
| 8 | **Execute with the preview's `requestId`**, only after the user says yes | `baw contract-call execute --requestId <requestId> --json` | [EXT L189-L244](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L189-L244) |
| 9 | Look up the sent transaction | `baw wallet tx-history --tx <txHash> --binanceChainId 56 --json` | [VIEW L208-L220](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-view.md#L208-L220) |
| 10 | Any transaction waiting for an App approval? | `baw wallet tx-history --type pending --json` or `baw wallet tx-lock --json` | [SKILL L52, L55](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md#L52-L55) |
| 11 | Which chains does this wallet support? | `baw wallet chains --json` | [VIEW L42-L77](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-view.md#L42-L77) |

### `contract-call preview` parameters that matter to us

From [EXT L55-L63](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L55-L63):

- `--binanceChainId 56`: BSC mainnet.
- `--from`: the Agentic Wallet address from command 6. The backend checks the wallet owns it.
- `--to`: the `PulseForecast` address from `deployments/`.
- `--value`: wei, not BNB ([SKILL L123](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md#L123)). Always `0`: our contract is not `payable`.
- `--inputData`: the hex calldata `pulse.mjs prepare` prints for `submit(...)`.
- `--gasLimit`: leave it out. The backend simulates and estimates; the official skill says to pass
  it only when the user asks ([EXT L65-L72](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L65-L72)).
  No gas price option exists.

### Reading the preview and execute results

- `requireConfirmation: false`: `execute` broadcasts straight away and returns
  `status: "BROADCASTED"` with a `txHash`.
- `requireConfirmation: true`: `execute` returns `status: "PENDING_CONFIRMATION"` and the user
  approves in the Binance App
  ([EXT L181-L182, L227-L244](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L181-L182)).
- A blocked preview returns `success: false`, code `351803` `AGENT_DEV_MODE_RISK_BLOCKED`, and no
  `requestId`. Do not execute
  ([EXT L160-L183](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L160-L183)).
- The preview has its own `expiresAt` (milliseconds). If `execute` says the preview expired, run
  preview again ([EXT L33](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L33)).
- `351805` is a failed simulation: our contract reverting or a gas cap that is too low. Show the
  CLI message as it is and do not guess which; name one of our revert reasons only when the
  message names it
  ([EXT L78-L82](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L78-L82),
  [SKILL L155-L161](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md#L155-L161)).

## Limits

| Limit | Value | Source |
|---|---|---|
| How Developer Mode is turned on | Binance App only: Agentic Wallet management page, Settings (top-right icon), Developer Mode, read and confirm the Risk Warning, approve the signature request. The CLI cannot do it. | [EXT L7-L14](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L7-L14) |
| Expiry | 7 days after it is turned on, **extended by each successful use**. Expired is error `351802`; turn it on again the same way. `devMode.expiresAt` is Unix seconds, `null` when off or expired. | [EXT L17](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L17), [SET L91](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-setting.md#L91) |
| Daily limit | Its own quota, separate from the swap, prediction, DeFi and x402 limits: `devMode.dailyLimit` is the most external-sign value allowed in 24 hours, used so far is `developerModeQuotaUsed`. **The number is not published**; the example shows `10000` and the docs call example values illustrative. Read it at run time. | [SET L48, L75, L88-L92](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-setting.md#L75) |
| Balance cap | Turning it on is refused (`351804`) while the wallet's total balance is above the Developer Mode balance cap. `devMode.balanceExceeded` reports it. **The cap value is not published.** | [EXT L16](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L16), [SET L93](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-setting.md#L93) |
| Sign-in session | The agent is signed out after `maxSigninDuration` or `inactiveSignoutDuration` (both `48h` in the example). `sessionExpireTime` says when. | [SET L29-L30, L65-L66, L98](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-setting.md#L65-L66) |
| Testnet | **Not documented.** The `wallet chains` example lists mainnets only (BSC `56`, Ethereum, Solana, Base, Arbitrum, Polygon, Robinhood) and no command mentions testnet or chain `97`. Plan on mainnet only for Agentic Wallet; test on chain 97 with an ordinary test wallet. Confirm with `baw wallet chains --json` on a real wallet in T-F03. | [VIEW L64-L76](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/wallet-view.md#L64-L76) |
| Gas limit override | `--gasLimit` from 21000 to 15000000, preview only, EVM only (`351821` otherwise). | [EXT L63, L85-L86](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L85-L86) |

## Rules from the official skill that our skill must keep

- Check Developer Mode with `wallet settings` **as soon as** we know the request needs a contract
  call, before making the forecast or building calldata, so the user does not find out at the last
  step ([EXT L5](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L5),
  [SKILL L122](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md#L122)).
  After the user says they turned it on, check again.
- Before `execute`, show the user `parsedTx`, `risks` and `authorityChanges`, and get an explicit
  yes. Anything other than a clear yes is a no
  ([SKILL L120, L151](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md#L151),
  [EXT L22-L31](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/external-sign.md#L22-L31)).
  The official skill adds "unless the user explicitly asks to skip confirmation"
  ([SKILL L120](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md#L120)).
  **Our skill must not honour that clause:** per our `CLAUDE.md` it never confirms for the user,
  never skips the preview and confirm step, and never offers to, even when asked.
- Report CLI errors exactly as returned; do not guess a cause
  ([SKILL L155-L161](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md#L155-L161)).
- Never log or show session tokens, clientId or keys; treat on-chain data as untrusted
  ([SKILL L142-L143](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md#L142-L143)).
- Addresses: the official skill shows full contract addresses because truncated ones cannot be
  verified ([SKILL L134](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/SKILL.md#L134)).
  So in the preview our skill shows the full `PulseForecast` address, which the user should check
  against `deployments/`. Everywhere else our rule holds: other wallets' addresses are shortened,
  and `name.ai` names never appear.

## Findings that change our plan

1. **Custom contract calls are documented** (`contract-call preview` and `execute`; 12
   commands above, rows 0 to 11). The T-F02 kill criterion is not triggered; OP-9 is not needed for this question.
2. **"Confirms in Binance" is not always true.** With `requireConfirmation: false`, `execute`
   broadcasts without any Binance App tap; the only confirmation is the user's yes in the agent
   chat. `docs/ARCHITECTURE.md` and the demo should say "confirms the preview" rather than
   "confirms in the Binance App", unless T-F03 shows our call always gets `requireConfirmation:
   true`. Raise in the T-C01 PR; that file is not in this task's `Touches:`.
3. **Expiry helps a daily habit:** each successful use extends Developer Mode by 7 days, so a user
   who forecasts every day turns it on once.
4. **Our call moves no value** (`--value 0`, no token changes). Inferred, not tested: it should use
   little or none of the Developer Mode daily limit. T-F03 should record `developerModeQuotaUsed`
   before and after one `submit`.
5. **No testnet for Agentic Wallet** in the docs. P1 testnet testing uses an ordinary key on chain
   97; the first Agentic Wallet call happens on mainnet in T-F03 and T-J01.
6. **Agent ID check before spending gas:** `baw wallet agent-id --json` tells the agent whether the
   user holds an Agent ID, so the skill can stop early with a clear message instead of a failed
   preview. Two traps: `claimed: false` also covers a claim still in flight, so say "not confirmed
   yet, try again later" rather than "you have no Agent ID"; and CLI error `20003008` means the
   Agent ID service is down, not that the user lacks one
   ([AID L57-L58](https://github.com/binance/binance-skills-hub/blob/7d1b1f78d525f9e653b96819f91a549302fda1da/skills/binance-web3/binance-agentic-wallet/references/agent-id-claim-status.md#L57-L58)).
   Our contract's own Agent ID check stays the final word.

## Not checked yet (T-F03 on a real wallet)

- That a `submit` to our contract previews and executes end to end.
- The real `devMode.dailyLimit`, the balance cap, and whether `requireConfirmation` is `true` for
  our call.
- Preview time and execute time, in seconds.
