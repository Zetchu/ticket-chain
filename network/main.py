"""TicketChain P2P network layer — IPv8 boilerplate.

Initializes a single IPv8 instance running the TicketChain community on a
local development overlay. Peer discovery uses UDP broadcast bootstrapping,
so nodes only find peers on the local network (no public IPv8 trackers).

Usage:
    python main.py [port]
"""

import sys
from asyncio import run

from ipv8.community import Community, CommunitySettings
from ipv8.configuration import (
    Bootstrapper,
    BootstrapperDefinition,
    ConfigBuilder,
    Strategy,
    WalkerDefinition,
)
from ipv8.peerdiscovery.network import PeerObserver
from ipv8.types import Peer
from ipv8.util import run_forever
from ipv8_service import IPv8

DEFAULT_PORT = 8090

# Bootstrap via UDP broadcast only: peers are discovered on the local
# network, keeping the development overlay isolated from public trackers.
LOCAL_BOOTSTRAP = [BootstrapperDefinition(Bootstrapper.UDPBroadcastBootstrapper, {})]


class TicketChainCommunity(Community, PeerObserver):
    """Overlay for propagating ticket availability between local peers."""

    community_id = b"ticketchain-cs414-w1"  # 20-byte overlay identifier

    def __init__(self, settings: CommunitySettings) -> None:
        super().__init__(settings)
        self.network.add_peer_observer(self)

    def on_peer_added(self, peer: Peer) -> None:
        print(f"[{self.my_peer.mid.hex()[:8]}] discovered peer: {peer}")

    def on_peer_removed(self, peer: Peer) -> None:
        print(f"[{self.my_peer.mid.hex()[:8]}] lost peer: {peer}")


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
