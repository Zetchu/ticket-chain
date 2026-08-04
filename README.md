# TicketChain — a localized peer-to-peer event ticketing network

**CS414 Fundamentals of Blockchain**

Event tickets as ERC-721 assets on a chain we control, announced across a
peer-to-peer network we built ourselves, with a resale price ceiling that no
organizer, reseller, or platform operator can override.

| | |
| --- | --- |
| **Run it** | [`getting-started.md`](getting-started.md) — setup, MetaMask, buying and reselling end to end |
| **Architecture** | [`docs/architecture.md`](docs/architecture.md) |
| **Demo runbook** | [`docs/demo-scenarios.md`](docs/demo-scenarios.md) |
| **How we built it** | [`docs/development-process.md`](docs/development-process.md) |
| **Hosted page** | `ticket-chain-ten.vercel.app` — a landing page only. The chain and the P2P node run on *your* machine, so the working demo is local by design. |

---

## 1. Problem, users, and why a blockchain

**The problem.** Scalping. A ticket for a high-demand event sells at face value
and reappears minutes later at five times the price. The loss falls on
attendees, and the organizer has no way to stop it once the ticket has left
their system — resale happens on platforms they don't control, in private
messages, in cash.

**The users.**

- **Organizers** issue tickets and want them in the hands of actual attendees
  rather than bots and resellers.
- **Attendees** buy a ticket, and sometimes need to sell it on — plans change,
  and a ticket you can't transfer is worth nothing.
- **Peers on the local network** — other nodes at the same event — replicate
  the ledger of what has been issued and sold.

**Why not just a database?** This is the question the project exists to answer,
so it deserves a direct one.

A ticketing company with a database can already stop scalping today: refuse
transfers above face value. The reason scalping persists is not technical, it's
that *the operator of the database is not a neutral party*. They earn a fee on
every resale, so a higher resale price is more revenue. Nothing stops them
raising the cap, making exceptions for partners, or quietly running the
secondary market themselves — and no attendee can audit whether they did.

Moving the rule into a smart contract changes who can break it:

- **The ceiling is enforced by code, not policy.** `listForSale` reverts above
  face value. The organizer deployed that contract but cannot amend it; there is
  no admin function to lift the cap, and we deliberately did not write one.
- **Every transfer is publicly verifiable.** Anyone can check who owns a ticket
  and what it sold for, without trusting our word for it.
- **Off-contract resale is impossible, not merely forbidden.** Raw ERC-721
  transfers are blocked, so a scalper cannot agree a cash price privately and
  hand over the token. Ownership can only move through the priced, capped path.

A database can hold the same rows. What it cannot do is convince a sceptical
attendee that the rule was applied to everyone, including the people running it.

---

## 2. System architecture

Three layers, each with a distinct job. The full diagram is in
[`docs/architecture.md`](docs/architecture.md).

```
React frontend (Vite, wagmi/viem, MetaMask)
        │  reads ticket state, signs transactions
        ▼
Ethereum layer — Hardhat node + TicketNFT.sol      :8545
        │  emits TicketMinted / Listed / Unlisted / Transferred
        ▼
Bridge (network/bridge.py, web3.py)
        │  republishes each event as a signed P2P transaction
        ▼
P2P layer — PyIPv8 overlay + hand-built blockchain :8090 (UDP)
        │  mempool → Merkle → proof-of-work → gossip → chain sync
        ▼
HTTP API (FastAPI)                                 :8080  GET /tickets, /health
```

**Ethereum layer — ownership and money.** `TicketNFT.sol` is the authoritative
ledger: who holds which ticket, what it is listed at, who gets paid. Payment and
transfer happen atomically inside `resaleTransfer`.

**P2P layer — our own blockchain.** `network/blockchain/` implements
transactions, ECDSA signing, a Merkle tree, proof-of-work mining, and full chain
validation from scratch, with no Ethereum dependency. `TicketChainCommunity`
gossips transactions and blocks over IPv8, and nodes reconcile disagreements
with a longest-valid-chain rule.

**The bridge connects them.** Contract events become signed P2P transactions, so
the peer-replicated ledger reflects what actually happened on-chain instead of
being a parallel universe. This is the seam where the project became one system
rather than two.

**Why this shape?** The course requires a hand-built blockchain; a real ticket
marketplace requires programmable money and a wallet users already trust. Rather
than pretend one can do both jobs, we let Ethereum handle value transfer and our
own chain handle localized, verifiable propagation, and made the bridge the
explicit, documented link between them. The honest limitation of that choice is
in §8.

---

## 3. Dependencies

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | 20 or 22 LTS | Hardhat warns on newer majors |
| Python | **3.10+** | pyipv8 3.x needs it; macOS ships 3.9 |
| libsodium | any | native dependency of pyipv8; `brew install libsodium` |
| MetaMask | current | or any injected EIP-1193 wallet |

Installed automatically by `./start_dev.sh` and `npm install`:

- **Contracts** — Hardhat 2, OpenZeppelin Contracts 5 (ERC-721, Ownable), Chai.
- **Frontend** — React 19, Vite 8, MUI 9, wagmi 3, viem 2, TanStack Query 5,
  React Router 7, TypeScript 6.
- **Network** — pyipv8 3.2.1, cryptography 43, web3 7.16, FastAPI, uvicorn.

---

## 4. Installation and how to run

```bash
git clone https://github.com/Zetchu/ticket-chain.git
cd ticket-chain
./start_dev.sh
```

That starts the Hardhat chain, deploys the contract, exports its ABI and address
to the frontend, starts the P2P node with its bridge and HTTP API, and starts
Vite. Ctrl+C stops everything. The first run also creates `network/.venv` and
installs the Python dependencies; later runs reinstall only when
`requirements.txt` changes.

Then add the local network to MetaMask (RPC `http://127.0.0.1:8545`, chain ID
**31337**) and import a Hardhat test account.
[`getting-started.md`](getting-started.md) has the full walkthrough with keys.

For the two-node demo — a second peer whose chain arrives entirely by P2P sync:

```bash
./start_demo.sh
```

Individual pieces:

```bash
cd contracts && npx hardhat node                          # chain only
cd contracts && npx hardhat run scripts/deploy.js --network localhost
cd network   && .venv/bin/python -u main.py               # P2P node + API
cd frontend  && npm run dev                               # UI only
```

---

## 5. Example usage

**As an organizer.** Connect account #0 (the deployer) — the Organizer page
appears. Enter an event name, date and quantity, then Mint & List. One
transaction creates the event, mints the batch, and lists every ticket at the
0.05 ETH face value. The cards appear on Buy Tickets immediately, and the bridge
publishes the events to the P2P ledger within a couple of seconds.

**As an attendee.** Switch to another account, open Buy Tickets, click Buy, and
confirm. `resaleTransfer` checks the listing, moves the token, and forwards the
ETH to the seller atomically. The ticket moves to My Tickets.

**As a reseller.** On My Tickets, List for resale, set a price at or below face
value, confirm. It appears on Buy Tickets for everyone else, and you can Change
price or Unlist at any time.

**Inspecting the P2P layer directly:**

```bash
curl http://127.0.0.1:8080/tickets   # ticket offerings this node knows about
curl http://127.0.0.1:8080/health    # chain length, mempool size, validity
```

---

## 6. Design decisions

**The price ceiling is enforced at listing time, not at purchase time.**
Originally `resaleTransfer` checked `msg.value <= faceValue`. That refused
overpayment but had two problems: it allowed *underpayment* — a buyer could take
any ticket for 0 wei — and it meant an over-priced ticket could still be
advertised. Moving the check into `listForSale` means a scalper cannot even
publish the offer, and `resaleTransfer` then requires payment to equal the
listed price exactly, closing both directions.

**Listings are opt-in, so no one is forced to sell.** Before listings existed,
any buyer could call `resaleTransfer` on any ticket and take it at face value
from an unwilling holder. A ticket now moves only if its owner has offered it.

**All raw ERC-721 transfers are blocked.** `_update` rejects every ownership
change that does not come through `resaleTransfer`. This deliberately breaks
ERC-721 compliance — `transferFrom` always reverts — because a compliant token
would let a scalper settle in cash and transfer directly, bypassing the ceiling
entirely. We chose the anti-scalping guarantee over the standard, which is the
kind of trade-off worth stating out loud rather than hiding.

**The re-entrancy guard is consumed, not cleared.** `_inResale` authorizes
exactly one transfer and is unset inside `_update` before `onERC721Received`
fires, so a malicious buyer contract cannot re-enter from its callback and move
the ticket on while the guard is still open.

**Event details are stored once per event, not per ticket.** Tickets reference
an event ID; a 500-seat show stores its name once instead of 500 times.

**The frontend enumerates tokens from the chain, not from the P2P feed.**
`totalMinted()` gives the authoritative token range, so a freshly minted ticket
renders immediately rather than waiting for the P2P node to catch up. The feed
supplies supplementary metadata.

**The P2P overlay is partitioned by event name.** The IPv8 `community_id` is
derived from `--event`, so nodes for different events form disjoint overlays.
Combined with UDP-broadcast bootstrapping (no public trackers), discovery stays
inside the local network segment — which is what "localized" means here.

**Every P2P message carries a small proof-of-work.** An 8-bit search puzzle
(~256 hashes) is cheap for a legitimate sender and verified in a single hash by
the receiver, so spam is dropped before any signature check. Block mining uses a
separate, harder 16-bit target.

---

## 7. Benchmarking and evaluation

Reproduce with `cd network && .venv/bin/python benchmark.py --p2p`; raw numbers
in [`network/benchmark_results.json`](network/benchmark_results.json).

| Metric | Result |
| --- | --- |
| Transaction sign (median, n=200) | **0.32 ms** |
| Transaction validate (median, n=200) | **0.33 ms** |
| Sign + validate (mean) | **0.79 ms** |
| Block mining, 16-bit difficulty (median, n=10) | **389 ms** (mean 755 ms, ~66k nonce iterations) |
| Peer discovery latency | **0.87 s** |
| Block propagation to a second node | **2.84 s** |

**Reading these.** Signing and validating are sub-millisecond, so throughput is
bounded entirely by proof-of-work, not cryptography. Mining time varies widely
(7 ms to 2.7 s across ten runs) because nonce search is a geometric process —
the median is the honest figure to quote, not the mean. Propagation is
comfortably faster than a human refreshing a page, which is why a purchase shows
up on a second node before anyone notices.

**Contract gas** is not benchmarked: the chain is local and gas is free, so any
figure would say more about Hardhat than about the design.

---

## 8. Known limitations and future work

We would rather state these than have them found.

- **The web app does not depend on the P2P layer.** The UI reads ticket state
  from the contract; the P2P chain mirrors it. Kill the Python node and the app
  keeps working. The P2P layer is a genuine peer-replicated blockchain and the
  bridge keeps it faithful, but it is an announcement and replication layer, not
  the frontend's source of truth.
- **`GET /tickets` returns one row per event, not per ticket.** A mint emits two
  events, so a token appears twice in the raw feed. The UI de-duplicates by
  token ID; the endpoint itself does not.
- **Bridged tickets lose their event name and date.** The P2P `Transaction`
  schema has no fields for them, so the feed shows `Ticket #3` and the
  transaction timestamp. Cards look right only because the frontend reads the
  real values from the contract.
- **Tickets have no artwork.** `tokenURI` is unimplemented, so wallets show a
  blank NFT. The UI generates a deterministic gradient per token ID as a
  placeholder.
- **Nothing persists across restarts.** Both chains are in-memory or in
  Hardhat's ephemeral state; `./start_dev.sh` starts from an empty ledger.
- **One event's tickets share one hard-coded face value** (`FACE_VALUE`,
  0.05 ETH), fixed at deploy time.
- **The P2P chain has no fork-choice beyond longest-valid-chain**, and no
  incentive layer — mining is done by whichever node bridged the event.
- **Localized discovery is a design choice with a cost:** two nodes on different
  network segments will never find each other.

**Future work, in the order we would do it:** de-duplicate the feed; carry event
metadata through the bridge; implement `tokenURI` with on-chain SVG art so
tickets render in wallets with no external dependency; persist the P2P chain to
disk; per-event pricing.

---

## 9. Testing coverage

```bash
cd contracts && npx hardhat test                              # 53 tests
cd network   && .venv/bin/python -m pytest test_blockchain.py # 54 tests
cd network   && .venv/bin/python test_two_nodes.py            # live two-node sync
```

**Contracts — 53 tests.** Minting and organizer-only access control; the event
registry (details stored per batch, separate batches on separate events,
metadata surviving a resale); listing and cancellation, including refusal above
face value, from non-owners, and on locked tickets; purchase, covering exact
payment, over- and underpayment, unlisted and cancelled tickets, buying your own
ticket, and repeat resale; a mock contract that rejects ETH, to reach the
"payment to seller failed" branch no EOA test can; and the transfer lockdown —
`transferFrom`, `safeTransferFrom`, approved addresses and operators are all
blocked.

**Blockchain core — 54 tests.** Signature verification and tamper rejection; the
price-ceiling rule; Merkle roots for even and odd leaf counts plus inclusion
proofs; proof-of-work mining and verification; whole-chain validation against
tampered transactions, broken links and forged proofs; the per-message search
puzzle; the longest-valid-chain rule, including rejection of shorter, invalid,
and foreign-genesis chains; and the HTTP API.

**Integration.** `test_two_nodes.py` starts two IPv8 nodes and asserts mutual
discovery and chain convergence. `docs/demo-scenarios.md` is a manual runbook
for the sunny- and rainy-day paths, with the captured output of each.

**What is not covered:** no frontend unit or end-to-end tests — the UI was
verified manually and with a headless-browser render check. The Vercel
deployment runs `tsc -b && vite build` on every push, so a type error cannot
reach `main` unnoticed; ESLint is run locally with `npm run lint`.

---

## 10. Contributors

| | Area |
| --- | --- |
| **David** | Project setup, `TicketNFT.sol`, resale listings, frontend |
| **Haythem** | P2P network layer, contract-to-P2P bridge |
| **Khalil** | Chain sync and the two-node demo, benchmarking, demo runbook, progress reports |
| **Mahmoud** | Primary market (organizer minting), chain-first ticket enumeration |

Commit history on `main` reflects the split; each feature landed through a pull
request from its own branch.
