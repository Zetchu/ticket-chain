# Refuse resale once the event has started

Issue: [#46 — Week 3 / Issue 13 — Refuse resale once the event has started](https://github.com/Zetchu/ticket-chain/issues/46)
Branch: `46-week3-issue-13-refuse-resale-once-the-event-has-started`

## Problem

Tickets stay tradeable forever, including for events that finished last
month. Nothing stops someone listing a ticket to a concert that already
happened, and a buyer has no protection against it. The contract's
`mintAndList` requires `date > 0` but does not require the date to be in the
future, so an organizer can even mint a batch whose tickets are DOA.

## Goals

- `listForSale` and `resaleTransfer` revert once `block.timestamp >=
  eventDetails[eventId].date`, with a specific, greppable revert reason.
- `mintAndList` rejects past-dated events at mint time, matching the same
  invariant the resale checks enforce.
- The frontend shows expired tickets as such — no dead Buy button, no
  useless Change-price / Unlist controls on the owner's card.
- Event 0 (the `mintTicket`-fallback bucket with `date == 0`) stays
  listable forever, since it has no event date to expire against.

## Non-goals

- No auto-cancel of active listings when the event starts. `resaleTransfer`
  reverts on any expired event, so a stale listing is unreachable
  regardless. Sweeping storage would need an iterator or off-chain keeper —
  not worth the gas for a rule already enforced.
- No cutoff period ("stop resale N hours before event") — the issue asked
  for `>= date`, that is what we build.
- No P2P-layer change. Enforcement is on the ETH side.
- No admin override. Matches the existing "batch settings are permanent"
  invariant.
- No frontend test framework. Manual verification steps go in the PR.

## Design

### Contract — `contracts/contracts/TicketNFT.sol`

**Two new revert strings:**
- `"Event has already started"` — used by both `listForSale` and
  `resaleTransfer`. The frontend depends on the literal wording.
- `"Event date must be in the future"` — used by `mintAndList`.

**`mintAndList` — add a future-date guard** immediately after the existing
`require(date > 0, ...)`:

```solidity
require(date > block.timestamp, "Event date must be in the future");
```

**`listForSale` — add the expiry check** after the ownership +
resellability checks, before the price ceiling. Event 0 (`date == 0`) must
stay listable, so the check short-circuits on `date == 0`:

```solidity
uint256 date = eventDetails[tickets[tokenId].eventId].date;
require(date == 0 || block.timestamp < date, "Event has already started");
```

**`resaleTransfer` — same check**, placed after the existing
`require(msg.value == listing.price, ...)`. This ordering means a mispay on
an expired ticket surfaces the price problem first (more actionable for
the caller). Same `date == 0 ||` short-circuit for event 0.

**No storage changes, no new events.** Both checks read `block.timestamp`,
which is deterministic per block.

### Frontend

**`useTicketBoard.ts`** already reads `getTicketEvent` which returns
`(name, date, image, faceValue, maxPerBuyer)`. The `date` bigint is
currently formatted to a display string and then dropped. Surface the raw
bigint as a new `BoardTicket` field:

```ts
interface BoardTicket {
  // ...existing...
  eventDateSeconds?: bigint;   // 0n = no date (event 0); undefined = read pending
}
```

**`TicketCard.tsx`** — one derived `isExpired` boolean drives every UI
change:

```ts
const isExpired =
  eventDateSeconds !== undefined &&
  eventDateSeconds > 0n &&
  BigInt(Math.floor(Date.now() / 1000)) >= eventDateSeconds;
```

Three touchpoints:

1. **Chip.** When `isExpired`, replace the Listed/Not-listed chip with a
   muted-tone `StatusChip label="Expired"`.
2. **Non-owner Buy button.** When `isExpired`, disable with label
   `Event started`. Placed in the button's label chain after `!isListed`
   and before `capReached`, so an unlisted expired ticket still shows
   "Not for sale" (which is the more specific state). Full label chain
   order after this change:
   `busyLabel → isConfirmed('buy') → !isChainStateLoaded → !isListed →
   isExpired → capReached → isConnected → 'Buy Ticket' / 'Connect to buy'`.
3. **Owner actions.** When `isExpired`, replace the List / Change-price /
   Unlist controls with a single disabled button labelled `Event started`.
   Prevents the owner sending a doomed `cancelListing` tx.

**`lib/format.ts`** — extend the existing `REVERT_MESSAGES` map with two
entries:

```ts
const REVERT_MESSAGES: Record<string, string> = {
  'Primary purchase limit reached for this event':
    "You've hit this event's per-wallet purchase limit.",
  'Event has already started':
    "This event has already started — resale is closed.",
  'Event date must be in the future':
    "Event date must be in the future.",
};
```

**`OrganizerPage.tsx`** — client-side echo of the contract's mint-time
rule. The existing `datetime-local` input gets a `min` attribute so the
browser refuses past dates:

```tsx
slotProps={{ htmlInput: { min: new Date().toISOString().slice(0, 16) } }}
```

The `canMint` predicate also checks
`eventDateSeconds > Math.floor(Date.now() / 1000)`. UX only — the contract
is the authoritative guard.

### Clock skew note

The frontend uses wall-clock `Date.now()`; the contract uses
`block.timestamp`. They can drift by a block time (~2s on hardhat, up to
~12s on mainnet). The chip may flip a few seconds early or late compared
to the chain. Called out in a comment on the `isExpired` derivation.

### Data flow (expired-purchase attempt)

1. Buyer opens Buy Tickets. `useTicketBoard` reads
   `eventDateSeconds`. `TicketCard` computes `isExpired` from
   `Date.now()`.
2. If `isExpired` is true, the Buy button reads `Event started` and is
   disabled — the buyer cannot even attempt the transaction.
3. If a race slips through (frontend clock behind chain by a hair, or the
   user was already mid-click when the expiry crossed), the contract
   reverts with `"Event has already started"`; the snackbar renders the
   friendly message via `readableError`.

## Testing

Five new tests in a new `describe("Event expiry")` block in
`contracts/test/TicketNFT.test.js`, all using
`@nomicfoundation/hardhat-toolbox/network-helpers`'s `time.increaseTo` for
time travel:

1. **`listForSale` reverts after the event starts.** Mint a batch dated
   1 hour ahead. Buyer buys one primary. Advance time past the date.
   Owner attempts `listForSale`; expect revert with the exact string
   `"Event has already started"`.
2. **`resaleTransfer` reverts after the event starts.** Same setup. Owner
   lists the ticket at face value before expiry. Advance time past the
   date. Buyer attempts `resaleTransfer`; expect revert with the exact
   string `"Event has already started"`.
3. **A future event is unaffected.** Mint, list, buy end-to-end without
   time travel — succeeds. Confirms the check doesn't misfire on valid
   events.
4. **`mintAndList` rejects past-dated events.** Attempt with
   `date == block.timestamp - 1`; expect revert with the exact string
   `"Event date must be in the future"`.
5. **Event 0 tickets remain listable.** Use the existing `mintedFixture`
   (which calls `mintTicket`, assigning event 0 with `date == 0`). Call
   `listForSale` — succeeds. Then `resaleTransfer` — succeeds. Proves
   the `date == 0 ||` short-circuit works.

**No changes to existing tests.** A few use hard-coded
`EVENT_DATE = 1893456000` (2030-01-01) which is still ~4 years in the
future — so those tests still pass. Rewriting them to use relative dates
is a separate cleanup, out of scope here.

**No frontend tests** — the project has no framework for the frontend
today, and adding one is out of scope. Manual verification in the PR.

## Rollout

Local-dev only. No migration story. Contract changes are pure additions
(no signature changes to any external function), so the frontend ABI
regeneration is a `deploy.js` run — same one-liner as after #45's contract
changes.

## Open risks

- **Clock skew.** Called out in the design section — frontend flips the
  chip a few seconds before or after the chain. Not a real problem;
  the contract is the authoritative guard for both `listForSale` and
  `resaleTransfer`.
- **The hard-coded 2030 event dates in existing tests will silently rot in
  ~4 years.** Deliberate non-goal here; a separate cleanup should replace
  them with `await time.latest() + N` when someone gets to it.
