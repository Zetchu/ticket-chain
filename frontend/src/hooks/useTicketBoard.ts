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

  // One batch of reads for the whole board: face value plus each token's owner
  // and listing. Keyed on chainTokenIds so it re-fetches when totalMinted grows.
  const {
    data: chainData,
    isPending: isChainPending,
    refetch: refetchChain,
  } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: ticketAddress, abi: ticketAbi, functionName: 'FACE_VALUE' },
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
      ]),
    ],
    query: { enabled: chainTokenIds.length > 0 },
  });

  const faceValue =
    chainData?.[0]?.status === 'success'
      ? (chainData[0].result as bigint)
      : undefined;

  const boardTickets = useMemo<BoardTicket[]>(
    () =>
      mergedTickets.map((ticket, index) => {
        // Three reads per token, offset by one for FACE_VALUE at the head.
        const base = 1 + index * 3;
        const ownerResult = chainData?.[base];
        const listingResult = chainData?.[base + 1];
        const eventResult = chainData?.[base + 2];

        const listingTuple =
          listingResult?.status === 'success'
            ? (listingResult.result as readonly [bigint, boolean])
            : undefined;

        const tokenOwner =
          ownerResult?.status === 'success'
            ? (ownerResult.result as string)
            : undefined;

        // The event the organizer named at mint time is the authoritative
        // title and date; the P2P feed's version is only a fallback.
        const eventTuple =
          eventResult?.status === 'success'
            ? (eventResult.result as readonly [string, bigint])
            : undefined;

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
        };
      }),
    [mergedTickets, chainData, address],
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
  }, [refetchTotalMinted, refetchChain, refetchFeed]);

  return {
    /** Every minted ticket, unfiltered — for counting across all holders. */
    all: boardTickets,
    /** Every ticket on the network, listed first — the Buy Tickets page. */
    market,
    /** Tickets held by the connected wallet — the My Tickets page. */
    owned,
    faceValue,
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
