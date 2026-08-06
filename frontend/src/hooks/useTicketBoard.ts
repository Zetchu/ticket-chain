import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useConnection, useReadContract, useReadContracts } from 'wagmi';
import { ticketAbi, ticketAddress, type Listing } from '../contracts/ticketNFT';
import { isSameAddress } from '../lib/format';

/** A ticket offering from the P2P node — see network/api.py `_tx_to_ticket`. */
export interface Ticket {
  /** On-chain ERC-721 token ID; what the contract calls are keyed on. */
  id: number;
  type: string;
  price: string;
  title: string;
  location: string;
  date: string;
}

/** A P2P offering joined with the on-chain state of the same token. */
export interface BoardTicket {
  ticket: Ticket;
  owner?: string;
  listing?: Listing;
  isOwnedByViewer: boolean;
  /** Organizer artwork for this ticket's event; absent when none was uploaded. */
  imageUrl?: string;
  /** This ticket's face value — the resale ceiling, set per batch at minting. */
  faceValue?: bigint;
  /** Per-event cap on primary-sale purchases by any one wallet; 0 = unlimited. */
  maxPerBuyer?: bigint;
  /** How many primary-sale tickets the connected wallet has already bought for this event. */
  primaryBought?: bigint;
  /** Event start time as Unix seconds; 0n for event 0 (no date), undefined while pending. */
  eventDateSeconds?: bigint;
}

const TICKETS_ENDPOINT = 'http://127.0.0.1:8080/tickets';

// The P2P node and local Hardhat chain only ever listen on 127.0.0.1 — by
// design, this is a *localized* network, not a hosted service. Visitors to a
// deployed build (e.g. Vercel) are on their own machine, which has no such node
// running, so the fetch will always fail there. That's expected, not a fault —
// a visitor on localhost genuinely has a reachability problem worth surfacing.
export const isLocalHost = ['localhost', '127.0.0.1'].includes(
  window.location.hostname,
);

async function fetchP2PTickets(): Promise<Ticket[]> {
  const response = await fetch(TICKETS_ENDPOINT);
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
}

/**
 * Render an on-chain event date (Unix seconds) for a ticket card.
 *
 * Returns undefined for 0, which is what tickets issued through `mintTicket`
 * carry — they belong to the contract's default event and have no date.
 */
function formatEventDate(timestamp: bigint): string | undefined {
  if (timestamp === 0n) return undefined;
  return new Date(Number(timestamp) * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function syntheticTicket(id: number): Ticket {
  return {
    id,
    type: 'Confirmed',
    price: '0',
    title: `Ticket #${id}`,
    location: 'Local P2P Network',
    date: '—',
  };
}

/**
 * The shared read model behind all pages: chain-enumerated token IDs enriched
 * with P2P metadata, joined with each token's on-chain owner and listing.
 *
 * Token IDs come from totalMinted() — the chain is the authoritative source.
 * The P2P feed supplies supplementary metadata (title, date) when available.
 * This means newly minted tickets appear immediately in the UI without waiting
 * for the P2P node to pick them up.
 */
export function useTicketBoard() {
  const { address } = useConnection();

  // totalMinted drives the token enumeration — chain is source of truth.
  const { data: totalMintedRaw, isPending: isTotalMintedPending, refetch: refetchTotalMinted } =
    useReadContract({
      address: ticketAddress,
      abi: ticketAbi,
      functionName: 'totalMinted',
    });

  // owner() lets callers detect the organizer without a separate read.
  const { data: ownerRaw } = useReadContract({
    address: ticketAddress,
    abi: ticketAbi,
    functionName: 'owner',
  });

  const totalMinted = Number(totalMintedRaw ?? 0);
  const owner = ownerRaw as string | undefined;

  // All token IDs that exist on-chain: 0..totalMinted-1.
  const chainTokenIds = useMemo(
    () => Array.from({ length: totalMinted }, (_, i) => i),
    [totalMinted],
  );

  const {
    data: tickets,
    isPending: isFeedPending,
    isError: isFeedError,
    error: feedError,
    refetch: refetchFeed,
  } = useQuery({
    queryKey: ['p2pTickets'],
    queryFn: fetchP2PTickets,
    retry: isLocalHost ? 2 : 0,
    refetchInterval: isLocalHost ? 15_000 : false,
  });

  // Merge: chain IDs are authoritative; P2P entries enrich with metadata.
  // For a token not yet in the feed, synthesize a minimal Ticket so it still
  // renders as soon as it appears on-chain (e.g. right after mintAndList).
  const mergedTickets = useMemo<Ticket[]>(() => {
    const byId = new Map<number, Ticket>();
    for (const ticket of tickets ?? []) {
      const existing = byId.get(ticket.id);
      if (!existing || (existing.type !== 'Confirmed' && ticket.type === 'Confirmed')) {
        byId.set(ticket.id, ticket);
      }
    }
    return chainTokenIds.map((id) => byId.get(id) ?? syntheticTicket(id));
  }, [chainTokenIds, tickets]);

  // One batch of reads for the whole board: each token's owner, listing,
  // event details (which carry the per-token face value), and the tickets
  // mapping entry (which carries the eventId for primaryBought lookups).
  // Keyed on chainTokenIds so it re-fetches when totalMinted grows.
  const {
    data: chainData,
    isPending: isChainPending,
    refetch: refetchChain,
  } = useReadContracts({
    allowFailure: true,
    contracts: [
      ...chainTokenIds.flatMap((id) => [
        {
          address: ticketAddress,
          abi: ticketAbi,
          functionName: 'ownerOf',
          args: [BigInt(id)],
        },
        {
          address: ticketAddress,
          abi: ticketAbi,
          functionName: 'listings',
          args: [BigInt(id)],
        },
        {
          address: ticketAddress,
          abi: ticketAbi,
          functionName: 'getTicketEvent',
          args: [BigInt(id)],
        },
        {
          address: ticketAddress,
          abi: ticketAbi,
          functionName: 'tickets',
          args: [BigInt(id)],
        },
      ]),
    ],
    query: { enabled: chainTokenIds.length > 0 },
  });

  const eventIdByToken = useMemo(() => {
    const out: (bigint | undefined)[] = [];
    for (let i = 0; i < chainTokenIds.length; i++) {
      const ticketResult = chainData?.[i * 4 + 3];
      if (ticketResult?.status === 'success') {
        // tickets(tokenId) returns (faceValue, isResellable, eventId)
        const tuple = ticketResult.result as readonly [bigint, boolean, bigint];
        out.push(tuple[2]);
      } else {
        out.push(undefined);
      }
    }
    return out;
  }, [chainData, chainTokenIds.length]);

  const distinctEventIds = useMemo(() => {
    const seen = new Set<string>();
    for (const id of eventIdByToken) {
      if (id !== undefined) seen.add(id.toString());
    }
    return Array.from(seen).map((s) => BigInt(s));
  }, [eventIdByToken]);

  const { data: primaryBoughtData, refetch: refetchPrimaryBought } = useReadContracts({
    allowFailure: true,
    contracts: distinctEventIds.map((eventId) => ({
      address: ticketAddress,
      abi: ticketAbi,
      functionName: 'primaryBought',
      args: [eventId, address ?? '0x0000000000000000000000000000000000000000'],
    })),
    query: { enabled: distinctEventIds.length > 0 && address !== undefined },
  });

  const primaryBoughtByEvent = useMemo(() => {
    const out = new Map<string, bigint>();
    distinctEventIds.forEach((eventId, i) => {
      const result = primaryBoughtData?.[i];
      if (result?.status === 'success') {
        out.set(eventId.toString(), result.result as bigint);
      }
    });
    return out;
  }, [distinctEventIds, primaryBoughtData]);

  const boardTickets = useMemo<BoardTicket[]>(
    () =>
      mergedTickets.map((ticket, index) => {
        // Four reads per token.
        const base = index * 4;
        const ownerResult = chainData?.[base];
        const listingResult = chainData?.[base + 1];
        const eventResult = chainData?.[base + 2];
        const ticketResult = chainData?.[base + 3];

        const listingTuple =
          listingResult?.status === 'success'
            ? (listingResult.result as readonly [bigint, boolean])
            : undefined;

        const tokenOwner =
          ownerResult?.status === 'success'
            ? (ownerResult.result as string)
            : undefined;

        // The event the organizer named at mint time is the authoritative
        // title and date; the P2P feed's version is only a fallback. The
        // fourth element is this ticket's own face value — per token, since
        // every batch can be priced differently. The fifth is maxPerBuyer.
        const eventTuple =
          eventResult?.status === 'success'
            ? (eventResult.result as readonly [string, bigint, string, bigint, bigint])
            : undefined;

        void ticketResult; // consumed via eventIdByToken memo above

        const eventId = eventIdByToken[index];

        return {
          ticket: eventTuple
            ? {
                ...ticket,
                title: eventTuple[0] || ticket.title,
                date: formatEventDate(eventTuple[1]) ?? ticket.date,
              }
            : ticket,
          owner: tokenOwner,
          listing: listingTuple
            ? { price: listingTuple[0], active: listingTuple[1] }
            : undefined,
          isOwnedByViewer: isSameAddress(tokenOwner, address),
          // Empty string means the organizer uploaded nothing, so the card
          // falls back to generated art.
          imageUrl: eventTuple && eventTuple[2] ? eventTuple[2] : undefined,
          faceValue: eventTuple?.[3],
          maxPerBuyer: eventTuple?.[4],
          eventDateSeconds: eventTuple?.[1],
          primaryBought:
            eventId !== undefined
              ? primaryBoughtByEvent.get(eventId.toString()) ?? 0n
              : undefined,
        };
      }),
    [mergedTickets, chainData, address, eventIdByToken, primaryBoughtByEvent],
  );

  // Listed tickets first; own unlisted tickets appear only on My Tickets.
  const market = useMemo(
    () =>
      boardTickets
        .filter((entry) => !entry.isOwnedByViewer || entry.listing?.active)
        .sort(
          (a, b) =>
            Number(b.listing?.active ?? false) - Number(a.listing?.active ?? false) ||
            a.ticket.id - b.ticket.id,
        ),
    [boardTickets],
  );

  const owned = useMemo(
    () => boardTickets.filter((entry) => entry.isOwnedByViewer),
    [boardTickets],
  );

  const refresh = useCallback(() => {
    refetchTotalMinted();
    refetchChain();
    refetchFeed();
    refetchPrimaryBought();
  }, [refetchTotalMinted, refetchChain, refetchFeed, refetchPrimaryBought]);

  return {
    /** Every minted ticket, unfiltered — for counting across all holders. */
    all: boardTickets,
    /** Every ticket on the network, listed first — the Buy Tickets page. */
    market,
    /** Tickets held by the connected wallet — the My Tickets page. */
    owned,
    /** Total tickets minted so far (next token ID). */
    totalMinted,
    /** Contract owner address — use to detect the organizer wallet. */
    owner,
    isPending: isTotalMintedPending || isFeedPending || (chainTokenIds.length > 0 && isChainPending),
    isError: isFeedError,
    error: feedError,
    refresh,
  };
}
