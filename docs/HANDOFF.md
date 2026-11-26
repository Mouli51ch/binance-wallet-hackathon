# Running Kodo without Claude

Everything here works from a fresh clone on Windows, macOS or Linux. You need Node 22, Git, and
[Foundry](https://getfoundry.sh) (`cast`, `forge`) for the chain commands. Commands run from the
repo root unless a step says otherwise. Secrets live only in `.env` (git-ignored, copy it from
`.env.example`) or in GitHub Actions secrets. Never paste a private key into chat, a PR or an
issue.

## What runs where

| Part | Where | Runs by itself? |
| --- | --- | --- |
| Contract `0xa6EE7846434C385847B4e79EF529531a1124FfF6` | BSC mainnet | Yes. No owner, nothing to maintain |
| Website https://kodo-forecast.vercel.app | Vercel project `kodo`, built from `web/` | Yes. Reads the chain in the browser |
| Event history snapshot | `.github/workflows/snapshot.yml`, every 6 hours, `snapshot` branch | Yes |
| Keeper (settle and score) | `.github/workflows/keeper.yml`, daily 00:05 UTC | Only plans until `KEEPER_PRIVATE_KEY` is set |
| Forecasts | Each forecaster's agent with the skill, confirmed by the forecaster | Yes |

`settle` and `score` are open to anyone, so if the keeper stops, anybody can run it by hand.

## 1. Run the keeper by hand

```sh
cd keeper
npm ci
# read only: prints what it would send, sends nothing
RPC_URL=https://rpc-bsc.48.club node settle.mjs --dry-run
# for real: reads KEEPER_PRIVATE_KEY from the repo's .env
RPC_URL=https://rpc-bsc.48.club node --env-file=../.env settle.mjs
```

In PowerShell set the RPC with `$env:RPC_URL = "https://rpc-bsc.48.club"` and drop it from the
front of the command. Each line it prints is a transaction it sent or skipped, with the reason.
A rerun when everything is settled sends nothing.

Or on GitHub: **Actions > keeper > Run workflow**, untick `dry_run`.

Use `rpc-bsc.48.club` (or any RPC that keeps the full event history). `bsc-rpc.publicnode.com`
answers blocks older than about a day with no events instead of an error, so the scoring sweep
would quietly score nobody.

## 2. Turn on the daily keeper (once)

1. In your own terminal, make a fresh wallet that is used for nothing else: `cast wallet new`.
   Keep the private key in your password manager.
2. Send it about 0.003 BNB on BSC mainnet from your own wallet. That covers years: `settle` costs
   about 150,000 gas, about 0.0000075 BNB at 0.05 gwei, and each `score` costs less than that.
3. GitHub repo **Settings > Secrets and variables > Actions > New repository secret**: name
   `KEEPER_PRIVATE_KEY`, value the key, starting `0x`. Paste it there yourself, nowhere else.
4. **Actions > keeper > Run workflow** with `dry_run` unticked. The first run catches up every day
   since 24 Nov 2026, in order. Check the `settle` lines in its log.

## 3. Top up the keeper wallet

```sh
cast balance <keeper address> --ether --rpc-url https://bsc-rpc.publicnode.com
```

Below 0.001 BNB, send more from your own wallet. Nothing else needs changing.

## 4. Redeploy the website

`vercel build` fails on Windows (symlinks), so build locally and upload the output:

```sh
cd web
npm ci
npx vercel link --project kodo   # once per clone, logs in to Vercel
npm run snapshot                 # event history into web/public/snapshot.json
npm run build
```

Then copy `web/dist` to `web/.vercel/output/static`, write `{"version":3}` to
`web/.vercel/output/config.json`, and run:

```sh
npx vercel deploy --prebuilt --prod --yes
```

Check it landed: the script name in `https://kodo-forecast.vercel.app/app.html` (view source,
`assets/app-<hash>.js`) matches the one in `web/dist/app.html`.

## 5. Check holders and forecasts

```sh
# does a wallet hold an Agent ID? 1 or more = yes
cast call 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F "balanceOf(address)(uint256)" <wallet> --rpc-url https://bsc-rpc.publicnode.com
# what the crowd expects today, how many forecasts are sealed and opened
cd skills/human-pulse && npm ci && node pulse.mjs crowd
```

The website's **Forecasts** page lists every forecast of the last 14 days by forecaster, and
**Leaderboard** shows everyone with their scored days.

## 6. Verify the contract on BscScan (once)

Get a free Etherscan v2 API key (it covers BscScan) and put it in `.env` as `ETHERSCAN_API_KEY`.
Then:

```sh
cd contracts
forge verify-contract 0xa6EE7846434C385847B4e79EF529531a1124FfF6 src/PulseForecast.sol:PulseForecast --chain 56 --etherscan-api-key <the key, or $ETHERSCAN_API_KEY> --constructor-args $(cast abi-encode "constructor(address,address,uint256,uint32)" 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F 0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE 7200 250) --watch
```

The settings in `contracts/foundry.toml` (solc 0.8.28, cancun, 10,000 optimizer runs) are the ones
it was deployed with. The source is already verified on Sourcify.

## When something goes wrong

| What you see | Cause | What to do |
| --- | --- | --- |
| A day shows "Not settled yet" after 00:30 UTC | The keeper did not run or has no key | Run section 1. If the log says `KEEPER_PRIVATE_KEY is missing`, do section 2 |
| Keeper log: `insufficient funds` | The keeper wallet is empty | Section 3, then rerun the workflow |
| Keeper log: `skip settle(...)` with a revert reason | The round or day is not settleable yet (for example, before the next Chainlink round after midnight) | Wait 5 minutes and rerun; it only settles boundaries that have passed |
| Website: "Could not read the mainnet contract" | The public RPC is down or rate-limiting | Reload in a minute. If it lasts, change `mainnet` in `web/src/config.js` to another BSC RPC and redeploy (section 4) |
| The snapshot workflow is red | `rpc-bsc.48.club` timed out | Rerun it from Actions. The site still works; older history is just read more slowly |
| A forecaster's transaction reverts with `NotAgentIdHolder` | The sending wallet holds no Agent ID | Send from the wallet that holds the Agent ID (check with section 5) |
| The skill refuses to prepare a forecast near midnight | It stops 10 minutes before 00:00 UTC, because a commit confirmed after midnight is filed for the wrong day | Send it after 00:00 UTC for the next day |

Contract errors name their cause and the next step in `contracts/src/PulseForecast.sol` (search for
`error`). Everything else is in `docs/ARCHITECTURE.md`.
