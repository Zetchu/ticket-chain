# Event Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refuse `listForSale` and `resaleTransfer` once an event has started, reject past-dated events at mint time, and show tickets as expired in the UI instead of offering dead Buy buttons.

**Architecture:** Two revert strings — `"Event has already started"` (used by `listForSale` and `resaleTransfer`) and `"Event date must be in the future"` (used by `mintAndList`) — enforced with three inline `require`s. Event 0 (the `mintTicket` fallback with `date == 0`) short-circuits the expiry check so those tickets stay listable. Frontend derives `isExpired` from a raw `eventDateSeconds` bigint added to `BoardTicket`, and gates every relevant `TicketCard` control on it.

**Tech Stack:** Solidity 0.8.24 + OpenZeppelin 5 (contract), Hardhat + Chai + `@nomicfoundation/hardhat-toolbox/network-helpers` `time` helpers (tests), React 19 + wagmi/viem + MUI 9 (frontend).

**Spec:** [`docs/superpowers/specs/2026-08-05-event-expiry-design.md`](../specs/2026-08-05-event-expiry-design.md)

## Global Constraints

- **Exact revert strings** (the frontend depends on the literal wording):
  - `"Event has already started"` — from `listForSale` and `resaleTransfer`.
  - `"Event date must be in the future"` — from `mintAndList`.
- **Event 0 short-circuit:** the expiry check must always allow `date == 0` (event 0 = `mintTicket` fallback, no date). Form: `require(date == 0 || block.timestamp < date, "Event has already started")`.
- **No new storage, no new events, no ABI signature changes.** All three changes are pure `require` additions inside existing functions.
- **No auto-cancel of stale listings.** `resaleTransfer` reverts on expired events, which is sufficient.
- **No frontend test framework added.** Manual verification per task.
- **`mintAndList` still requires `date > 0`** — the new `date > block.timestamp` check comes *after* it, so a missing date still surfaces the current error message.

---

### Task 1: Contract — add expiry checks and past-date guard, with all 5 tests

**Files:**
- Modify: `contracts/contracts/TicketNFT.sol`
- Modify: `contracts/test/TicketNFT.test.js`

**Interfaces:**
- Consumes: existing `eventDetails[eventId].date` (uint256, unix seconds; 0 for event 0), `tickets[tokenId].eventId`, and `block.timestamp`.
- Produces:
  - `mintAndList` reverts with `"Event date must be in the future"` when `date <= block.timestamp`.
  - `listForSale` reverts with `"Event has already started"` when `date != 0 && block.timestamp >= date`.
  - `resaleTransfer` reverts with `"Event has already started"` under the same condition.

- [ ] **Step 1: Add all 5 failing tests**

Add `time` to the network-helpers import at the top of `contracts/test/TicketNFT.test.js`:

```javascript
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
```

Append a new `describe` block at the end of the file, just before the top-level `describe("TicketNFT", ...)` closing `});`:

```javascript
  describe("Event expiry", function () {
    // Event dated one hour ahead of the current block time. Every expiry
    // test starts here; the ones that need to be past-expiry call
    // time.increaseTo(EVENT_TIME + 1) to jump the chain clock past it.
    async function futureEventFixture() {
      const state = await loadFixture(deployFixture);
      const eventTime = (await time.latest()) + 3600;
      await state.ticket.mintAndList(2, EVENT_NAME, eventTime, "", FACE, 0);
      return { ...state, eventTime };
    }

    it("listForSale reverts once the event has started", async function () {
      const { ticket, bob, eventTime } = await loadFixture(futureEventFixture);
      // Buyer takes the ticket on primary sale before expiry.
      await ticket.connect(bob).resaleTransfer(0, { value: FACE });
      // Chain jumps to just past the event start.
      await time.increaseTo(eventTime + 1);
      await expect(
        ticket.connect(bob).listForSale(0, FACE)
      ).to.be.revertedWith("Event has already started");
    });

    it("resaleTransfer reverts once the event has started", async function () {
      const { ticket, alice, bob, eventTime } = await loadFixture(futureEventFixture);
      // Alice buys primary, lists at face value while the event is still upcoming.
      await ticket.connect(alice).resaleTransfer(0, { value: FACE });
      await ticket.connect(alice).listForSale(0, FACE);
      await time.increaseTo(eventTime + 1);
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: FACE })
      ).to.be.revertedWith("Event has already started");
    });

    it("a future event is unaffected", async function () {
      const { ticket, alice, bob } = await loadFixture(deployFixture);
      const eventTime = (await time.latest()) + 3600;
      await ticket.mintAndList(1, EVENT_NAME, eventTime, "", FACE, 0);
      // Full primary + resale flow, no time travel — should just work.
      await ticket.connect(alice).resaleTransfer(0, { value: FACE });
      await ticket.connect(alice).listForSale(0, FACE);
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: FACE })
      ).not.to.be.reverted;
      expect(await ticket.ownerOf(0)).to.equal(bob.address);
    });

    it("mintAndList rejects past-dated events", async function () {
      const { ticket } = await loadFixture(deployFixture);
      const past = (await time.latest()) - 1;
      await expect(
        ticket.mintAndList(1, EVENT_NAME, past, "", FACE, 0)
      ).to.be.revertedWith("Event date must be in the future");
    });

    it("event 0 tickets (mintTicket fallback) remain listable and buyable", async function () {
      const { ticket, alice, bob } = await loadFixture(deployFixture);
      await ticket.mintTicket(alice.address);
      const price = await ticket.DEFAULT_FACE_VALUE();
      // Event 0 has date == 0, so the expiry short-circuit must pass.
      await expect(ticket.connect(alice).listForSale(0, price)).not.to.be.reverted;
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: price })
      ).not.to.be.reverted;
      expect(await ticket.ownerOf(0)).to.equal(bob.address);
    });
  });
```

- [ ] **Step 2: Run the new tests to confirm they fail (RED)**

Run: `cd contracts && npx hardhat test --grep "Event expiry"`
Expected: tests 1, 2, and 4 fail (no enforcement yet); tests 3 and 5 pass. If any test errors on the `time` import, the require in step 1 was mistyped.

- [ ] **Step 3: Add the past-date guard to `mintAndList`**

In `contracts/contracts/TicketNFT.sol`, locate `mintAndList` (around line 119). After the existing `require(date > 0, "Event date is required");`, insert:

```solidity
        require(date > block.timestamp, "Event date must be in the future");
```

Order matters: `date > 0` fires first for a zero date, `date > block.timestamp` fires for a set-but-past date.

- [ ] **Step 4: Add the expiry check to `listForSale`**

Locate `listForSale` (around line 327). After the existing three requires (`ownerOf`, `isResellable`, `price <= faceValue`) and before the `listings[tokenId] = ...` line, insert:

```solidity
        // Refuse listings for events that have started. Event 0 (the
        // mintTicket() fallback) has date == 0 and no meaningful start,
        // so it short-circuits and stays listable forever.
        uint256 eventDate = eventDetails[tickets[tokenId].eventId].date;
        require(
            eventDate == 0 || block.timestamp < eventDate,
            "Event has already started"
        );
```

- [ ] **Step 5: Add the expiry check to `resaleTransfer`**

Locate `resaleTransfer` (around line 354). After the existing `require(msg.value == listing.price, ...)` and *before* the primary-sale cap block introduced in issue #45, insert:

```solidity
        // Refuse purchases for events that have started. Same event 0
        // short-circuit as listForSale — the mintTicket() fallback has
        // no event date to expire against.
        uint256 eventDate = eventDetails[tickets[tokenId].eventId].date;
        require(
            eventDate == 0 || block.timestamp < eventDate,
            "Event has already started"
        );
```

- [ ] **Step 6: Run the full suite to verify green**

Run: `cd contracts && npx hardhat test`
Expected: all pre-existing tests + 5 new tests pass. If any pre-existing test breaks with `"Event has already started"`, likely a test uses `EVENT_DATE = 1893456000` (2030-01-01) — still in the future, so shouldn't fire, but check the message.

- [ ] **Step 7: Commit**

```bash
git add contracts/contracts/TicketNFT.sol contracts/test/TicketNFT.test.js
git commit -m "feat(contract): refuse resale once the event has started"
```

---

### Task 2: Frontend — surface raw event date on `BoardTicket`

**Files:**
- Modify: `frontend/src/hooks/useTicketBoard.ts`

**Interfaces:**
- Consumes: existing `getTicketEvent` return tuple `readonly [string, bigint, string, bigint, bigint]` (name, date, image, faceValue, maxPerBuyer).
- Produces: `BoardTicket.eventDateSeconds?: bigint` — `undefined` while the read is pending, `0n` for event 0 (no date), otherwise the Unix-seconds start time.

- [ ] **Step 1: Extend the `BoardTicket` interface**

In `frontend/src/hooks/useTicketBoard.ts`, add the field to the interface, next to the existing `maxPerBuyer` field:

```ts
  /** Event start time as Unix seconds; 0n for event 0 (no date), undefined while pending. */
  eventDateSeconds?: bigint;
```

- [ ] **Step 2: Populate it in the `boardTickets` map**

In the `useMemo` that builds each `BoardTicket`, extend the returned object with:

```ts
          eventDateSeconds: eventTuple?.[1],
```

The `eventTuple` is already destructured elsewhere in the same block; index `[1]` is the `date` bigint returned by `getTicketEvent`.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useTicketBoard.ts
git commit -m "feat(frontend): surface raw eventDateSeconds on BoardTicket"
```

---

### Task 3: Frontend — extend `readableError` map with the two new revert strings

**Files:**
- Modify: `frontend/src/lib/format.ts`

**Interfaces:**
- Consumes: exact revert strings from Task 1.
- Produces: `readableError` remaps `"Event has already started"` → `"This event has already started — resale is closed."` and `"Event date must be in the future"` → `"Event date must be in the future."`. Every other error unchanged.

- [ ] **Step 1: Extend `REVERT_MESSAGES`**

Edit `frontend/src/lib/format.ts`. The `REVERT_MESSAGES` constant already has one entry (from issue #45). Add two more:

```ts
const REVERT_MESSAGES: Record<string, string> = {
  'Primary purchase limit reached for this event':
    "You've hit this event's per-wallet purchase limit.",
  'Event has already started':
    'This event has already started — resale is closed.',
  'Event date must be in the future':
    'Event date must be in the future.',
};
```

Keep the existing entry byte-for-byte — do not touch it. The `readableError` function body itself is unchanged.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/format.ts
git commit -m "feat(frontend): friendly wording for event-expiry reverts"
```

---

### Task 4: Frontend — `TicketCard` expired state (chip + Buy gate + owner actions)

**Files:**
- Modify: `frontend/src/components/TicketCard.tsx`

**Interfaces:**
- Consumes: `BoardTicket.eventDateSeconds` from Task 2.
- Produces:
  - When `isExpired`, the artwork-overlay chip reads `Expired` in the `neutral` tone (replaces the Listed / Not-listed chip).
  - Non-owner Buy button disabled with label `Event started` when `isExpired`.
  - Owner sees a single disabled `Event started` button in place of the List / Change-price / Unlist controls when `isExpired`.

- [ ] **Step 1: Compute `isExpired` inside `TicketCard`**

Near the top of the component body, alongside the existing `hasCap` / `capReached` derivations added in issue #45, insert:

```ts
  const eventDateSeconds = entry.eventDateSeconds;
  // Frontend uses wall-clock time; the contract uses block.timestamp. These
  // can drift by a block time (~2s on hardhat) so the chip may flip a few
  // seconds early or late. The contract is the authoritative guard.
  const isExpired =
    eventDateSeconds !== undefined &&
    eventDateSeconds > 0n &&
    BigInt(Math.floor(Date.now() / 1000)) >= eventDateSeconds;
```

- [ ] **Step 2: Swap the artwork-overlay chip when expired**

Locate the existing chip block (the `<StatusChip tone={isListed ? 'cyan' : 'neutral'} ... />` inside the `<Box sx={{ position: 'absolute', top: 12, right: 12 }}>`). Replace it with a conditional:

```tsx
        <Box sx={{ position: 'absolute', top: 12, right: 12 }}>
          <StatusChip
            tone={isExpired ? 'neutral' : isListed ? 'cyan' : 'neutral'}
            label={isExpired ? 'Expired' : isListed ? 'Listed' : 'Not listed'}
          />
        </Box>
```

Do not touch the "Yours" chip on the left, and do not touch the cap chip at `bottom: 12, right: 12`.

- [ ] **Step 3: Extend the non-owner Buy button label + disabled**

Locate the else branch (non-owner) of the actions block — the `<Button ... onClick={buy}>` around lines 249-267.

Update the `disabled` and label chain to include `isExpired`:

```tsx
            <Button
              fullWidth
              variant='contained'
              onClick={buy}
              disabled={!isConnected || !isListed || write.isBusy || capReached || isExpired}
              sx={ctaButtonSx(write.isConfirmed && write.action === 'buy', write.isBusy)}
            >
              {busyLabel ??
                (write.isConfirmed && write.action === 'buy'
                  ? 'Purchased'
                  : !isChainStateLoaded
                    ? 'Loading…'
                    : !isListed
                      ? 'Not for sale'
                      : isExpired
                        ? 'Event started'
                        : capReached
                          ? 'Limit reached'
                          : isConnected
                            ? 'Buy Ticket'
                            : 'Connect to buy')}
            </Button>
```

Order: `busyLabel → isConfirmed('buy') → !isChainStateLoaded → !isListed → isExpired → capReached → isConnected`. `isExpired` sits between `!isListed` and `capReached`, exactly as the spec requires.

- [ ] **Step 4: Replace owner actions with a disabled placeholder when expired**

Locate the owner branch (`{isOwnedByViewer ? (`) around line 213. It currently branches into three sub-branches: listing form open, listed (Change-price + Unlist), and not listed (List for resale).

Wrap the whole owner branch in an `isExpired` gate. The simplest way is to add the check as the outermost branch inside the ternary:

```tsx
          {isOwnedByViewer ? (
            isExpired ? (
              <Button fullWidth disabled sx={ctaButtonSx(false, true)}>
                Event started
              </Button>
            ) : isListingFormOpen && faceValue !== undefined ? (
              // ...existing ListingForm branch unchanged...
            ) : isListed ? (
              // ...existing Change-price / Unlist branch unchanged...
            ) : (
              // ...existing List-for-resale branch unchanged...
            )
          ) : (
            // ...existing non-owner branch, now extended in Step 3...
          )}
```

Do not modify the existing sub-branches beyond wrapping — the chip and Buy-button changes above are the only touch-ups needed.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Manual verification (describe in report, cannot run dev env in a subagent)**

Note in your report the following steps for a human to run against `./start_dev.sh`:

1. As organizer, mint a batch with an event date 2 minutes ahead. Confirm the card shows a `Listed` chip.
2. Wait 2 minutes. Refresh. Confirm the chip flips to `Expired`, the non-owner Buy button reads `Event started` and is disabled, and the owner sees only a disabled `Event started` button (no List / Change-price / Unlist).
3. As organizer, attempt to `Mint & List` with a date in the past — the browser's `datetime-local` field with `min` should reject it, and if forced through the JS `canMint` gate should refuse.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/TicketCard.tsx
git commit -m "feat(frontend): show expired tickets as such and gate all trade actions"
```

---

### Task 5: Frontend — `OrganizerPage` past-date guard

**Files:**
- Modify: `frontend/src/pages/OrganizerPage.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: the `datetime-local` field's `min` attribute is now `new Date().toISOString().slice(0, 16)` (browser refuses past dates); `canMint` also refuses a past `eventDateSeconds`.

- [ ] **Step 1: Add `min` to the event-date `TextField`**

Locate the `Event date` field in `frontend/src/pages/OrganizerPage.tsx` (around line 216). Currently:

```tsx
            <TextField
              fullWidth
              type='datetime-local'
              size='small'
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              sx={{ mb: 2.5 }}
            />
```

Add a `slotProps` block with the `min` attribute:

```tsx
            <TextField
              fullWidth
              type='datetime-local'
              size='small'
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              slotProps={{
                htmlInput: { min: new Date().toISOString().slice(0, 16) },
              }}
              sx={{ mb: 2.5 }}
            />
```

Note: `min` is a hint — the user can still paste an earlier date. The `canMint` gate below is the real front-line client check; the contract is the authoritative one.

- [ ] **Step 2: Tighten `canMint`**

Locate the `canMint` computation (currently around line 77):

```ts
  const canMint =
    eventName.trim().length > 0 &&
    eventDateSeconds > 0 &&
    quantity > 0 &&
    priceWei !== undefined &&
    !isBusy &&
    !isUploading;
```

Change `eventDateSeconds > 0` to `eventDateSeconds > Math.floor(Date.now() / 1000)`:

```ts
  const canMint =
    eventName.trim().length > 0 &&
    eventDateSeconds > Math.floor(Date.now() / 1000) &&
    quantity > 0 &&
    priceWei !== undefined &&
    !isBusy &&
    !isUploading;
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Manual verification (describe in report)**

Note in your report:
1. Open the Organizer page, pick a date in the past via the datetime-local (typing it directly, since `min` only affects the picker). Confirm the `Mint & List` button is disabled.
2. Pick a future date; confirm the button enables.
3. If the button somehow fires with a past date (e.g. the user was mid-click when the clock rolled over), the contract still reverts with the friendly `Event date must be in the future.` message from Task 3.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/OrganizerPage.tsx
git commit -m "feat(frontend): refuse past event dates in the organizer mint form"
```

---

## Self-Review

**Spec coverage check:**

| Spec item | Task |
|---|---|
| `listForSale` reverts once event has started | Task 1 (steps 4, 6) |
| `resaleTransfer` reverts once event has started | Task 1 (steps 5, 6) |
| `mintAndList` rejects past dates | Task 1 (steps 3, 6) |
| Event 0 short-circuit stays listable | Task 1 (step 5 test) |
| Exact revert strings | Task 1 (verbatim in code and tests) |
| `BoardTicket.eventDateSeconds` | Task 2 |
| `isExpired` derivation with clock-skew comment | Task 4 (step 1) |
| Expired chip | Task 4 (step 2) |
| Non-owner Buy button `Event started` | Task 4 (step 3) |
| Owner actions replaced when expired | Task 4 (step 4) |
| Full Buy-button label chain order | Task 4 (step 3 — matches spec verbatim) |
| Two REVERT_MESSAGES entries | Task 3 |
| `min` attr on OrganizerPage datetime input | Task 5 (step 1) |
| `canMint` future-date check | Task 5 (step 2) |
| 5 new contract tests, using time helpers | Task 1 (all 5 in step 1) |
| No ABI regeneration task (no signature change) | (Not needed; documented in constraints) |

**Placeholder scan:** No TBD/TODO. Every step has concrete code or a specific verification command.

**Type consistency:**
- `eventDateSeconds` typed as `bigint | undefined` in Task 2 and consumed as bigint (with `> 0n` guard) in Task 4 — consistent.
- Revert strings quoted identically in contract, tests, and `REVERT_MESSAGES` — verified against the plan text.
- `isExpired` used identically in all three Task 4 touchpoints (chip, non-owner button, owner-branch outer gate).
- Label-chain ordering in Task 4 step 3 matches the spec's spelled-out order verbatim.

No open gaps.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-05-event-expiry.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
