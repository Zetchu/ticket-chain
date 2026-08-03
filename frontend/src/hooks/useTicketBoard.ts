import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useConnection, useReadContracts } from 'wagmi';
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
 * The shared read model behind both pages: the P2P ticket feed joined with each
 * token's on-chain owner and listing, split by whether the connected wallet
 * holds it.
 *
 * Both pages call this. React Query and wagmi cache by key, so mounting it
 * twice costs no extra requests, and a purchase made on one page is reflected
 * on the other as soon as `refresh` runs.
 */
export function useTicketBoard() {
  const { address } = useConnection();

  const {
    data: tickets,
    isPending: isFeedPending,
    isError: isFeedError,
    error: feedError,
    refetch: refetchFeed,
  } = useQuery({
    queryKey: ['p2pTickets'],
    queryFn: fetchP2PTickets,
    retry: isLocalHost ? 2 : 0, // no point retrying a fetch that can't ever resolve
    // The node mines new offerings while the page is open.
    refetchInterval: isLocalHost ? 15_000 : false,
  });

  // The feed lists a token once per transaction, so the same ticket can appear
  // as both mined and pending. Show each token once, preferring the confirmed
  // row — two identical cards is a bug, not information.
  const uniqueTickets = useMemo(() => {
    const byId = new Map<number, Ticket>();
    for (const ticket of tickets ?? []) {
      const existing = byId.get(ticket.id);
      if (!existing || (existing.type !== 'Confirmed' && ticket.type === 'Confirmed')) {
        byId.set(ticket.id, ticket);
      }
    }
    return [...byId.values()].sort((a, b) => a.id - b.id);
  }, [tickets]);

  const tokenIds = useMemo(
    () => uniqueTickets.map((ticket) => ticket.id),
    [uniqueTickets],
  );

  // One batch of reads for the whole board: the face value (a constant, read
  // once) plus each token's owner and listing.
  const {
    data: chainData,
    isPending: isChainPending,
    refetch: refetchChain,
  } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: ticketAddress, abi: ticketAbi, functionName: 'FACE_VALUE' },
      ...tokenIds.flatMap((id) => [
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
      ]),
    ],
    query: { enabled: tokenIds.length > 0 },
  });

  const faceValue =
    chainData?.[0]?.status === 'success'
      ? (chainData[0].result as bigint)
      : undefined;

  const boardTickets = useMemo<BoardTicket[]>(
    () =>
      uniqueTickets.map((ticket, index) => {
        // Offset by one for the FACE_VALUE read at the head of the batch.
        const ownerResult = chainData?.[1 + index * 2];
        const listingResult = chainData?.[2 + index * 2];

        const listingTuple =
          listingResult?.status === 'success'
            ? (listingResult.result as readonly [bigint, boolean])
            : undefined;

        const owner =
          ownerResult?.status === 'success'
            ? (ownerResult.result as string)
            : undefined;

        return {
          ticket,
          owner,
          listing: listingTuple
            ? { price: listingTuple[0], active: listingTuple[1] }
            : undefined,
          isOwnedByViewer: isSameAddress(owner, address),
        };
      }),
    [uniqueTickets, chainData, address],
  );

  // The market view, listed tickets first since those are what a visitor can
  // act on. Your own tickets appear here only once you have listed them: an
  // unlisted ticket is not on the market, so it belongs on My Tickets alone.
  // Someone else's unlisted ticket still shows, marked "Not for sale" — it is
  // part of the network's inventory, just not for sale today.
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
    refetchChain();
    refetchFeed();
  }, [refetchChain, refetchFeed]);

  return {
    /** Every ticket on the network, listed first — the Buy Tickets page. */
    market,
    /** Tickets held by the connected wallet — the My Tickets page. */
    owned,
    faceValue,
    isPending: isFeedPending || (tokenIds.length > 0 && isChainPending),
    isError: isFeedError,
    error: feedError,
    refresh,
  };
}
