# Per-address cap on primary-sale ticket purchases

Issue: [#45 — Week 3 / Issue 12 — Limit primary-sale purchases per address](https://github.com/Zetchu/ticket-chain/issues/45)
Branch: `45-week3-issue-12-limit-primary-sale-purchases-per-address`

## Problem

A single address can currently buy every ticket in a batch the moment it lands
on-chain. That is the exact bot behaviour the project's anti-scalping story
claims to prevent, and it is not stopped anywhere in the current contract. The
price-ceiling rule keeps a scalper from *reselling* above face value, but it
does not stop them from *cornering* a batch in the first place.

A per-address cap on the primary sale — the one flowing from organizer to
attendee — is the most direct anti-scalping measure available and does not
touch the secondary market.

## Goals

- One address cannot buy more than a configurable number of tickets on the
  primary sale of a given event.
- Secondary-market resale between attendees stays uncapped: the price ceiling
  already prevents scalping there, and capping it would block legitimate
  resale (the whole point of the ceiling was to *allow* resale at fair price).
- Each event may set its own cap at mint time; `0` means unlimited.
- The UI both communicates the cap up front and prevents a doomed transaction
  rather than surfacing a raw revert.

## Non-goals

- No admin function to change a cap after mint. The existing invariant is that
  batch settings (face value, event name, date) are permanent once the batch
  is minted; the cap follows the same rule.
- No global per-buyer cap across all events. Anti-scalping is per-event.
- No per-wallet counter shown as a running tally in the UI. A disabled Buy
  button is enough signal that the cap is hit.
- No P2P-layer change. Enforcement is on the ETH side; the P2P feed is a
  metadata mirror and does not need to know about caps.
- No frontend test framework. The project has none today and adding one is
  out of scope for this issue.

## Design

### Contract — `contracts/contracts/TicketNFT.sol`

**One new field on `EventDetails`:**

```solidity
struct EventDetails {
    string name;
    uint256 date;
    string imageRef;
    uint256 maxPerBuyer;   // 0 = unlimited, otherwise the primary-sale cap
}
```

**One new mapping** counting how many primary-sale tickets each wallet has
bought per event:

```solidity
mapping(uint256 eventId => mapping(address buyer => uint256 bought)) public primaryBought;
```

**`mintAndList` signature gains `maxPerBuyer`:**

```solidity
function mintAndList(
    uint256 quantity,
    string calldata name,
    uint256 date,
    string calldata imageRef,
    uint256 faceValue,
    uint256 maxPerBuyer
) external onlyOwner returns (uint256 eventId)
```

No validation on `maxPerBuyer` beyond storing it — zero is a valid (unlimited)
setting, and non-zero is the cap.

**`resaleTransfer` enforces the cap only on primary sales:**

```solidity
// Primary sale = seller is the organizer (owner()). We deliberately do not
// track "first transfer out of the organizer" per token: that would need a
// per-token bool with no material benefit here, and the issue explicitly
// leaves the definition to us as long as it is documented. If the organizer
// buys back on the resale market and re-sells, that resale counts as primary
// again — acceptable given owner() is the deployer and rarely resells.
if (seller == owner()) {
    uint256 eventId = tickets[tokenId].eventId;
    uint256 cap = eventDetails[eventId].maxPerBuyer;
    if (cap != 0) {
        require(
            primaryBought[eventId][msg.sender] < cap,
            "Primary purchase limit reached for this event"
        );
    }
    primaryBought[eventId][msg.sender] += 1;
}
```

Placed before the existing `_inResale` / `_safeTransfer` block, so a
cap-hitting call reverts before any state change or ETH movement.

**`mintTicket` (the eventless fallback) is unaffected.** It mints directly to
a target address and never routes through `resaleTransfer` for its primary
sale, so the cap logic does not run for event 0 by construction. A comment
next to the event-0 setup will note this.

### Frontend

**`useTicketBoard.ts`** picks up the new field. `getTicketEvent` returns a
tuple that grows by one element:

```ts
readonly [name: string, date: bigint, image: string, faceValue: bigint, maxPerBuyer: bigint]
```

`BoardTicket` gains two fields:

```ts
interface BoardTicket {
  // ...existing...
  maxPerBuyer?: bigint;      // 0 = unlimited
  primaryBought?: bigint;    // for the connected wallet, this event
}
```

`primaryBought` is fetched with one contract read per distinct
`(eventId, viewer)` pair present on the board — tickets in the same batch
share the same event, so we do not read once per token. The reads are
included in the same `useReadContracts` batch as the existing per-token
reads, keyed on the same query so refresh invalidates them together.

**`TicketCard.tsx`** — three touchpoints:

1. **Cap chip.** When `maxPerBuyer > 0`, render a small `StatusChip` reading
   `Limit N / wallet` next to the existing Listed/Not-listed chip.
2. **Preemptive Buy gate.** When the viewer is not the ticket's current
   owner, the seller (owner of the token) equals the contract owner,
   `maxPerBuyer > 0`, and `primaryBought >= maxPerBuyer`, the Buy button is
   disabled with the label `Limit reached`.
3. Nothing else changes about the card's layout — the chip slot already
   exists.

**`components/TransactionSnackbar.tsx` (via `lib/format.ts`)** — extend
`readableError` to map the exact revert reason
`"Primary purchase limit reached for this event"` to the friendlier
`"You've hit this event's per-wallet purchase limit."`. Exact string match,
no regex; every other error still passes through unchanged.

**`OrganizerPage.tsx`** — one new numeric input labelled `Max per buyer`,
default `0`, helper text `0 = unlimited`. Wired into the `mintAndList` args
tuple as the sixth argument.

### Data flow (primary purchase, cap hit)

1. Buyer clicks Buy on `TicketCard`. Button is enabled because
   `primaryBought < maxPerBuyer` at page-load time.
2. If the buyer already succeeded on N-1 purchases in the same session,
   `useTicketBoard` refreshed after each; the button flips to `Limit reached`
   after the N-th confirms and blocks further clicks preemptively.
3. If a race slips through (two txs in flight simultaneously), the contract
   reverts the second with `"Primary purchase limit reached for this event"`
   and the snackbar renders the friendly message via `readableError`.

## Testing

Four new contract tests in a new `describe("Primary purchase cap")` block in
`contracts/test/TicketNFT.test.js`:

1. **Cap enforced.** Mint with `maxPerBuyer: 2`. One wallet takes 2 primary
   tickets successfully; the third primary purchase reverts with the exact
   message `"Primary purchase limit reached for this event"`.
2. **Resale exemption.** Same batch, cap `2`. Wallet A buys 2 primary; wallet
   B buys 1 primary and lists it; wallet A buys that ticket from B on the
   secondary market — succeeds, `primaryBought` for wallet A stays at 2.
3. **Per-address isolation.** Batch with cap `2`. Wallets A and B each buy
   their 2 primary tickets independently; both succeed.
4. **Cap 0 = unlimited.** Batch with `maxPerBuyer: 0`. One wallet takes 5
   primary tickets from the batch, no revert.

**Mechanical update to existing tests.** Every existing `mintAndList` call in
the test file gets `0` appended for `maxPerBuyer` (unlimited — matches
current behaviour, so no other test needs re-thinking).

**No frontend tests** — the project has no test framework for the frontend
today, and adding one is out of scope. Manual verification steps go in the
PR description.

## Rollout

Local-dev only. No migration story, no backwards-compat shim. The signature
change on `mintAndList` requires:

- Updating the frontend caller in `OrganizerPage.tsx`.
- Updating the deploy/demo scripts (`contracts/scripts/deploy.js`,
  `contracts/scripts/demo-rainy-day.js`) if they call `mintAndList`.
- Regenerating the ABI export the frontend imports.

## Open risks

- **Organizer buy-back edge case.** If the organizer buys a ticket back via
  `resaleTransfer` (which they can — they are just another wallet on the
  secondary market) and then re-lists and re-sells, that re-sale counts as a
  primary sale again against the buyer. Acceptable: in the current design the
  organizer's role at deploy time is fixed and this scenario is not part of
  the demo flow. Called out in the contract comment.
- **Extra reads on the board.** One `primaryBought` read per distinct
  `(eventId, viewer)` — small in a demo with a handful of events, not a
  concern at this scale.
