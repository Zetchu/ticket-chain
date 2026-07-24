# CS414 Fundamentals of Blockchain: Localized P2P Event Ticketing Network

**Course:** CS414 Fundamentals of Blockchain

### Team Members

- **David**
- **Haythem**
- **Khalil**
- **Mahmoud**

**ticket-chain-ten.vercel.app**

## 1\. Project Overview

This project presents a decentralized, localized peer-to-peer event ticketing network designed to eliminate ticket scalping and ensure secure peer transfers. By leveraging decentralized programming models and smart contracts, we manage digital event tickets as unique on-chain assets (NFTs) governed by strict pricing rules.

Why is this project great? It bridges a standard React user interface with a robust backend to solve a real-world problem: preventing malicious secondary markets for high-demand events, ensuring fairness and transparency for attendees.

## 2\. System Presentation

Our architecture is split into three distinct layers to ensure full decentralization and a seamless user flow:

- **Frontend (User Interface):** A standard React web application (avoiding Next.js to keep client-side rendering isolated) that connects to browser-based Web3 wallets. The UI demonstrates the user flow from wallet connection to ticket browsing and purchasing.
- **P2P Network Layer:** Built using PyIPv8 to handle communication between decentralized nodes.
- **Consensus & Asset Management Layer:** Smart contracts deployed locally that define the rules for ticket minting, escrow, and the anti-scalping price ceiling (DeFi/NFT asset management).

(Note: An architecture diagram mapping the flow from the React frontend to the web server and database/blockchain will be included here prior to submission.)

## 3\. Algorithms & Data Structures

To ensure network security and efficient data propagation, our protocol implements two core mechanisms:

- **Search Puzzle Sequence:** We utilize a cryptographic search puzzle algorithm to provide sybil resistance. This requires nodes to expend computational effort to participate in network broadcasting, preventing spam attacks.
- **Localized Peer Community Broadcasting:** An optimized data structure and routing algorithm within PyIPv8 that allows nodes to quickly discover and synchronize ticket availability with other peers specifically within high-density event areas.

## 4\. Process & Quality Assurance (QA)

Our QA process rigorously tests the reliability and security assumptions of the network.

- **What we measured:** Block finality times, transaction success rates during high local node concurrency, and UI latency when fetching on-chain ticket data.
- **How we know it works:** We implemented a suite of automated smart contract tests verifying that transfers fail if the proposed price exceeds the original face value.
- **Assumptions:** We assume a minimum threshold of honest nodes operating within the localized PyIPv8 broadcasting radius to maintain a synchronized ledger.

## 5\. Live Demo Scenarios

During our presentation, we will execute multiple live runs under different conditions:

- **☀️ Sunny Day Scenario:** The regular, fault-free flow. A user connects their wallet via the React interface and successfully transfers a digital ticket to another user at face value, with the PyIPv8 network instantly propagating the state change.
- **🌧️ Rainy Day Scenario:** Testing our system's resilience when assumptions are broken. A malicious user attempts to execute a smart contract transfer above the hard-coded price ceiling, resulting in a rejected transaction and a reverted state.
