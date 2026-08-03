# CS414 Fundamentals of Blockchain: Localized P2P Event Ticketing Network

**Course:** CS414 Fundamentals of Blockchain

### Team Members

- **David**
- **Haythem**
- **Khalil**
- **Mahmoud**

**ticket-chain-ten.vercel.app** — a landing page for the project. TicketChain is a *localized* network: the blockchain node and the P2P overlay both run on your own machine, so the live demo has to be run locally ([getting-started.md](getting-started.md)).

## 1\. Project Overview

This project presents a decentralized, localized peer-to-peer event ticketing network designed to eliminate ticket scalping and ensure secure peer transfers. By leveraging decentralized programming models and smart contracts, we manage digital event tickets as unique on-chain assets (NFTs) governed by strict pricing rules.

Why is this project great? It bridges a standard React user interface with a robust backend to solve a real-world problem: preventing malicious secondary markets for high-demand events, ensuring fairness and transparency for attendees.

**Running it yourself:** [getting-started.md](getting-started.md) walks through setup, MetaMask configuration, and buying and reselling a ticket end to end.

## 2\. System Presentation

Our architecture is split into three distinct layers to ensure full decentralization and a seamless user flow:

- **Frontend (User Interface):** A standard React web application (avoiding Next.js to keep client-side rendering isolated) that connects to browser-based Web3 wallets. The UI demonstrates the user flow from wallet connection to ticket browsing and purchasing.
- **P2P Network Layer:** Built using PyIPv8 to handle communication between decentralized nodes.
- **Consensus & Asset Management Layer:** Smart contracts deployed locally that define the rules for ticket minting, escrow, and the anti-scalping price ceiling (DeFi/NFT asset management).

The full architecture diagram mapping the flow between the React frontend, the Hardhat node, and the PyIPv8 network is available in [docs/architecture.md](docs/architecture.md).

## 3\. Algorithms & Data Structures

The `network/blockchain/` package provides a hand-built blockchain core (no Ethereum dependency) with four interconnected components:

- **Transactions (`transaction.py`):** Each ticket transfer is a `Transaction` object carrying sender/recipient public keys, ticket ID, sale price, and face value. Transactions are signed with ECDSA over SECP256K1 (the same curve used by Ethereum/Bitcoin) using the `cryptography` library. Validation enforces both signature correctness and the anti-scalping rule (`price ≤ face_value`) before a transaction enters the mempool.

- **Merkle Tree (`merkle.py`):** Pending transactions are grouped into a block using a binary Merkle tree. Each leaf is a SHA-256 transaction hash; internal nodes are SHA-256 hashes of concatenated child hashes (with duplicate-last-node handling for odd counts). The Merkle root stored in the block header allows anyone to verify that a specific transaction is included in a block using a logarithmic-size inclusion proof (`get_proof` / `verify_proof`), without downloading all transactions.

- **Blocks & Chain (`block.py`, `chain.py`):** A `Block` contains a header (`index`, `prev_hash`, `merkle_root`, `timestamp`, `difficulty`, `nonce`) and a list of transactions. The block hash is SHA-256 of the serialized header. Blocks are linked by storing the previous block's hash, forming a tamper-evident chain. The `Blockchain` class manages a pending-transaction mempool and enforces full chain validation (PoW, prev-hash linkage, Merkle root consistency, all signatures) on every block.

- **Proof-of-Work (`pow.py`):** Mining uses a leading-zero-bits difficulty target. The miner increments the block header nonce until the SHA-256 block hash has at least `difficulty` leading zero bits (default: 16 bits, verifiable as the first four hex characters being `0000`). This constitutes the cryptographic search puzzle providing Sybil resistance — nodes must expend computational effort to propose blocks.

- **P2P Broadcast (`main.py`):** The `TicketChainCommunity` IPv8 overlay broadcasts signed transactions (`TransactionPayload`) and mined blocks (`BlockPayload`) to all discovered peers using UDP. Receiving peers validate before accepting, ensuring no invalid transactions or blocks propagate through the network.

- **Localized Peer Discovery:** IPv8's UDP broadcast bootstrapper limits peer discovery to the local network segment, keeping the overlay localized to high-density event areas without relying on public trackers.

## 4\. Process & Quality Assurance (QA)

Our QA process rigorously tests the reliability and security assumptions of the network.

- **What we measured:** Block finality times, transaction success rates during high local node concurrency, and UI latency when fetching on-chain ticket data.
- **How we know it works:** We implemented a suite of automated smart contract tests verifying that transfers fail if the proposed price exceeds the original face value.
- **Assumptions:** We assume a minimum threshold of honest nodes operating within the localized PyIPv8 broadcasting radius to maintain a synchronized ledger.

## 5\. Live Demo Scenarios

During our presentation, we will execute multiple live runs under different conditions:

- **☀️ Sunny Day Scenario:** The regular, fault-free flow. A user connects their wallet via the React interface and successfully transfers a digital ticket to another user at face value, with the PyIPv8 network instantly propagating the state change.
- **🌧️ Rainy Day Scenario:** Testing our system's resilience when assumptions are broken. A malicious user attempts to execute a smart contract transfer above the hard-coded price ceiling, resulting in a rejected transaction and a reverted state.
