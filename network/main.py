"""TicketChain P2P network layer — IPv8 + hand-built blockchain core.

Each node maintains a local Blockchain instance. When a transaction is
submitted or a block is mined, it is broadcast to all known peers using
IPv8 lazy-payload messages. Receiving peers validate before accepting.

Usage:
    python main.py [port]
"""

import json
import sys
from asyncio import run
from dataclasses import dataclass

from ipv8.community import Community, CommunitySettings
from ipv8.configuration import (
    Bootstrapper,
    BootstrapperDefinition,
    ConfigBuilder,
    Strategy,
    WalkerDefinition,
)
from ipv8.messaging.lazy_payload import VariablePayload, vp_compile
from ipv8.peerdiscovery.network import PeerObserver
from ipv8.types import Peer
from ipv8.util import run_forever
from ipv8_service import IPv8

from blockchain import Blockchain, Transaction, Block

DEFAULT_PORT = 8090

# Bootstrap via UDP broadcast only: peers are discovered on the local
# network, keeping the development overlay isolated from public trackers.
LOCAL_BOOTSTRAP = [BootstrapperDefinition(Bootstrapper.UDPBroadcastBootstrapper, {})]


# ---------------------------------------------------------------------------
# IPv8 message payloads (JSON-encoded blobs)
# ---------------------------------------------------------------------------

@vp_compile
class TransactionPayload(VariablePayload):
    """Carries a single serialized Transaction between peers."""
    msg_id = 1
    format_list = ["4?H"]  # length-prefixed bytes
    names = ["data"]

    # Convenience constructors
    @classmethod
    def from_transaction(cls, tx: Transaction) -> "TransactionPayload":
        return cls(json.dumps(tx.to_dict()).encode())

    def to_transaction(self) -> Transaction:
        return Transaction.from_dict(json.loads(self.data))


@vp_compile
class BlockPayload(VariablePayload):
    """Carries a single serialized Block between peers."""
    msg_id = 2
    format_list = ["4?H"]
    names = ["data"]

    @classmethod
    def from_block(cls, block: Block) -> "BlockPayload":
        return cls(json.dumps(block.to_dict()).encode())

    def to_block(self) -> Block:
        return Block.from_dict(json.loads(self.data))


# ---------------------------------------------------------------------------
# Community
# ---------------------------------------------------------------------------

class TicketChainCommunity(Community, PeerObserver):
    """Overlay for propagating ticket transactions and blocks between local peers."""

    community_id = b"ticketchain-cs414-w1"  # 20-byte overlay identifier

    def __init__(self, settings: CommunitySettings) -> None:
        super().__init__(settings)
        self.network.add_peer_observer(self)

        # Each node owns its own Blockchain instance.
        # Difficulty 16 = ~sub-second mining on modern hardware.
        self.blockchain = Blockchain(difficulty=16)

        # Register message handlers
        self.add_message_handler(TransactionPayload, self._on_transaction)
        self.add_message_handler(BlockPayload, self._on_block)

    # ------------------------------------------------------------------
    # Peer lifecycle
    # ------------------------------------------------------------------

    def on_peer_added(self, peer: Peer) -> None:
        print(f"[{self._tag()}] discovered peer: {peer}")

    def on_peer_removed(self, peer: Peer) -> None:
        print(f"[{self._tag()}] lost peer: {peer}")

    # ------------------------------------------------------------------
    # Public API: submit a transaction locally and broadcast it
    # ------------------------------------------------------------------

    def submit_transaction(self, tx: Transaction) -> bool:
        """Validate, add to mempool, and broadcast *tx* to all peers.

        Returns True if the transaction was accepted locally.
        """
        accepted = self.blockchain.add_transaction(tx)
        if accepted:
            self._broadcast_transaction(tx)
            print(f"[{self._tag()}] submitted tx {tx.tx_hash()[:8]}…")
        else:
            print(f"[{self._tag()}] rejected tx {tx.tx_hash()[:8]}… (invalid)")
        return accepted

    # ------------------------------------------------------------------
    # Public API: mine pending transactions and broadcast the new block
    # ------------------------------------------------------------------

    def mine_block(self) -> Block:
        """Mine all pending mempool transactions into a new block and broadcast it."""
        block = self.blockchain.mine_pending()
        self._broadcast_block(block)
        print(
            f"[{self._tag()}] mined block #{block.header.index} "
            f"hash={block.block_hash()[:12]}… nonce={block.header.nonce}"
        )
        return block

    # ------------------------------------------------------------------
    # Broadcast helpers
    # ------------------------------------------------------------------

    def _broadcast_transaction(self, tx: Transaction) -> None:
        payload = TransactionPayload.from_transaction(tx)
        for peer in self.get_peers():
            self.ez_send(peer, payload)

    def _broadcast_block(self, block: Block) -> None:
        payload = BlockPayload.from_block(block)
        for peer in self.get_peers():
            self.ez_send(peer, payload)

    # ------------------------------------------------------------------
    # Incoming message handlers
    # ------------------------------------------------------------------

    def _on_transaction(self, peer: Peer, payload: TransactionPayload) -> None:
        tx = payload.to_transaction()
        accepted = self.blockchain.add_transaction(tx)
        status = "accepted" if accepted else "rejected"
        print(f"[{self._tag()}] rx tx {tx.tx_hash()[:8]}… from {peer} → {status}")

    def _on_block(self, peer: Peer, payload: BlockPayload) -> None:
        block = payload.to_block()
        # Only append if it extends our chain and passes full validation
        expected_index = len(self.blockchain.chain)
        if block.header.index != expected_index:
            print(
                f"[{self._tag()}] rx block #{block.header.index} from {peer} "
                f"— index mismatch (expected {expected_index}), ignoring"
            )
            return

        # Temporarily append and validate the whole chain
        self.blockchain.chain.append(block)
        if self.blockchain.is_chain_valid():
            print(
                f"[{self._tag()}] rx block #{block.header.index} "
                f"hash={block.block_hash()[:12]}… from {peer} → appended"
            )
        else:
            # Roll back
            self.blockchain.chain.pop()
            print(
                f"[{self._tag()}] rx block #{block.header.index} from {peer} "
                f"— chain validation failed, discarded"
            )

    # ------------------------------------------------------------------
    # Util
    # ------------------------------------------------------------------

    def _tag(self) -> str:
        return self.my_peer.mid.hex()[:8]


# ---------------------------------------------------------------------------
# Node startup
# ---------------------------------------------------------------------------

def build_config(port: int) -> dict:
    builder = ConfigBuilder().clear_keys().clear_overlays()
    builder.set_port(port)
    builder.add_key("ticketchain-key", "medium", f"ec_{port}.pem")
    builder.add_overlay(
        "TicketChainCommunity",
        "ticketchain-key",
        [WalkerDefinition(Strategy.RandomWalk, 10, {"timeout": 3.0})],
        LOCAL_BOOTSTRAP,
        {},
        [],
    )
    return builder.finalize()


async def start_node(port: int = DEFAULT_PORT) -> IPv8:
    ipv8 = IPv8(
        build_config(port),
        extra_communities={"TicketChainCommunity": TicketChainCommunity},
    )
    await ipv8.start()
    print(f"IPv8 node listening on UDP port {port}")
    return ipv8


async def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    await start_node(port)
    await run_forever()


if __name__ == "__main__":
    run(main())
