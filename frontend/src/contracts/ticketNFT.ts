// Shared handle on the deployed TicketNFT contract.
//
// TicketNFT.json is written by contracts/scripts/deploy.js on every deploy.
// Importing JSON widens its fields to `string` / `unknown[]`, but wagmi wants
// a 0x-prefixed address and an Abi, so the types are restated here once
// instead of at every call site.
import type { Abi } from 'viem';
import TicketNFTData from './TicketNFT.json';

export const ticketAddress = TicketNFTData.address as `0x${string}`;
export const ticketAbi = TicketNFTData.abi as Abi;

/** An owner's standing offer to sell a ticket — mirrors the Listing struct. */
export interface Listing {
  price: bigint;
  active: boolean;
}
