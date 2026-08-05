import type { Connector } from 'wagmi';
import { ticketAddress } from '../contracts/ticketNFT';

/**
 * Ask the wallet to display a ticket.
 *
 * MetaMask only auto-detects NFTs on the networks it has indexers for —
 * Ethereum, Base, Linea and a few others — never on a local chain. On Hardhat
 * every token has to be registered by hand, which means a second minted batch
 * simply does not appear until the holder types its contract address and token
 * ID into the Import NFT dialog. `wallet_watchAsset` does that in one prompt.
 *
 * Support is real but narrow: MIP-1 added ERC-721 to the extension, and it is
 * still marked experimental and unimplemented on mobile. Callers must handle a
 * rejection as an ordinary outcome and fall back to telling the user to import
 * manually.
 */

interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

export class WatchAssetUnsupported extends Error {}

export async function watchTicket(connector: Connector, tokenId: number): Promise<boolean> {
  const provider = (await connector.getProvider()) as Eip1193Provider | undefined;
  if (!provider?.request) {
    throw new WatchAssetUnsupported('This wallet cannot add tokens automatically.');
  }

  try {
    // Returns true once the user accepts the prompt.
    return Boolean(
      await provider.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC721',
          options: { address: ticketAddress, tokenId: String(tokenId) },
        },
      }),
    );
  } catch (error) {
    // 4200 "unsupported method" and the ERC-721-specific "asset type not
    // supported" both mean the same thing to us: this wallet cannot do it, so
    // the user needs the manual route rather than an error they can't act on.
    const code = (error as { code?: number }).code;
    const message = (error as { message?: string }).message ?? '';
    if (code === 4200 || /not supported/i.test(message)) {
      throw new WatchAssetUnsupported(
        'This wallet cannot add NFTs automatically — import it manually with the contract address and token ID.',
      );
    }
    throw error;
  }
}
