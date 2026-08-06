# Live Demo Scenarios — Step-by-Step Runbook

This document is the rehearsal/run script for the two Week 2 live demos
referenced in the [README](../README.md#5-live-demo-scenarios):

- **☀️ Sunny Day** — a regular, face-value ticket transfer via the UI.
- **🌧️ Rainy Day** — a scalper attempts to sell above face value, in both of
  the ways that are possible, and the contract refuses each one.
- **🌧️ Rainy Day (limits)** — a bulk buyer hits the per-wallet cap on the
  primary sale, and a ticket for an event that has already started can no
  longer be traded.
- **🔗 Two-Node Propagation** — a second P2P node joins (or rejoins) the
  network and catches up on the chain it missed via chain sync, instead of
  getting stuck out of sync forever.

Both were run end-to-end against this repo while writing this doc; the
exact commands and output below are real, not illustrative.

## 0. One-time setup

### 0.1 Start the stack

```bash
./start_dev.sh
```

This brings up, in order: the local Hardhat node (`:8545`), a fresh
`TicketNFT` deployment, the PyIPv8 P2P node with its HTTP API (`:8080`),
and the React frontend (`:5173`). Wait for `✅ All systems running!` before
continuing — the frontend retries its first `/tickets` fetch twice, but the
Hardhat node genuinely needs to be up before the deploy step runs.

The P2P node's event bridge (`network/bridge.py`) watches the deployed
contract, so every mint, listing, cancellation, and purchase lands in the
P2P feed automatically — mint tickets from the organizer panel and they
appear in the grid with no manual seeding step.

For Scenario 3 below (two-node chain sync), use `./start_demo.sh` instead —
it's the same stack plus a second P2P node.

> **Windows note:** `start_dev.sh` is written for macOS/Linux (it symlinks
> `libsodium` from Homebrew for pyipv8). On Windows, run the three
> services manually in separate shells instead — `npx hardhat node` and
> `npx hardhat run scripts/deploy.js --network localhost` in `contracts/`,
> `python main.py` in `network/` (see the venv/libsodium notes in
> this doc's [Troubleshooting](#troubleshooting) section), and `npm run dev`
> in `frontend/`.

### 0.2 Configure MetaMask (once per browser profile)

1. Add a network: **Hardhat Local** — RPC URL `http://127.0.0.1:8545`,
   Chain ID `31337`, currency `ETH`. (`frontend/src/wagmi.config.ts` is
   pinned to chain ID `31337` — the wrong chain ID silently fails every
   contract call.)
2. Import at least two of the private keys `npx hardhat node` prints to the
   terminal on startup (Hardhat's well-known local dev accounts — never
   reuse these outside a local chain):
   - **Account #1** — the "seller" for this demo (mint it tickets from the
     organizer panel, or transfer it some).
   - **Account #2** (or any other) — the "buyer" for the Sunny Day purchase.
     It must be a *different* account than the ticket's current owner:
     `resaleTransfer` reverts with `"Cannot buy your own ticket"` otherwise.

## 1. ☀️ Sunny Day — Face-Value Transfer

**Story:** a buyer connects their wallet and successfully purchases a ticket
at the seller's asking price, which the contract enforces as *exactly* the
original face value.

### Steps

1. Open `http://localhost:5173` and connect the **organizer** account
   (Account #0) — the **Organizer** page appears in the nav. A freshly started
   stack has no tickets: nothing is seeded, so everything on screen from here on
   was minted live in front of the audience.
2. On **Organizer**, enter an event name and date, set the quantity to 3, and
   click **Mint & List**. One transaction creates the event, mints the batch to
   the organizer, and lists every ticket at the `0.05 ETH` face value.
3. Go to **Buy Tickets**. The three cards are already there — the grid
   enumerates tokens from `totalMinted()` on the contract, so it does not wait
   on the P2P node. Within a couple of seconds `[bridge]` lines appear in
   `network.log` and the same tickets show up in `GET /tickets`.
4. Switch MetaMask to the **buyer** account (Account #1 or #2). The organizer's
   tickets now show a **Buy Ticket** button — the contract refuses to let you
   buy your own ticket, so the button only becomes active on another account.
5. Click **Buy Ticket**. MetaMask opens a confirmation for
   `resaleTransfer(tokenId)` with `value` equal to the listed price (the button
   stays disabled until that price has loaded, so it can never send a stale
   amount). Confirm it.
6. The button cycles **Confirm in wallet… → Processing… → Purchased** as
   `useWaitForTransactionReceipt` picks up the mined transaction; a snackbar
   shows the tx hash. The card moves to **My Tickets**, and the bridge
   republishes the transfer to the P2P chain.

### What to point out live

- The price is never a "current market price": a listed card shows the seller's
  asking price, and an unlisted one shows `getTicketDetails`, the immutable
  `FACE_VALUE` fixed at minting. Neither can exceed face value, however many
  times the ticket changes hands.
- Nothing on screen was seeded. Every ticket in the demo was minted live, and
  the P2P feed filled itself from contract events through the bridge.
- On a local Hardhat node every transaction auto-mines into its own block,
  so step 4→5 above is near-instant. Measured directly (script-driven, same
  call the UI makes): **submit → receipt in 24 ms, 78,534 gas** — see
  [metrics](#reference-metrics) below.

### Verifying the result

```bash
cd contracts
npx hardhat console --network localhost
> const c = await ethers.getContractAt("TicketNFT", require("../frontend/src/contracts/TicketNFT.json").address)
> await c.ownerOf(0)   // now the buyer's address, not the original holder
> await c.getTicketDetails(0)   // still exactly 50000000000000000 (0.05 ETH)
```

## 2. 🌧️ Rainy Day — Blocked Scalping Attempt

**Story:** a scalper tries to resell a ticket above face value. There are two
ways to attempt it, and the contract refuses both — at *different* points in
the ticket's lifecycle.

The UI can't be used for either. The listing form caps the asking price at face
value and disables submission above it; the buy button always sends exactly the
listed price. A real scalper has to go around the frontend and call the contract
directly, so that's what this demo does, via
[`contracts/scripts/demo-rainy-day.js`](../contracts/scripts/demo-rainy-day.js).

1. **Advertising above face value** — `listForSale` rejects it, so an
   over-priced offer can never even appear on the marketplace.
2. **Overpaying a legitimate listing** — `resaleTransfer` requires `msg.value`
   to equal the listed price exactly, so a buyer can't quietly pay a seller more
   than the published price (and can't underpay either).

### Steps

```bash
cd contracts
TICKET_ID=0 npx hardhat run scripts/demo-rainy-day.js --network localhost
```

### Actual output (captured while verifying this doc)

```
Contract:        0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0
Ticket #0 owned by: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Face value:      0.05 ETH
Listed at:       0.05 ETH
Markup attempt:  0.15 ETH (3x face value)

[1] Holder submits listForSale() above face value...
    REVERTED as expected: Scalping detected: Price exceeds face value

[2] Buyer submits resaleTransfer() with a marked-up msg.value...
    buyer: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
    REVERTED as expected: Payment must equal the listed price

Ticket #0 owner unchanged:   YES
Ticket #0 listing unchanged: YES (0.05 ETH)
```

### What to point out live

- The scalper attempted **3× face value** (a deliberately obvious markup for
  the audience) and *both* transactions reverted entirely — no partial state
  change, no ETH moved, ownership and listing untouched.
- The two guards sit at deliberately different points, in
  [`TicketNFT.sol`](../contracts/contracts/TicketNFT.sol):
  `listForSale` has `require(price <= tickets[tokenId].faceValue, "Scalping
  detected: Price exceeds face value")`, so the ceiling applies when the offer
  is *made*; `resaleTransfer` then has `require(msg.value == listing.price,
  "Payment must equal the listed price")`, pinning the sale to that published
  price in both directions.
- Worth saying out loud: an earlier version only checked the payment, with
  `msg.value <= faceValue`. That refused overpayment but allowed a buyer to
  take any ticket for **zero** — the story is in
  [`development-process.md`](development-process.md).
- Raw ERC-721 transfers (`transferFrom`/`safeTransferFrom`) are blocked
  entirely, even for the ticket's own owner or an approved operator — see
  the "Unauthorized transfers" test group in
  [`TicketNFT.test.js`](../contracts/test/TicketNFT.test.js). The *only*
  path to move a ticket is `resaleTransfer`, so the price ceiling can't be
  routed around by transferring first and settling payment off-chain.
- For a lower-key version of the same story on stage (no script, just
  MetaMask), you can also open `npx hardhat console --network localhost`
  and call `resaleTransfer` with a hand-typed overpriced `value` live — the
  script above is just the scripted/repeatable form of the same call.

## 2b. 🌧️ Rainy Day — The Bulk Buyer and the Stale Ticket

**Story:** two failures that have nothing to do with price. A bot tries to
corner the primary sale, and someone tries to trade a ticket for a show that
has already begun. Both are refused on-chain.

### Steps

```bash
cd contracts
npx hardhat run scripts/demo-limits.js --network localhost
```

### Actual output (captured while verifying this doc)

```
Contract: 0x5FbDB2315678afecb367f032d93F642f64180aa3

[1] Organizer mints 3 tickets with a limit of 1 per wallet...
    buyer takes #13: ok
    same wallet tries #14: REVERTED — Primary purchase limit reached for this event
    a different wallet takes #14: ok — the cap is per address

[2] Organizer mints a ticket for an event that then starts...
    (chain time advanced past the event start)
    buying #16:  REVERTED — Event has already started
    listing #16: REVERTED — Event has already started
```

### What to point out live

- **The cap is per address, and only on the primary sale.** The third line is
  the important one: a different wallet still gets its allowance, and the capped
  wallet can still buy the same ticket later *on resale* from another attendee.
  Capping the secondary market would punish the people the price ceiling exists
  to protect — bulk buying at the source is where scalping actually starts.
- **`maxPerBuyer` is per event**, set at mint time, and `0` means no limit — so
  an organizer who does not care about bots does not have to think about it.
- **Expiry uses `block.timestamp`, not the browser clock.** Step 2 advances
  chain time with `evm_increaseTime`, which is how the test suite reaches the
  same branch. The UI greys expired tickets out from its own ticking clock, but
  the contract is what actually refuses.
- Worth saying out loud: this is the same `require`-and-revert pattern as the
  scalping demo. Three different rules, one enforcement mechanism, and none of
  them can be bypassed by using a different client.

## 3. 🔗 Two-Node Propagation — Chain Sync

**Story:** a node that joins late, or drops offline and comes back, doesn't
get permanently stuck with a stale chain. Before this was fixed, a node
that missed even one block broadcast — a UDP packet dropped, or a node
started after its peer had already mined — had no way to ever catch up:
`main.py` simply logged an index mismatch and threw the block away. Now a
node ahead-of-us or a freshly discovered peer triggers a chain-sync request
(`ChainRequestPayload`/`ChainResponsePayload`), and the receiver adopts the
reply only if it's both longer and passes full validation — never a
shorter chain (no rollback attacks) and never one that just happens to be
internally valid but starts from a different genesis (no hijack by an
unrelated network).

### Steps

```bash
./start_demo.sh
```

This runs the same stack as `start_dev.sh` (Hardhat, contracts, frontend),
plus a second bare P2P node — **node B**, UDP port `8091`, HTTP API on
`:8081` — alongside the primary one (**node A**, port `8090`, API `:8080`,
the one bridging real contract events). Node B does not run its own bridge
against the contract (`TICKETCHAIN_RPC_URL` points it at a port nothing
listens on, so its bridge harmlessly retries forever) — everything it
knows comes from P2P chain sync with node A, exactly like a real second
peer joining the network would.

### What to point out live

- **Late joiner:** mint a ticket or two from the organizer panel before
  node B has even discovered node A. Once B's log shows `discovered peer`,
  watch the very next lines: B sends a chain request on discovery, A
  replies with its (longer) chain, and B logs `→ adopted (len N, tip
  …)`. Then `curl http://127.0.0.1:8080/tickets` and
  `curl http://127.0.0.1:8081/tickets` side by side — identical output.
  This is the reliable half of this demo: verified both by
  `network/test_two_nodes.py` (5/5 clean runs) and by hand against the real
  bridged stack — a freshly started B converges within a second or two
  every time we tried it.
- **Drop and rejoin — automated, not live:** `network/test_two_nodes.py`'s
  second phase stops node B, mines again on A, and starts a fresh B, all
  within one process, and converges reliably (5/5 runs). Reproducing that
  by hand against two separate OS processes — actually killing a `main.py`
  terminal and restarting it — did **not** reliably reconverge in our own
  testing, even waiting several minutes. With `logging.DEBUG` enabled on
  both sides we traced it further than "peer rediscovery is flaky": after
  such a restart, node A receives *nothing at all* from node B — not the
  discovery-triggered request, not the periodic one below, not even B's
  replies to A's own requests — while the reverse direction (A → B) keeps
  working the whole time. That's a one-way send/delivery failure specific
  to reconnecting to an identity IPv8 has already seen once, underneath
  where `main.py` has any visibility (no exception, no dropped-packet
  warning — the packets just don't arrive). We added a 15-second periodic
  re-sync (`_periodic_chain_sync`) as a backstop alongside the
  discovery/block-ahead triggers, which *does* help the case the issue is
  literally about — a single dropped packet — but does not by itself fix
  this specific same-identity-reconnection case, since it retries through
  the same path. Don't stage this half as a live click-through — present
  the automated test's output as the evidence instead.
- **Rejecting a bad chain:** this one is a unit-test claim, not a live
  step — `network/test_blockchain.py::TestChainSync` constructs a longer
  chain with a broken link and a longer chain forked from a different
  genesis, and asserts `Blockchain.should_replace_with()` rejects both.
  Worth citing rather than staging: there's no safe way to *hand* a running
  node a bad chain without writing a malicious peer first.

### Reproducing without the frontend

```bash
cd network
python test_two_nodes.py
```

```
SUCCESS: phase 1 (late joiner) — nodes discovered each other after ~0.5s
SUCCESS: phase 1 (late joiner) — B converged onto A's chain after ~0.0s (length 3, tip 0000b8b478e2da1b…)
SUCCESS: phase 2 (rejoin after drop) — nodes discovered each other after ~1.0s
SUCCESS: phase 2 (rejoin after drop) — B converged onto A's chain after ~0.0s (length 4, tip 0000a9bc90e1728a…)
```

Run five times in a row while writing this doc with the same result every
time — this is what "passes reliably, not occasionally" is checked against,
not a single lucky run.

## Reference: automated coverage backing these demos

Both scenarios are also covered by the automated suite in
[`contracts/test/TicketNFT.test.js`](../contracts/test/TicketNFT.test.js)
(53 tests: minting and organizer-only access control, the event registry,
listing and cancellation including refusal above face value, purchase covering
exact/over/under payment and unlisted or cancelled tickets, the failed-payment
branch via a mock that rejects ETH, and the raw ERC-721 lockdown). Run
`npx hardhat test` in `contracts/` — or `npx hardhat coverage` for the
line/branch numbers — to reproduce:

```
53 passing (439ms)

-------------------|----------|----------|----------|----------|
File               |  % Stmts | % Branch |  % Funcs |  % Lines |
-------------------|----------|----------|----------|----------|
  TicketNFT.sol    |      100 |    97.37 |      100 |      100 |
  RejectsEther.sol |      100 |      100 |      100 |      100 |
-------------------|----------|----------|----------|----------|
```

## Reference: metrics

See [Week2-Progress-Report](Week2-Progress-Report.md#4-metrics) for the full
methodology and multi-trial numbers. Headline figures, all measured (not
estimated) against this repo:

| Metric | Value |
| --- | --- |
| On-chain purchase (`resaleTransfer`), submit → receipt | 24 ms, 78,534 gas |
| Off-chain tx sign + validate (blockchain core) | ~0.8 ms |
| PoW block finality (difficulty 16 bits) | ~0.25–0.6 s avg (10-trial run) |
| P2P peer discovery latency (2 local nodes) | ~0.3–0.6 s |
| P2P block propagation, mine → peer accepts | ~0.15–1.4 s |

## Troubleshooting

- **`Failed to fetch P2P tickets`** in the UI — the Python node isn't up
  yet, or crashed. Check `network.log` (from `start_dev.sh`) or the
  terminal it's running in.
- **MetaMask transaction fails immediately with no revert reason shown** —
  almost always a chain ID mismatch; confirm MetaMask is on chain `31337`,
  not `1337`.
- **A second `main.py` process crashes the moment it starts, or takes the
  first one down with it** — both default to HTTP API port `8080`.
  `start_demo.sh` already passes `--api-port 8081` to node B; if you're
  starting a second node by hand (or `8080` is taken by something else
  entirely on your machine), pass a free `--api-port` explicitly. This
  isn't a soft failure: uvicorn calls `sys.exit()` on a bind failure, and
  that kills the whole Python process, not just the HTTP server.
- **pyipv8 won't import on Windows (`Could not locate nacl lib`)** — pyipv8
  depends on libnacl, which needs a native `libsodium` shared library that
  Windows has no standard location for. Download a prebuilt
  `libsodium-<version>-stable-msvc.zip` from
  `https://download.libsodium.org/libsodium/releases/`, and copy
  `libsodium/x64/Release/v143/dynamic/libsodium.dll` into your venv's
  `Scripts/` directory next to `python.exe`.
