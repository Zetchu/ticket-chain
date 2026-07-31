import { http, createConfig } from 'wagmi';
import { hardhat } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// `hardhat` is chain ID 31337 — what `npx hardhat node` actually serves.
// (viem's `localhost` chain is 1337, which no local node here listens on,
// so every contract call would fail on a chain mismatch.)
export const config = createConfig({
  chains: [hardhat],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http('http://127.0.0.1:8545'),
  },
});
