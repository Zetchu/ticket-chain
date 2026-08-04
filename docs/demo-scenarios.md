# Live Demo Scenarios — Step-by-Step Runbook

This document is the rehearsal/run script for the two Week 2 live demos
referenced in the [README](../README.md#5-live-demo-scenarios):

- **☀️ Sunny Day** — a regular, face-value ticket transfer via the UI.
- **🌧️ Rainy Day** — a scalper attempts to buy above face value directly
  against the contract, and the anti-scalping check reverts the transaction.

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

1. Open `http://localhost:5173`. The **Available Events** grid loads from
   the P2P node's `GET /tickets` (port 8080) — you should see 3 cards
   (tokens `0`–`2`), each showing `0.05 ETH`, read live on-chain via
   `getTicketDetails`.
2. Click **Connect** in the navbar and select the **buyer** account
   (Account #2) in MetaMask.
3. On any ticket card, click **Purchase Ticket**.
4. MetaMask opens a confirmation prompt for `resaleTransfer(tokenId)` with
   `value = 0.05 ETH` (the button is disabled until the on-chain price has
   loaded, so it can never send a stale amount). Confirm it.
5. The card's button cycles **Confirm in Wallet… → Waiting for Block… →
   Purchased!** as `useWaitForTransactionReceipt` picks up the mined
   transaction; a snackbar shows the tx hash.

### What to point out live

- The price shown never changes across owners — it's read from
  `getTicketDetails`, which always returns the immutable `FACE_VALUE` set at
  minting, not a "current market price."
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

**Story:** a scalper tries to resell a ticket above face value. The UI
itself can't be used to attempt this — `handlePurchase` in
`TicketCard.tsx` always sends exactly the on-chain `getTicketDetails`
price, by construction. A real scalper has to go around the UI and call
the contract directly, so that's what this demo does, via
[`contracts/scripts/demo-rainy-day.js`](../contracts/scripts/demo-rainy-day.js).

### Steps

```bash
cd contracts
TICKET_ID=0 npx hardhat run scripts/demo-rainy-day.js --network localhost
```

### Actual output (captured while verifying this doc)

```
Contract:        0x5FbDB2315678afecb367f032d93F642f64180aa3
Ticket #0 owned by: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Face value:      0.05 ETH
Scalper offers:  0.15 ETH (from 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC)

Submitting resaleTransfer() at the marked-up price...
REVERTED as expected:
  reason: Error: VM Exception while processing transaction: reverted with
  reason string 'Scalping detected: Price exceeds face value'

Ticket #0 owner unchanged: YES
```

### What to point out live

- The scalper offered **3× face value** (a deliberately obvious markup for
  the audience) and the *entire* transaction reverted — no partial state
  change, no ETH moved, ownership unchanged. This is enforced in
  [`TicketNFT.sol`](../contracts/contracts/TicketNFT.sol)'s `resaleTransfer`:
  `require(msg.value <= ticket.faceValue, "Scalping detected: Price exceeds
  face value")`.
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

## Reference: automated coverage backing these demos

Both scenarios are also covered by the automated suite in
[`contracts/test/TicketNFT.test.js`](../contracts/test/TicketNFT.test.js)
(25 tests: minting, `getTicketDetails`, `setResellable` access control,
face-value resale, unauthorized/approved-bypass attempts, and the raw
ERC-721 lockdown). Run `npm test` in `contracts/` — or `npx hardhat
coverage` for the line/branch numbers — to reproduce:

```
25 passing (722ms)

--------------- | -------- | -------- | -------- | -------- |
File            | % Stmts  | % Branch | % Funcs  | % Lines  |
--------------- | -------- | -------- | -------- | -------- |
 TicketNFT.sol  |     100  |     100  |     100  |     100  |
--------------- | -------- | -------- | -------- | -------- |
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
- **pyipv8 won't import on Windows (`Could not locate nacl lib`)** — pyipv8
  depends on libnacl, which needs a native `libsodium` shared library that
  Windows has no standard location for. Download a prebuilt
  `libsodium-<version>-stable-msvc.zip` from
  `https://download.libsodium.org/libsodium/releases/`, and copy
  `libsodium/x64/Release/v143/dynamic/libsodium.dll` into your venv's
  `Scripts/` directory next to `python.exe`.
