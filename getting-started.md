# Getting Started with TicketChain

A step-by-step guide to running the whole system on your own machine: a local
Ethereum chain, a peer-to-peer node, and the React app — plus the MetaMask setup
you need to actually buy and resell a ticket.

Budget about 10 minutes for the first run.

---

## 1. What you're about to run

TicketChain has three parts, and `start_dev.sh` starts all of them together:

| Part | What it is | Where it listens |
| --- | --- | --- |
| Hardhat node | A local Ethereum blockchain holding the `TicketNFT` contract | `127.0.0.1:8545` |
| PyIPv8 node | The P2P network layer + a small HTTP API listing tickets | `127.0.0.1:8080` (UDP `8090` for peers) |
| React app | The user interface | `localhost:5173` |

Nothing here touches a public network. The chain is local, the peers are local,
and the ETH is fake.

---

## 2. Prerequisites

You need four things installed.

### Node.js 20 or 22

```bash
node --version
```

Hardhat prints a warning on very new Node versions (25+). It still works, but if
you hit odd errors, install an LTS release via [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 22 && nvm use 22
```

### Python 3.10+

```bash
python3 --version
```

PyIPv8 3.x requires 3.10 or newer. macOS ships 3.9 as the system `python3`, so
if that's what you see, install a newer one (`brew install python@3.12`) — the
start script will find and use it automatically.

You do **not** need to create a virtualenv yourself — the start script does it,
and rebuilds it if the dependencies or the Python version change.

### libsodium

The P2P library (PyIPv8) needs this native library and cannot start without it.

```bash
# macOS
brew install libsodium

# Debian / Ubuntu
sudo apt install libsodium23
```

### MetaMask

Install the [MetaMask browser extension](https://metamask.io/download/) and
create a wallet if you don't have one. The seed phrase doesn't matter here —
you'll import throwaway test accounts in step 5.

> **Windows:** run everything inside WSL2. The start script is a bash script and
> expects a Unix shell.

---

## 3. Clone and start

```bash
git clone https://github.com/Zetchu/ticket-chain.git
cd ticket-chain
./start_dev.sh
```

The first run takes a minute or so because it creates a Python virtualenv and
installs dependencies. You're looking for this:

```
🚀 Starting TicketChain Development Environment...
🐍 Creating Python venv and installing network dependencies...
📦 Starting local blockchain (logs routing to hardhat.log)...
⏳ Waiting for JSON-RPC on 127.0.0.1:8545...
⚙️ Deploying fresh smart contracts...
TicketNFT deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3 (network: localhost)
ABI + address exported to .../frontend/src/contracts/TicketNFT.json
🌐 Starting P2P Network (logs routing to network.log)...
💻 Starting React UI...

✅ All systems running! Press CTRL+C to stop.
👉 Frontend available at: http://localhost:5173
```

**Ctrl+C stops everything.** Backend output goes to `hardhat.log` and
`network.log` in the project root — check those first if something looks wrong.
If a service is ever left behind (a terminal closed without Ctrl+C, say), run
`./stop_dev.sh` — and starting the stack again always clears the old one first,
so `./start_dev.sh` is safe to re-run at any time.

Open <http://localhost:5173>. The ticket board starts empty — connect as account #0
(the organizer) and use the **Organizer** page to mint your first tickets.

---

## 4. Add the local network to MetaMask

MetaMask talks to Ethereum mainnet by default. Point it at your local chain:

1. Open MetaMask → click the network dropdown (top left) → **Add network**
2. Choose **Add a network manually**
3. Fill in:

   | Field | Value |
   | --- | --- |
   | Network name | `Hardhat Local` |
   | New RPC URL | `http://127.0.0.1:8545` |
   | Chain ID | `31337` |
   | Currency symbol | `ETH` |

4. Save, then switch to it.

If you forget this step, the app shows a warning banner with a **Switch network**
button that does it for you.

---

## 5. Import two test accounts

Hardhat creates 20 accounts with 10,000 fake ETH each. You need **two** of them,
because the contract refuses to let you buy your own ticket.

In MetaMask: account menu → **Add account or hardware wallet** → **Import
account** → paste the private key.

**Account #0 — the organizer** (deployed the contract, can mint tickets):

```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

**Account #1 — a buyer** (used to purchase from the organizer):

```
0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

> ⚠️ These keys are published in Hardhat's documentation and are known to
> everyone on earth. They are safe for local testing and catastrophic anywhere
> else. Never send real funds to them.

Back in the app, click **Connect Wallet** and approve the connection.

---

## 6. Mint tickets and buy one

1. Connect as **Account #0**. The **Organizer** page appears in the nav.
2. Go to **Organizer**, fill in an event name and date, set a quantity (e.g. 3)
   and a face value (keep the pre-filled 0.05 ETH for this walkthrough — it's
   permanent per batch: it caps every future resale of these tickets, and each
   new event can be priced differently), and optionally pick a poster image.
   Click **Mint & List** and confirm in
   MetaMask. The tickets appear on the **Buy Tickets** page instantly, showing
   your image — or artwork generated from the token ID if you skipped it.
3. Switch MetaMask to **Account #1**.
4. On **Buy Tickets**, pick a card — listed by account #0 at the 0.05 ETH face
   value you entered.
5. Click **Buy Ticket** and confirm. The button walks through *Confirm in wallet* →
   *Processing* → *Purchased*, and the card's owner address changes to yours.

Open **My Tickets** in the nav and it's there.

---

## 7. Resell it

This is the part the whole project exists for.

1. Still on account #0, find your ticket (either page — tickets you own show
   your controls in both).
2. Click **List for resale**. The price box opens, pre-filled with the 0.05 ETH
   face value.
3. Type `0.03` and click **List ticket**. Confirm in MetaMask.
4. The card now shows *asking price* 0.03 ETH, with **Change price** and
   **Unlist** buttons.
5. Switch MetaMask to **Account #1**. That ticket now shows **Buy Ticket** at
   0.03 ETH — buy it back.

Try the anti-scalping rule while you're here: open the price box and enter
`0.06`. The field turns red — "Above the 0.05 ETH face value — that's scalping" —
and the button won't submit. The contract enforces the same rule independently,
so it can't be bypassed by editing the page.

---

## 8. Running the pieces separately

`start_dev.sh` is the easy path, but each part runs on its own:

```bash
# Local blockchain only
cd contracts && npx hardhat node

# Deploy contracts against a running node (exports ABI to frontend)
cd contracts && npx hardhat run scripts/deploy.js --network localhost

# P2P node + ticket API
cd network && .venv/bin/python main.py

# Frontend dev server
cd frontend && npm install && npm run dev
```

Tests:

```bash
cd contracts && npx hardhat test                            # smart contract
cd network && .venv/bin/python -m pytest test_blockchain.py  # blockchain core
```

---

## Troubleshooting

**"Can't reach the local network" on the tickets page**
The P2P node isn't running. Check `network.log`. The usual cause is a missing
libsodium — see step 2.

**`Could not locate nacl lib, searched for libsodium`**
Install libsodium (step 2), then delete `network/.venv` and re-run
`./start_dev.sh` so the script re-links it.

**A transaction hangs, or MetaMask reports a nonce error**
You restarted the chain while MetaMask still remembered the old one. Fix:
MetaMask → Settings → Advanced → **Clear activity tab data**.

**The app says you're on the wrong network**
Click **Switch network** in the banner, or select *Hardhat Local* manually.

**`Port 8545 is already in use`**
A previous run is still alive — usually a terminal that was closed without
Ctrl+C. `./start_dev.sh` clears this automatically before it starts, so just run
it again. To stop everything without starting it back up:
```bash
./stop_dev.sh
```

**Tickets vanished after a restart**
Expected. Every run of `start_dev.sh` deploys a fresh chain. Go to the
**Organizer** page and mint new tickets to repopulate the board.

**`./start_dev.sh: Permission denied`**
```bash
chmod +x start_dev.sh
```

---

## Where to look next

- [`docs/architecture.md`](docs/architecture.md) — how the three layers fit together
- [`docs/demo-scenarios.md`](docs/demo-scenarios.md) — the sunny-day and rainy-day
  demo runbook
- [`contracts/contracts/TicketNFT.sol`](contracts/contracts/TicketNFT.sol) — the
  anti-scalping rules, in about 100 lines
- [`network/blockchain/`](network/blockchain/) — the hand-built chain: Merkle
  trees, proof-of-work, transaction signing
- [`frontend/src/hooks/useTicketBoard.ts`](frontend/src/hooks/useTicketBoard.ts) —
  where the P2P feed and on-chain state get joined together
