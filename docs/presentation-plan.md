# Presentation & Defence Plan

Mapped to the published rubric. Read this once as a team, then rehearse twice.

**Where we stand: 85/100 is already built. The missing points are almost
entirely presentation and rehearsal, not code.**

| Criterion | Pts | State | What is left |
| --- | --- | --- | --- |
| Idea & Motivation | 10 | Strong — README §1 answers "why not a database" directly | Say it out loud in the first 90 seconds |
| Technical Implementation | 25 | Strong — 3 layers, hand-built chain, bridge, chain sync | Choose *what not to show*; we cannot cover it all |
| Live Demonstration | 15 | Scripted, both scenarios work | **Rehearse. Record a backup.** Pre-flight checklist below |
| Testing & Validation | 10 | 78 + 68 tests, 100% stmt coverage, real benchmarks | One slide with the numbers — currently they live only in files |
| README & Repository | 15 | Strong — ten-item README, four supporting docs | Nothing |
| Presentation Quality | 10 | **Nothing exists** | Build the deck from §2 below |
| Oral Questions | 15 | Material exists in `technical-walkthrough.md` | **Assign owners, then cross-train** (§4) |

---

## 1. The story we are telling

One sentence, and everything hangs off it:

> **A ticket that cannot be resold above its face value, enforced by code that
> even the organizer cannot change.**

Three beats, in this order:

1. **The problem is not technical.** A ticketing company could cap resale in
   their database today. They don't, because they earn a fee on every resale —
   and nobody can audit whether they applied the rule to themselves.
2. **So move the rule somewhere nobody owns.** The ceiling is in a smart
   contract with no admin function to raise it. Every transfer is publicly
   verifiable. Off-contract resale is *impossible*, not merely forbidden.
3. **And make it local.** Tickets and their state replicate across peers at the
   venue over a blockchain we built ourselves — no company, no server, no
   third-party service anywhere in the running system.

If the audience remembers one thing, it should be beat 1 → beat 2. That is the
motivation mark.

---

## 2. Deck outline (15 minutes)

Times are speaking time. Aim to finish at 14:00 so questions do not eat the demo.

| # | Slide | Time | Speaker |
| --- | --- | --- | --- |
| 1 | Title — TicketChain, team, one-line pitch | 0:30 | David |
| 2 | **The problem** — scalping, who loses, why the operator won't fix it | 1:30 | David |
| 3 | **Why blockchain, not a database** — the three bullets from §1 beat 2 | 1:30 | David |
| 4 | **Architecture diagram** — three layers + the bridge | 2:00 | Haythem |
| 5 | **The hand-built chain** — tx → Merkle → PoW → gossip → sync | 2:30 | Khalil |
| 6 | **Anti-scalping in three places** — listing, payment, transfer lockdown | 2:00 | Mahmoud |
| 7 | **LIVE DEMO** — sunny, then rainy | 4:00 | David drives, others narrate |
| 8 | **Testing & benchmarks** — the numbers slide | 1:00 | Khalil |
| 9 | **Limitations & future work** — volunteered, not extracted | 1:00 | Mahmoud |
| 10 | Close + questions | — | all |

### Slide 4 — the architecture diagram

The rubric names this explicitly. Use the mermaid diagram from
[`architecture.md`](architecture.md), rendered to an image, and **walk the path
of one purchase across it** rather than reading the boxes:

> Wallet signs → contract enforces and emits → bridge republishes as a signed
> transaction → mined into our chain → gossiped to peers → served by the node's
> HTTP API. The app reads ownership from the contract directly.

### Slide 6 — the strongest technical beat

Three rules, one enforcement mechanism:

```
listForSale     → price <= faceValue        "Scalping detected"
resaleTransfer  → msg.value == listing.price "Payment must equal the listed price"
_update         → only via resaleTransfer    "Transfers only allowed through resaleTransfer"
```

Then the line that lands it: **without the third one the first two are
decoration** — a scalper takes cash and calls `transferFrom`. That is why we
deliberately broke ERC-721 compliance.

### Slide 8 — the numbers

Do not hand-wave testing; show it.

```
Contract        78 tests   100% statements, 97.4% branches
Blockchain core 68 tests   signing, Merkle, PoW, chain validation, sync, API
Two-node        live test  discovery + convergence

sign 0.32 ms · validate 0.33 ms · mine 389 ms (median, 16-bit)
peer discovery 0.87 s · block propagation 2.84 s
```

Say why the **median** mining time is quoted and not the mean: nonce search is
geometric, the mean (755 ms) is dragged by one 2.7 s outlier in ten runs.

---

## 3. Demo runbook

Full detail in [`demo-scenarios.md`](demo-scenarios.md). This is the stage
version.

### Pre-flight — do all of this before walking in

- [ ] **Every machine on the same commit.** Different versions of the signed
      transaction payload silently fork the P2P network.
- [ ] `./stop_dev.sh` then `./start_dev.sh`, and wait for `✅ All systems running`.
- [ ] **MetaMask → Settings → Advanced → Clear activity tab data.** A fresh chain
      resets nonces; without this *the first transaction of the demo fails*.
- [ ] MetaMask on **Hardhat Local (31337)**, accounts #0 and #1 imported.
- [ ] MetaMask → Security & privacy → **Display NFT media** on.
- [ ] Browser zoom ~125%, only the app and a terminal open.
- [ ] A poster image on the desktop, ready to pick.
- [ ] **Backup recording of the whole demo on the laptop**, playable offline.

### ☀️ Sunny day (2 min)

1. Organizer page → event name, future date, 0.05 ETH, quantity 3, poster image
   → **Mint & List**. Point out: one transaction creates the event, mints the
   batch and lists all three.
2. Buy Tickets — cards appear instantly. **Say it:** the grid enumerates from
   `totalMinted()` on the contract; the P2P feed catches up a second later
   through the bridge. Show `network.log` if there is time.
3. Switch to account #1 → **Buy Ticket** → confirm → card moves to My Tickets.
4. Click the wallet icon → the ticket appears **inside MetaMask** with its
   artwork and attributes. This is the moment that proves it is a real NFT.

### ⛈️ Rainy day (2 min)

Run both scripts, they are fast and the output is quotable:

```bash
cd contracts
npx hardhat run scripts/demo-rainy-day.js --network localhost   # scalping, 2 ways
npx hardhat run scripts/demo-limits.js    --network localhost   # bulk buyer, expired ticket
```

Four refusals, none bypassable from any client:

```
Scalping detected: Price exceeds face value
Payment must equal the listed price
Primary purchase limit reached for this event
Event has already started
```

**Closing line for the demo:** three different problems — scalping, bulk buying,
stale tickets — refused by the same require-and-revert mechanism, and none of
them can be routed around by using a different client.

### If something breaks on stage

- First transaction fails → say "stale wallet nonce, one second", clear activity
  data, retry. **Do not debug silently.**
- Node down → the app still works; use it as the honest limitation point from
  slide 9 and move on.
- Total failure → switch to the recording, keep narrating.

---

## 4. Oral questions — 15 points, judged individually

The rubric says *every* team member must be able to explain decisions. The trap
is each of us knowing only our own layer.

### Primary owners (you wrote it, you defend it in depth)

| Area | Owner | Be ready to explain |
| --- | --- | --- |
| Contract, listings, artwork, `tokenURI` | **David** | Why the ceiling moved to listing time; the `_update` lockdown; the consumed re-entrancy flag; on-chain SVG |
| P2P overlay, bridge, feed | **Haythem** | Localized `community_id`; why the bridge exists; per-ticket face value in republished transactions; feed de-duplication |
| Chain sync, benchmarks, demos | **Khalil** | Longest-valid-chain + the genesis check; the node that could never catch up; why median mining time |
| Organizer flow, purchase cap, expiry | **Mahmoud** | Primary vs secondary sale and why the cap only applies to one; `block.timestamp` vs browser clock; chain-first enumeration |

### Everybody must be able to answer these five, cold

1. **Why blockchain and not a database?** → the operator is not neutral; the
   rule must live where they cannot change it.
2. **Where is the anti-scalping rule enforced?** → three places: `listForSale`,
   `resaleTransfer`, `_update`. Name all three.
3. **Why two blockchains?** → Ethereum for value and wallets, our chain for
   peer-replicated announcement and because building the primitives is the
   point. The bridge joins them.
4. **What breaks if the P2P node dies?** → the web app keeps working; the feed
   and peer replication stop. **Volunteer this — don't get caught by it.**
5. **What is your consensus?** → PoW, longest *valid* chain sharing our genesis.
   16-bit difficulty is a demo parameter, not a security claim.

### The uncomfortable ones — rehearse the wording

- *"Your token isn't ERC-721 compliant."* → Correct, deliberately. A compliant
  token can move outside our contract, which defeats the ceiling. We traded
  tooling compatibility for the guarantee.
- *"Is 16 bits secure?"* → No, and it isn't meant to be. Real security here comes
  from the cooperative local setting; the mechanism is genuine, the parameter is
  tuned so mining is visible on stage.
- *"Isn't your P2P layer just a mirror?"* → Yes. It replicates verified state
  across peers with no server, which is what a localized network needs, and the
  contract stays the source of truth for ownership.
- *"Why is the image on `127.0.0.1`?"* → Uploaded posters are served by our node;
  tickets minted without one carry SVG generated in the contract and render
  anywhere. The uploaded path is local-only and we know it.

Full answers: [`technical-walkthrough.md`](technical-walkthrough.md) §8.

---

## 5. What to do before demo day

**Must:**
1. Build the deck (§2) — this is the only rubric line with nothing behind it.
2. Rehearse the demo end to end **twice**, on the demo machine, from
   `stop_dev.sh`.
3. Record the backup video during a successful rehearsal.
4. Each member reads `technical-walkthrough.md` §8 and answers the five common
   questions out loud to another member.

**Should:**
5. Render the architecture diagram to an image for the slide.
6. Decide who answers what when a question comes in — one person starts, the
   owner elaborates. Silence and cross-talk both cost marks.

**Deliberately not doing before the presentation:** new features. Everything on
the issue list (event grouping, check-in, gifting, chain persistence) is future
work. A rehearsed demo of what exists beats an unrehearsed demo of more.
