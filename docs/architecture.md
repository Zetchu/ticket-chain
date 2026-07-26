# TicketChain — System Architecture (Week 1)

The system is split into three layers: the React frontend, the local Hardhat
blockchain node holding the `TicketNFT` smart contract, and the PyIPv8
peer-to-peer overlay that propagates ticket availability between localized
nodes.

```mermaid
flowchart TB
    subgraph Client["Frontend Layer"]
        UI["React Web App<br/>(Vite, client-side rendering)"]
        Wallet["Browser Web3 Wallet<br/>(MetaMask)"]
        UI -- "connect / sign" --> Wallet
    end

    subgraph Chain["Consensus & Asset Management Layer"]
        Node["Hardhat Local Node<br/>(JSON-RPC :8545)"]
        SC["TicketNFT.sol<br/>ERC-721 tickets + face-value ceiling"]
        Node -- "executes" --> SC
    end

    subgraph P2P["P2P Network Layer (PyIPv8)"]
        A["Node A<br/>TicketChainCommunity :8090"]
        B["Node B<br/>TicketChainCommunity :8091"]
        A <-- "UDP broadcast discovery<br/>+ ticket availability sync" --> B
    end

    Wallet -- "signed transactions (JSON-RPC)" --> Node
    UI -- "read ticket state (ethers.js)" --> Node
    SC -- "mint / transfer events" --> P2P
    P2P -- "propagate availability to local peers" --> UI
```

## Flow summary

1. A user opens the React app and connects their browser wallet.
2. Minting and transfers are signed in the wallet and sent to the local
   Hardhat node over JSON-RPC, where `TicketNFT.sol` enforces the
   face-value price ceiling (anti-scalping).
3. Contract events are picked up by the PyIPv8 layer, whose
   `TicketChainCommunity` overlay broadcasts ticket availability to peers
   discovered on the local network (UDP broadcast bootstrapping — no public
   trackers).
4. Peer nodes surface the synchronized availability back to their local UIs.
