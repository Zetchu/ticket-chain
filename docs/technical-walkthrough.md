# TicketChain — Technical Walkthrough

Everything the system does, why it does it that way, and the answers to the
questions worth preparing for. Written for defending the project, not for
introducing it — see the [README](../README.md) for that.

---

## 0. The one-paragraph version

Tickets are ERC-721 tokens on a local Ethereum chain. The contract enforces a
resale price ceiling that nobody, including the organizer, can raise. A bridge
watches the contract's events and republishes each one as a signed transaction
on a **second** blockchain we built ourselves in Python — real transactions,
Merkle trees, proof-of-work, gossip over UDP, and a longest-valid-chain rule —
which every node on the local network replicates. The React app reads ownership
from the contract and talks to a wallet for signing.

**Two ledgers, two jobs.** Ethereum owns *value and ownership*. Our chain owns
*replicated, verifiable announcement* across peers at the venue. The bridge is
the seam, and it is deliberate rather than accidental.

---

## 1. The smart contract — `contracts/contracts/TicketNFT.sol`

An ERC-721 (OpenZeppelin) with `Ownable`, ~480 lines, 100% statement coverage.

### 1.1 State

```solidity
struct Ticket    { uint256 faceValue; bool isResellable; uint256 eventId; }
struct EventDetails { string name; uint256 date; string imageRef; uint256 maxPerBuyer; }
struct Listing   { uint256 price; bool active; }
```

- `tickets[tokenId]` — per-ticket record. **`faceValue` lives here, not as a
  global**, which is what made per-event pricing a small change: the ceiling
  logic always read the per-ticket value.
- `eventDetails[eventId]` — one record per batch. A 500-seat show stores its
  name once, not 500 times.
- `listings[tokenId]` — an owner's standing offer. **No listing, no sale.**

### 1.2 The four rules, and where each is enforced

| Rule | Where | Message |
| --- | --- | --- |
| Never advertise above face value | `listForSale` | `Scalping detected: Price exceeds face value` |
| Pay exactly the advertised price | `resaleTransfer` | `Payment must equal the listed price` |
| One wallet, N tickets from the organizer | `resaleTransfer` | `Primary purchase limit reached for this event` |
| Nothing trades after the event starts | both | `Event has already started` |

The split between the first two matters and is worth explaining out loud: the
**ceiling applies when the offer is made**, so an over-priced ticket cannot even
appear on the market; the **payment check then pins the sale to that published
price in both directions**, so a buyer can neither overpay a seller quietly nor
underpay them.

### 1.3 The transfer lockdown — the load-bearing piece

```solidity
function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
    address from = _ownerOf(tokenId);
    if (from != address(0)) {
        require(_inResale, "Transfers only allowed through resaleTransfer");
        _inResale = false;
    }
    return super._update(to, tokenId, auth);
}
```

`_update` is OpenZeppelin's single choke point for every ownership change.
Blocking it unless `_inResale` is set means `transferFrom`, `safeTransferFrom`,
and any approved operator all revert. **Without this, the price ceiling is
decoration**: a scalper would agree £300 in cash and simply transfer the token.

Two subtleties to be ready for:

- **The flag is consumed, not cleared.** `resaleTransfer` sets `_inResale = true`
  and `_update` sets it back to `false` *before* `super._update` returns — which
  is before `onERC721Received` fires on the buyer. A malicious buyer contract
  re-entering from that callback finds the guard already closed. Clearing the
  flag after the transfer instead would leave a window open for exactly one
  unchecked transfer.
- **This deliberately breaks ERC-721 compliance.** `transferFrom` always
  reverts, so generic NFT tooling will not work with our tickets. We chose the
  anti-scalping guarantee over the standard, and that is a trade-off, not an
  oversight.

### 1.4 Payment

```solidity
delete listings[tokenId];          // effects
_inResale = true;
_safeTransfer(seller, msg.sender, tokenId, "");
(bool paid, ) = payable(seller).call{value: msg.value}("");
require(paid, "Payment to seller failed");
```

Checks → effects → interactions. The listing is cleared before anything
external runs, and the whole function reverts atomically if the seller cannot
accept ETH (covered by a `RejectsEther` mock, since no EOA test can reach that
branch).

### 1.5 Token metadata — `tokenURI`

Built and base64-encoded **on-chain**, so a wallet needs nothing but the
contract:

```
data:application/json;base64,eyJuYW1lIjoi...   →  { name, description, image, attributes }
```

- If the organizer uploaded a poster, `image` is `imageBaseURI + imageRef`
  (the node's `/images/<sha256>`).
- If not, `image` is a **data URI containing an SVG generated in Solidity** from
  the token ID — a hue derived from `(tokenId * 47) % 360`, the event name, and
  the ticket number. Self-contained, renders anywhere, forever.

`_escapeXml` and `_escapeJson` exist because an event called
`Rock & "Roll" <Live>` would otherwise produce a document no wallet can parse.
There is a test for exactly that string.

`tokenURI` is a `view`, so all this string work costs **zero gas** — it runs in
the caller's node, not in a transaction.

---

## 2. The hand-built blockchain — `network/blockchain/`

No Ethereum dependency anywhere in this package. Follow one ticket announcement
through it.

### 2.1 `transaction.py` — signing

A dataclass carrying `sender`, `recipient`, `ticket_id`, `price`, `face_value`,
`timestamp`, plus optional `kind` / `event_name` / `event_date`.

- **ECDSA over SECP256K1** (the Bitcoin/Ethereum curve) via the `cryptography`
  library, DER-encoded signatures.
- `_signable_bytes()` is `json.dumps(payload, sort_keys=True, separators=(",",":"))`
  — **deterministic serialization**, because two nodes that serialize the same
  transaction differently would compute different hashes and reject each other's
  signatures.
- `is_valid()` = signature verifies **and** `price <= face_value`. The
  anti-scalping rule is enforced at the data-structure level: an over-priced
  transaction cannot enter a mempool anywhere on the network.
- The optional fields are **omitted from the signable payload when unset**, so
  transactions created before those fields existed still verify byte-for-byte.

### 2.2 `merkle.py` — inclusion without download

Leaves are transaction hashes; internal nodes are `SHA256(left || right)`; odd
levels duplicate the last node. The root goes in the block header.

The point is `get_proof` / `verify_proof`: you can prove a transaction is in a
block with `log₂(n)` hashes instead of the whole block. Change any transaction
and the root changes, so the header is a tamper-detector for its contents.

### 2.3 `pow.py` — proof-of-work

Header = `index, prev_hash, merkle_root, timestamp, difficulty, nonce`. Mining
increments `nonce` until `SHA256(header)` has **16 leading zero bits** (four
hex zeros). Measured: ~66,000 attempts, ~389 ms median.

### 2.4 `chain.py` — the chain and the fork rule

`is_chain_valid()` walks every block checking four things: PoW holds, `prev_hash`
links, the Merkle root matches the stored transactions, and every signature
verifies.

`should_replace_with(candidate)` is the fork-choice rule:

1. strictly **longer** — otherwise a stale peer could roll us backwards;
2. **same genesis block** — otherwise a longer, internally-consistent chain from
   an unrelated network could hijack the node;
3. **fully valid**.

### 2.5 `puzzle.py` — per-message Sybil resistance

Before broadcasting, a sender must find a nonce making `SHA256(message || nonce)`
have **8 leading zero bits** (~256 tries, microseconds). The receiver verifies
in **one hash** before doing any signature work, so flooding costs the attacker
real CPU per message while costing us almost nothing.

Two difficulties on purpose: 16 bits for blocks (consensus), 8 for messages
(spam). Reusing the block difficulty per message would make the node unusable.

---

## 3. The P2P layer — `network/main.py`

`TicketChainCommunity` is an IPv8 overlay. Four message types:
`TransactionPayload`, `BlockPayload`, `ChainRequestPayload`, `ChainResponsePayload`.

- **Localized discovery.** UDP broadcast bootstrapping, no public trackers. The
  overlay's `community_id` is `sha1("ticketchain-" + event_name)[:20]`, so nodes
  started with different `--event` values form **disjoint networks** and never
  see each other. That is what "localized" means here concretely.
- **Chain sync** fires on three triggers: a newly discovered peer, a block
  arriving ahead of our index, and a 15-second timer. The timer exists because
  we hit a real bug — IPv8 does not necessarily fire `on_peer_added` for an
  identity it has seen before, so a *restarted* peer was never treated as new
  and nothing prompted a resync.
- **Mempool pruning.** When a peer's block is appended, its transactions are
  removed from our mempool, so republished events do not linger as duplicate
  "Pending" entries.

---

## 4. The bridge — `network/bridge.py`

Polls the Hardhat node every 2 s for `TicketMinted`, `TicketListed`,
`TicketUnlisted`, `TicketTransferred`. For each event it:

1. reads `getTicketEvent(tokenId)` (cached per token, cleared on chain reset) for
   the event name, date and **that ticket's face value**;
2. builds a signed `Transaction` with `kind` = the lifecycle state;
3. submits to the mempool, mines one block per batch, and broadcasts.

**Why the per-ticket face value matters:** peers enforce `price <= face_value`
in `is_valid()`. Stamping a global ceiling would make every peer *silently
reject* transactions for any ticket priced above it — a network partition with
no error message.

Failures are best-effort by design: a failed metadata read yields placeholders
rather than dropping the whole batch, and the node keeps running when the chain
is down.

---

## 5. The HTTP API — `network/api.py`

- `GET /tickets` — **one row per token**, not per transaction. Blocks are walked
  in chain order and the mempool applied last, so the most recent state wins and
  a pending sale overrides mined history. `type` is the lifecycle state
  (`Minted` / `Listed` / `Sold` / `Unlisted`).
- `GET /health` — chain length, mempool size, `chain_valid`.
- `POST /images` — stores an upload under the **SHA-256 of its bytes**;
  `GET /images/{hash}` serves it. Content addressing means the contract holds a
  fixed-length reference that cannot be spoofed by renaming a file, and the same
  poster uploaded twice is stored once. The hash is validated as bare hex before
  it reaches the filesystem.
- CORS accepts any `localhost` origin — the socket binds to `127.0.0.1`, which
  is the real trust boundary.

---

## 6. The frontend — `frontend/src/`

React 19 + Vite, wagmi/viem for chain access, MUI for the Luminous Protocol
design system.

### 6.1 `useTicketBoard` — the read model

The single source of truth for every page:

1. `totalMinted()` → token IDs `0..n-1`. **The chain enumerates, not the P2P
   feed**, so a freshly minted ticket renders immediately instead of waiting on
   the bridge.
2. One batched `useReadContracts` doing three reads per token: `ownerOf`,
   `listings`, `getTicketEvent` (name, date, image URL, face value).
3. The P2P feed supplies fallback metadata only.
4. Derives `market` (listed first; your own unlisted tickets excluded) and
   `owned`.

### 6.2 `useTicketWrite` — one transaction lifecycle

Wraps `useWriteContract` + `useWaitForTransactionReceipt`, tracks which action
started it (`buy` / `list` / `cancel` / `mint`) so feedback can name it, and
calls back on confirmation to re-read chain state.

### 6.3 Details worth knowing

- **Expiry uses a ticking clock** (`useNowSeconds`, a `useSyncExternalStore`
  subscription), not `Date.now()` during render — a ticket that expires while
  the page is open stops offering itself without waiting for another render.
- **The listing form enforces the ceiling client-side too**, so the user learns
  before MetaMask opens. The contract is still the authority.
- **`wallet_watchAsset`** registers a ticket with MetaMask in one prompt, because
  NFT auto-detection does not work on a local chain.

---

## 7. Quality assurance

| Suite | Count | Covers |
| --- | --- | --- |
| `contracts/test/TicketNFT.test.js` | **78** | every revert path, the transfer lockdown, metadata, pricing, cap, expiry |
| `network/test_blockchain.py` | **68** | signing, Merkle, PoW, chain validation, puzzle, chain sync, API, uploads |
| `network/test_two_nodes.py` | live | two nodes discover each other and converge |

Contract coverage: **100% statements, 97.4% branches**. Benchmarks
(`network/benchmark.py`): sign 0.32 ms, validate 0.33 ms, mine 389 ms median,
peer discovery 0.87 s, block propagation 2.84 s.

---

## 8. Questions to be ready for

**"Why two blockchains? Isn't the Python one redundant?"**
Different jobs. Ethereum gives us programmable money, atomic payment-plus-
transfer, and a wallet users already trust. Our chain demonstrates the
primitives the course is about and replicates state across peers at the venue
with no server. We could have put everything on one — and the honest cost of our
choice is in the next answer.

**"What breaks if I kill the P2P node?"**
The web app keeps working, because it reads ownership from the contract. That is
the real limitation of our split and it is written in the README. What is lost
is the peer-replicated ledger: no `/tickets` feed, and no second node receiving
the state change.

**"Your token is not ERC-721 compliant."**
Correct, deliberately. `transferFrom` always reverts. A compliant token can be
transferred outside our contract, which lets a scalper settle in cash and hand
the ticket over — defeating the ceiling entirely. We traded standard
compatibility for the guarantee the project exists to make.

**"What stops the organizer raising the ceiling later?"**
Nothing in the contract can. `faceValue` is written once at mint and there is no
setter — we deliberately did not write one. The organizer is `Ownable` and can
mint, lock resale (`setResellable`), and change `imageBaseURI`; they cannot
change a price or move someone's ticket.

**"How do you prevent replay or forged transactions on your chain?"**
Every transaction is signed over deterministic bytes; changing any field breaks
the signature. `tx_hash` is the SHA-256 of the same payload, so identical
transactions collapse to one entry, and the timestamp distinguishes genuine
repeats. Peers validate every signature before accepting a block.

**"What is your consensus? What if two nodes mine at once?"**
Proof-of-work plus longest-valid-chain. Both blocks propagate; each node adopts
the strictly longer valid chain sharing its genesis, so the network converges on
the one that gets extended first. There is no incentive layer — mining is done
by whichever node bridged the event — which is fine for a cooperative local
network and would not be for an open one.

**"Is 16 bits of difficulty secure?"**
No, and it is not meant to be — 66,000 hashes is milliseconds of work. It is
calibrated to make mining *visible* in a demo. The security argument for this
project is the localized, cooperative setting; the mechanism is real, the
parameter is a demo parameter.

**"How do you stop message spam?"**
An 8-bit search puzzle on every broadcast, verified in one hash before any
signature work. Cheap to send one, expensive to send a million.

**"Why did you not put the images on IPFS?"**
It would add an external dependency to a project whose thesis is that it works
on a local network with no third party. Uploads are content-addressed on our own
node, and tickets without an upload carry SVG art generated inside the contract.
The honest limitation: a second node that never received the upload cannot serve
it, and `tokenURI` points at `127.0.0.1`, so an uploaded image renders only on
the machine running the node.

**"What happens if two nodes run different versions of your code?"**
We found this one ourselves. Adding fields to the signed payload means a new
node's transactions fail verification on an old node, which then rejects the
whole block — silently. Every machine must run the same commit. It is a real
property of changing a signed format and is documented in
[`development-process.md`](development-process.md).

**"Show me where the anti-scalping rule actually lives."**
Three places, and say all three: `listForSale` (the ceiling),
`resaleTransfer` (exact payment), and `_update` (no route around either). The
frontend also checks, but only so the user finds out before the wallet opens.
