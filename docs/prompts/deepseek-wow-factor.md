You are a hackathon strategist and product designer who has judged and won many crypto and AI hackathons. I need ONE strong "wow factor" for my project: a single moment in a 90-second demo that makes judges sit up. Read the full project description below carefully before answering. Be critical and specific. Generic ideas ("add AI", "add gamification", "add NFTs", "add a dashboard", "add a chatbot") are useless unless you say exactly what the judge sees on screen and why it is impossible without our core technology.

# PART 1: THE HACKATHON

- Event: Binance Wallet x BNB Chain "Agent ID Hackathon". Submission period 2026-11-18 08:00 UTC to 2026-12-09 08:00 UTC. Only on-chain activity inside that window counts.
- Agent ID: the on-chain name of a Binance "Agentic Wallet", shaped like name.ai. It is an ERC-721 token on BNB Smart Chain mainnet (contract 0x60b9262456de011f7d15a54cdd8c48baaa8b022f, name "SPACE ID Agent ID", symbol "AI"). Each Binance user can claim only ONE, and it is non-transferable. Holder check: balanceOf(address) > 0. It is claimed only inside the Binance App. It does not exist on testnet.
- Agentic Wallet: a Binance keyless (MPC) wallet that the user's AI agent operates through a command line tool and "skills". Custom smart contract calls only work in "Developer Mode", which the user must switch on in the Binance App (the agent cannot), which has its own daily limit and expires. Every Developer Mode call is: the agent runs a preview (simulation), the user explicitly confirms, then the agent executes with the preview's request id. Only EIP-712 typed-data signing; no personal_sign.
- Awards (one project can win only one):
  1. Agent Application Innovation Award (top 10 projects, 10,000 USDC for first). Judged by a panel: Agent ID application depth 30%, practicality and feasibility 25%, product completion 25%, innovation 20%. Eligibility: product live, with at least 30 distinct Agent ID addresses having interacted with our contract during the submission period.
  2. Agent ID Ecosystem Pioneer Award (top 10). Ranked purely on on-chain data: number of Agent ID holder addresses interacting with our submitted contracts, plus transaction volume or transaction count.
- Submission needs: project name, website, contract addresses (deployed on BNB Chain, source verified and open source on BscScan), and an Agent ID usage description.
- Disqualifying red lines:
  - No web QR code or pairing-code login for Agentic Wallet; never store user sessions on a server to act for users.
  - Skills must never contain prompts that bypass the user's transaction confirmation.
  - No unauthorized asset transfers: no scheduled collection, no automatic transfers to fixed addresses, no bundled extra transfers, no unlimited approvals.
  - Contracts open source with every owner permission disclosed.
  - No use of "Binance" or "BNB" in names to impersonate the brand.
  - Never collect seed phrases, private keys, API secrets or pairing codes.
  - Never promise returns. "Passive income" and "automatic money-making" are banned. Trading products must show a risk warning.
  - Agent ID must not be packaged as a tool for looking up other people's wallets by name.
  - No malicious volume manipulation, no mass account registration, no fake activity.

# PART 2: OUR PROJECT IN FULL

## 2.1 One line
"Human Pulse" (working name): a free-to-play BNB prediction contest that bots cannot farm, because every entry must come from a different Binance Agent ID.

## 2.2 The problem
- Every crowd number in crypto can be faked or farmed: polls, sentiment indexes, "predict and win" campaigns, quests, airdrops, giveaways. One person with hundreds of wallets or bots can dominate them.
- Projects spend large budgets on campaigns and quests, and much of it goes to bot farms and multi-account users.
- Free prediction contests are especially easy to farm: a farmer submits every possible answer from many wallets and always wins.

## 2.3 Why Agent ID solves it
One Agent ID per Binance user, never transferable. A contract that only accepts one entry per Agent ID holder per round means five hundred wallets are still one person. A free contest becomes possible because farming it no longer works.

## 2.4 Who the users are
- Players (forecasters): Binance users who hold an Agent ID and run an AI agent with Agentic Wallet. They play for free (gas only, about $0.005 per transaction) and can win weekly prizes for skill.
- Sponsors (later): crypto projects that pay for prize seasons to reach verified real people instead of bots.
- Agent builders and data users (later): people who want an open dataset of bot-free, hindsight-free human forecasts, or want to benchmark their own agent against verified humans.
- Readers: anyone who wants to see what verified humans expect BNB to do next.

## 2.5 How a player joins (one time)
1. Claim an Agent ID in the Binance App (Wallet, homepage banner, Agent ID).
2. Set up Agentic Wallet with an AI agent (for example a coding agent or assistant that can run skills).
3. Turn on Developer Mode in the Binance App.
4. Install the "Human Pulse" skill in the agent.
5. Keep a tiny amount of BNB for gas.

## 2.6 What happens each round
Rounds are planned at 12 hours, starting 00:00 and 12:00 UTC (the length is a deploy-time setting: 24h, 12h or 8h).
1. The player tells their agent something like "BNB looks flat to slightly down for the next half day, not confident" or simply "make my forecast". The agent turns this into three numbers for BNB's % change over the next round: a low (10th percentile, "90% sure it ends above this"), a middle (median), and a high (90th percentile, "90% sure it ends below this").
2. The agent generates a random salt, stores the numbers and salt locally on the user's machine, and builds ONE transaction that does two things: reveals the numbers for the round that just started (committed in the previous round) and commits a hash of the forecast for the next round.
3. The agent runs the Developer Mode preview. The player sees what will be sent and confirms it in Binance. The agent executes. One confirmation per round.
4. At the end of the round, anyone (our keeper bot, or any user) settles it.
5. Every revealed forecast for that round is scored, and the agent reports one line back to the player: the crowd band, the outcome, their score versus the baseline, and their streak.

Timing for a forecast for round R:
| When | What |
|---|---|
| During round R-1 | Commit: hash of (player address, round R, low, middle, high, salt) |
| During round R | Reveal: numbers plus salt, checked against the hash |
| Start of round R+1 | Settle round R with the Chainlink price at R's end |
| After settle | Score each holder's round R forecast |

## 2.7 Settlement
- Price source: Chainlink BNB/USD feed on BNB Smart Chain (0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE, 8 decimals). It updated roughly every 30 seconds when we measured it.
- settle(round, roundId): anyone passes the Chainlink round id that was current at the round boundary. The contract checks with getRoundData that this round updated at or before the boundary and the next one after it. If the price is more than 2 hours stale, the round is void and nobody is scored. The contract trusts nothing but Chainlink.
- Outcome of round R: (price at R's end minus price at R's start) / price at R's start, in basis points.

## 2.8 Scoring
- Each of the three numbers is scored with pinball (quantile) loss. For quantile q (0.1, 0.5, 0.9), forecast x and outcome y:
  loss_q = q × (y − x) if y ≥ x, else (1 − q) × (x − y). The round loss is the sum of the three. Lower is better. It is a proper scoring rule: reporting what you truly believe is the best strategy; a huge "safe" range loses every round and a narrow range loses more when it misses.
- Baseline: middle = 0 (no change), low and high = ∓1.2816 × sigma, where sigma is an on-chain EWMA of recent round outcomes (sigma² ← 0.94 sigma² + 0.06 outcome²).
- Worked example: forecast low −2.4%, middle +0.3%, high +2.9%; outcome +1.0%. Loss = 0.1 × 3.4 + 0.5 × 0.7 + 0.1 × 1.9 = 0.88. Baseline with sigma 2.5% (low −3.2%, high +3.2%): 0.42 + 0.50 + 0.22 = 1.14. Skill this round = 1.14 − 0.88 = +0.26 (beat the baseline).
- A forecast that was committed but never revealed scores twice the baseline's loss, so hiding a bad forecast never helps.
- Crowd band for a round: the average of all revealed lows, middles and highs, scored the same way.
- Per-player stats stored on-chain: rounds committed, rounds scored, missed reveals, total loss, total baseline loss, rounds where the outcome fell inside the player's low to high range (calibration; ideal about 80%), current streak of beating the baseline.
- Weekly prizes (planned): the best players by skill versus the baseline that week, with a minimum number of rounds. Paid manually by the team from our own wallet and announced publicly. The contract never holds or moves money.

## 2.9 The contract (PulseForecast, Solidity, Foundry)
- Immutable config: Agent ID contract address, Chainlink feed, staleness limit, starting sigma, round length.
- Functions: submit(nextCommit, hasReveal, low, middle, high, salt) for the normal one-transaction round; commit(hash); reveal(low, middle, high, salt); settle(round, roundId); score(player, round).
- Views: current round, round info (start price, end price, outcome, crowd band, crowd loss, baseline loss), player stats, a forecast by player and round, and simple composable views such as skill(address) and roundsPlayed(address) that any other contract could read.
- Events: Committed, Revealed (with the three numbers), Settled, Scored. Together they form an open dataset anyone can read from the chain.
- No owner, no admin, no pause, no upgrades, no payable functions, no token transfers, no loops over players.
- Rules enforced: Agent ID holder check on commit; one commit per player per round; reveal only inside its round and must match the hash; numbers ordered low ≤ middle ≤ high and within ±50%.

## 2.10 The agent skill
- SKILL.md in plain language plus a small helper script.
- Steps: check Developer Mode is on (if not, tell the user to switch it on in the Binance App); make or translate the forecast; show it to the user in one line; build the transaction with the helper (salt stored locally); run the preview; wait for the user's explicit confirmation; execute; report the one-line result.
- It never confirms on the user's behalf and never tells the agent to skip confirmation.

## 2.11 The keeper
A small script on a GitHub Actions schedule that settles each round just after the boundary and scores players who were not scored yet. It uses a separate wallet holding only a little gas money. Anyone can do the same by hand.

## 2.12 The website
- Static, read-only, no wallet connect, no Agent ID names shown (shortened addresses only).
- Today: a landing page in a black, technical "studio index" style with a particle-scroll text effect (text dissolves into grains and reassembles on scroll), explaining how it works, the forecast format, rules and how to join.
- Planned: live crowd band, round results, weekly leaderboard, a page per address with its record, a daily CSV/JSON export of all forecasts.

## 2.13 Business model (later, not built now)
1. Hackathon prize and ecosystem grants.
2. Sponsored seasons: a project funds a week's prize pool; its name is on the season; every participant is a verified human; we take a fee.
3. Sponsored questions: projects ask their communities questions that cannot be botted.
4. Data and API: the bot-free, hindsight-free forecast history for funds and agent builders.

## 2.14 What exists today and what does not
- Done: full design, task board, CI setup, landing page.
- Not started: the contract, tests, agent skill, keeper, live results on the website.
- Not yet tested: whether an Agentic Wallet in Developer Mode can call a custom contract at all (our biggest unknown; we plan a 20-line test contract on mainnet first).

## 2.15 Team, time, budget
- 2 people. About 3 build days left with AI coding help, then about 12 days of manual work (recruiting users, demo video, submission).
- Budget: tens of dollars. Gas is about $0.005 per transaction on BNB Chain.

## 2.16 Known weaknesses (be honest about these)
- Demand: a forecast contest with no money is a chore; users told us nobody cares about public reputation. Prizes help but need a budget.
- Friction: Agent ID plus Agentic Wallet plus Developer Mode (expires, daily limit) plus installing a skill plus one confirm per round.
- The agent often makes the numbers, so "human forecast" is really "one agent per human".
- Commit-reveal means a forecast is scored about one round after it is made, so feedback is delayed.
- Two weeks of data proves nobody's skill statistically; the crowd band with 30 players is noisy.
- Many hackathon entries will use Agent ID as a login gate; ours must look clearly deeper.

# PART 3: WHAT WE ALREADY CONSIDERED (do not repeat unless you substantially improve it)
- A daily BNB forecast sold as public reputation: rejected, nobody cares about reputation.
- A 3D particle landing page: decoration, judges see these all the time.
- "Train trading agents on our data": true but needs months of data; not a demo moment.
- Generic leaderboards, streaks and badges.
- A live bot-farm demo (50 wallets fire forecasts; 1 accepted, 49 refused on BscScan): decent, but we want something stronger or a sharper version.
- Speaking a forecast in plain words and the agent putting it on-chain: decent, but agents sending transactions is common at this hackathon.
- Broadening to "verified-human polls and predictions on any question": promising, still open.

# PART 4: CONSTRAINTS FOR YOUR IDEAS
- The wow must be REAL and demoable live on mainnet, or as a screen recording of real mainnet transactions. No fake data, no staged numbers.
- It must not break any red line in Part 1.
- It must make Agent ID essential: impossible, or obviously worse, without one-person-one-Agent-ID.
- Buildable by 2 people in about 3 days, or a small addition to the design in Part 2.
- No money held by the contract.

# PART 5: WHAT "WOW" MEANS HERE
- A judge understands it in under 10 seconds without crypto jargon.
- It shows something that was not possible before Agent ID.
- It is visual or visceral: something happens on screen, on-chain, live.
- Ideally it also gives real users a reason to come, come back, or share (helps the 30+ address requirement and the Pioneer ranking).

# PART 6: WHAT I WANT FROM YOU
1. Give 10 distinct wow-factor ideas: 4 safe (small additions to our design), 4 bold (bigger but buildable in 3 days), 2 wild (risky but potentially award-winning).
2. For EACH idea give:
   - Name (3 to 6 words).
   - The 10-second version a judge sees in the demo (describe the screen, not the concept).
   - Why it is impossible or much worse without Agent ID.
   - Exactly what to build: contract changes, skill changes, website changes.
   - Build effort in hours for 2 people, and the riskiest unknown.
   - How it helps get 30+ real Agent ID holders to use it.
   - Which red line it comes close to, and how to stay clear of it.
   - Harsh scores from 1 to 10 for: wow, Agent ID depth, feasibility in 3 days, user pull.
3. Pick your single best idea and give:
   - A 90-second demo script, second by second.
   - The one-sentence pitch.
   - The 3 things most likely to go wrong in the live demo, and a backup for each.
4. Finally, say bluntly whether the core concept (a bot-proof prediction contest) is too weak. If it is, propose ONE better core concept that uses Agent ID deeply, can be built in 3 days by 2 people, and reuses as much of Part 2 as possible (Agent ID gate, commit-reveal, Chainlink settlement, on-chain scoring, no-funds contract).

Rules for your answer: no filler, no motivational talk, no buzzwords. Concrete, testable, honest. If an idea needs data or users we will not have by 2026-12-09, say so and lower its score.
