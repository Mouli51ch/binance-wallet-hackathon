# OPERATOR_TODO.md, the human-only queue

Things no agent can do: fund a wallet, claim an Agent ID, turn on Developer Mode, change repo
settings, log in to Vercel, ask the organisers. An agent that hits one of these writes the `OP-N`
entry here, sets its task to `blocked, see OP-N` in `TASKS.md`, and moves to another task.

**Never fake a transaction, a verification link or a measurement to look done.** Never paste a
private key or seed phrase anywhere: not in chat, not in git, not in a PR.

Entry format, and every entry says which task it unblocks:

```
### OP-0, One-line title (this block is the format, not a real item)
- Status: open
- Owner: <name>
- Needed by: <date>
- Unblocks: T-A01
- What exactly: ...
- Done when: ...
```

Status values: `open` | `claimed <date> | Owner: <name>` | `done <date>: <result>` |
`decided <date>: <decision>` | `dropped <date>: <reason>`. A `decided` item needs a row in
`DECISIONS.md` in the same PR.

---

### OP-1, Give Jishnu write access and set up main
- Status: open
- Owner: Mouli
- Needed by: 2026-11-23
- Unblocks: T-A00
- What exactly: on github.com/Mouli51ch/binance-wallet-hackathon, Settings > Collaborators: add `jishnu-baruah` with Write (today it has Read only). Settings > General: allow auto-merge and squash merging. After T-A00 lands: a branch rule on `main` requiring a pull request and the `secrets`, `checks` and `hygiene` checks.
- Done when: `gh repo view Mouli51ch/binance-wallet-hackathon --json viewerPermission` shows WRITE for Jishnu.

### OP-2, Final project name
- Status: open
- Owner: Jishnu, Mouli
- Needed by: 2026-11-25 (before the mainnet deploy)
- Unblocks: T-A05
- What exactly: "Human Pulse" clashes with an existing Solana project. Pick a name that does not use "Binance" or "BNB" as a brand, check it on GitHub, X and a web search, and record it in DECISIONS.md.
- Done when: a DECISIONS.md row names it.

### OP-3, An Agentic Wallet with an Agent ID and Developer Mode on
- Status: open
- Owner: Mouli
- Needed by: 2026-11-24
- Unblocks: T-F03, T-J01
- What exactly: claim an Agent ID in the Binance App (Wallet > homepage banner > Agent ID), set up Agentic Wallet with an agent, enable Developer Mode in the app, and hold about 0.002 BNB on BNB Smart Chain (BEP20) for gas. Jishnu should do the same so we have 2 real holders on day 1.
- Done when: the wallet address is in this entry and `balanceOf` on the Agent ID contract returns 1 for it.

### OP-4, Deployer wallet funded
- Status: open
- Owner: Jishnu
- Needed by: 2026-11-24
- Unblocks: T-A03, T-A05
- What exactly: a fresh wallet used only for deploys. About 0.01 BNB on BSC mainnet (BEP20 network) plus testnet BNB from the BNB Chain faucet. The key goes in `.env` only.
- Done when: the address and both balances are in this entry.

### OP-5, Keeper wallet funded
- Status: open
- Owner: Jishnu
- Needed by: 2026-11-25
- Unblocks: T-A06
- What exactly: a second fresh wallet that only sends `settle` and `score`. About 0.003 BNB on BSC mainnet. Never reuse the deployer.
- Done when: the address and balance are in this entry.

### OP-6, Keeper key as a GitHub Actions secret
- Status: open
- Owner: Mouli
- Needed by: 2026-11-25
- Unblocks: T-A04, T-A06
- What exactly: repo Settings > Secrets and variables > Actions: add `KEEPER_PRIVATE_KEY` (from OP-5, pasted by Jishnu directly into GitHub, never sent in chat) and `BSC_RPC_URL`.
- Done when: both secret names show in the repo settings.

### OP-7, Vercel project
- Status: open
- Owner: Mouli
- Needed by: 2026-11-25
- Unblocks: T-B03
- What exactly: log in to Vercel, import the repo with root `web/`, note the project URL.
- Done when: the URL is in this entry.

### OP-8, BscScan API key for verification
- Status: open
- Owner: Jishnu
- Needed by: 2026-11-24
- Unblocks: T-A03, T-A05
- What exactly: free Etherscan v2 API key (covers BscScan), stored in `.env` as `ETHERSCAN_API_KEY`.
- Done when: `forge verify-contract` works on the testnet deploy.

### OP-9, Question for the organisers (only if T-F02 or T-F03 fails)
- Status: open
- Owner: Mouli
- Needed by: 2026-11-25
- Unblocks: T-F03
- What exactly: ask whether Agentic Wallet Developer Mode can call a custom contract, and which commands to use.
- Done when: the answer and its source are in this entry.

### OP-10, When does Claude access end on Nov 26?
- Status: open
- Owner: Jishnu
- Needed by: 2026-11-24
- Unblocks: T-D01, T-D02
- What exactly: confirm the exact end time so P3 work is scheduled before it.
- Done when: the time is in this entry.
