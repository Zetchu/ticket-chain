# Development Process

What we decided, what we got wrong, and what we changed once we understood the
problem better. Ordered roughly as it happened.

---

## Week 1 — building the pieces separately

We split into three tracks: the Solidity contract, the hand-built blockchain
core in Python, and the React frontend. That let four people work in parallel
from day one, and it is the reason the individual components are reasonably
solid. It is also the root of the biggest problem we hit later (see
"Two systems pretending to be one").

**Decision: build the blockchain core with no Ethereum dependency.** The
`network/blockchain/` package — transactions, Merkle tree, proof-of-work, chain
validation — imports nothing from web3 or Ethereum. Writing our own signing over
SECP256K1 rather than importing a wallet library meant we had to understand
DER-encoded ECDSA signatures and deterministic serialization, which paid off
later when a signature check started failing for a reason that turned out to be
key-ordering in a JSON dump, not cryptography.

**Trade-off: proof-of-work difficulty.** 16 leading zero bits mines in ~0.4 s at
the median, which is slow enough to be visibly *work* during a demo and fast
enough that nobody waits. Per-message spam protection uses a separate 8-bit
puzzle — ~256 hashes, negligible to send, one hash to verify — because reusing
the block difficulty for every gossip message would have made the node unusable.

---

## The anti-scalping rule, three times

This is the core of the project, and we got it wrong twice before getting it
right. Worth reading as a sequence.

**Attempt 1 — check the payment.**

```solidity
require(msg.value <= ticket.faceValue, "Scalping detected: Price exceeds face value");
```

Refuses overpayment. Ships. Looks finished.

**The hole.** There is no lower bound. `msg.value == 0` satisfies
`<= faceValue`, and `resaleTransfer` used `_safeTransfer`, which skips the
ERC-721 approval check. So **anyone could call `resaleTransfer` on anyone's
ticket with zero ETH and take it.** The function meant to prevent theft by
overcharging permitted theft outright. We found this while reviewing the
purchase flow for the frontend, not from a failing test — every test we had
asserted things that *should* revert did revert, and none asked whether
something that should have reverted didn't.

**Attempt 2 — require exact payment.** `msg.value == faceValue` closes the
zero-price hole. But a holder could still be forced to sell: any buyer could
take any ticket at face value whether or not the owner wanted to part with it.
Anti-scalping had become compulsory-purchase.

**Attempt 3 — listings.** Ownership only moves if the holder has published an
offer, and the ceiling moved to `listForSale`, where a price above face value
cannot even be *advertised*. `resaleTransfer` then requires payment to equal the
listed price exactly.

The lesson we took: the interesting question was never "is this price too high"
but "who is allowed to initiate a sale". Two of our three attempts answered the
first question well and the second one not at all.

**Related, found in the same review:** a buyer contract could re-enter from its
`onERC721Received` callback while the transfer guard `_inResale` was still
`true`, and move the ticket on to a third party at an unchecked price. The fix
was to consume the flag inside `_update` rather than clearing it after the
transfer, so it authorizes exactly one move and is already `false` by the time
the callback runs.

---

## Two systems pretending to be one

The architecture diagram we drew in week 1 showed contract events flowing into
the P2P layer. For two weeks that arrow did not exist in code. The Ethereum
contract and the Python blockchain were **completely disconnected**: you could
buy a ticket, on-chain ownership would change correctly, and the P2P feed would
keep advertising it as available forever.

The gap was hidden by scaffolding. The P2P node seeded itself with fake ticket
offerings at startup so the UI had something to render, and the token IDs
happened to match what the deploy script minted. Everything looked connected in
a demo, and was not.

We wrote the limitation into the demo runbook rather than papering over it, then
built `bridge.py`: it watches `TicketMinted`, `TicketListed`, `TicketUnlisted`
and `TicketTransferred` with web3.py, republishes each as a signed P2P
transaction, mines a block, and broadcasts it. The seeding was deleted the same
day.

**Design decision that came out of it:** the frontend enumerates tokens from
`totalMinted()` on the contract rather than from the P2P feed. We considered
making the feed the source of truth — it is truer to the diagram — but it would
have made every UI render wait on the bridge, and a P2P hiccup would have
emptied the marketplace. The chain is authoritative; the feed is a mirror. §8 of
the README states the honest consequence.

---

## The node that could never catch up

`_on_block` accepted a block only if its index was exactly `len(chain)`,
and dropped anything else with a log line. Every test passed, because every test
had both nodes running from the start and receiving every message.

In reality UDP drops packets. A node that missed one block rejected every block
after it — permanently, silently, while continuing to look healthy. The
`/health` endpoint reported `chain_valid: true` the whole time, because its own
chain *was* internally valid; it was just a different chain from everyone
else's.

The fix is a `ChainRequest`/`ChainResponse` exchange plus a longest-valid-chain
rule: adopt a peer's chain only if it is strictly longer, shares our genesis
block, and passes full validation. The genesis check matters more than it looks
— without it, a longer chain from an entirely different network would validate
cleanly and hijack the node.

**Debugging note.** The first version synced on peer discovery and on receiving
a future block. It still failed sometimes, and the cause was unintuitive: IPv8
does not necessarily fire `on_peer_added` for a peer whose identity it has seen
before, so a node that *restarted* was never treated as newly discovered and
nothing triggered a resync. A periodic sync timer was added as a backstop. The
class of bug — "the event that would have saved us is the event we missed" — is
worth remembering.

---

## Debugging challenges worth recording

**A log file that lied.** `network.log` showed a node seeding three tickets that
the code could not possibly have seeded — the seeding parameter defaulted to
zero and nothing passed it. The truth: Python buffers stdout when it is a file,
so the lines belonged to an *earlier* process whose buffer flushed on kill,
after the new process had truncated the file. We now run the node with `-u`.
Several minutes were spent doubting the source before doubting the log.

**A dependency upgrade that broke half the team.** Moving to pyipv8 3.2.1 fixed
Python 3.14 compatibility for one machine and broke every machine on 3.9, since
pyipv8 3.x imports `typing.Concatenate` (3.10+). Worse, `start_dev.sh` only
installed dependencies when `.venv` was *absent*, so nobody's environment
actually changed — they just kept running the old version and hitting different
bugs. The script now selects a suitable interpreter, rebuilds the venv when it
is too old, and reinstalls whenever `requirements.txt` is newer.

**A CORS error that was a port collision.** The frontend started reporting CORS
failures against the ticket API. The cause was a stale Vite server holding 5173,
so the new one silently moved to 5174 — which was not in the API's hard-coded
allow-list. Two fixes: the API accepts any localhost port (it binds to
127.0.0.1, so the socket already enforces the real boundary), and Vite now uses
`strictPort` so a busy port fails loudly instead of moving.

**A frontend that compiled locally and failed to deploy.** `npm run dev` does
not type-check, so an MUI v9 breaking change (`InputProps` removed in favour of
`slotProps`) reached `main` and only surfaced in the Vercel build. The
deployment is, in practice, our CI.

---

## Trade-offs we would defend

**ERC-721 compliance, deliberately broken.** `transferFrom` and
`safeTransferFrom` always revert. A compliant token would let a scalper agree a
cash price off-platform and transfer directly, which defeats the entire premise.
We chose the guarantee over the standard. The cost is real: our tickets will not
work with generic NFT marketplaces or tooling that assumes standard transfers.

**Localized discovery.** UDP-broadcast bootstrapping with no public trackers
keeps the overlay on the local network segment, which suits "everyone at the
same venue" and makes the network useless across the internet. That is the
intended shape, not a missing feature.

**One event, one face value.** `FACE_VALUE` is a constant. Per-event pricing is
a small change we chose not to make, because it adds a parameter to every mint
path and we would rather ship a smaller system we can fully justify.

**Test-heavy contract, test-free frontend.** 53 contract tests and 54 for the
blockchain core; zero automated frontend tests. Given limited time we put the
testing where a bug means stolen tickets rather than a misaligned button, and
verified the UI manually and with a headless-browser render check.

---

## What we would do differently

Build the integration seam first. Both halves of this project worked
individually within a week, and the fact that they did not work *together* was
invisible for a fortnight because scaffolding filled the gap convincingly.

Write tests that assert what *should not* be possible, not only what should. The
zero-price theft bug lived in a file with full test coverage of every revert we
had thought of.
