"""TicketChain P2P network layer — IPv8 + hand-built blockchain core.

Each node maintains a local Blockchain instance. When a transaction is
submitted or a block is mined, it is broadcast to all known peers using
IPv8 lazy-payload messages. Receiving peers validate before accepting.

Week 2 additions:
  - Search puzzle sequence: every broadcast message carries a per-message
    PoW nonce (Sybil/spam resistance). Receivers verify before processing.
  - Localized Peer Community Broadcasting: the overlay community_id is
    derived from an event name, partitioning the network so only nodes
    interested in the same event discover and message each other.
  - HTTP API on http://127.0.0.1:8080 (FastAPI/uvicorn) exposing
    GET /tickets for the React frontend.

Ethereum bridge:
  - bridge.py watches the TicketNFT contract on the local Hardhat node and
    republishes every ticket event into this node's chain, so GET /tickets
    reflects on-chain purchases, listings, and cancellations live.

Usage:
    python main.py [port] [--event EVENT_NAME]
"""

import argparse
import asyncio
import hashlib
import json
import sys
import time
from asyncio import run

# The status logs below use non-ASCII arrows/ellipses (→, …). On Windows the
# console's default codepage (cp1252) can't encode them, which crashes the
# print() mid-message — inside an ipv8 packet handler, that surfaces as a
# swallowed "Exception occurred while handling packet!" per received message
# rather than a visible log line. Force UTF-8 so logging never depends on the
# host console's codepage. No-op on platforms already running UTF-8 consoles.
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import uvicorn
from ipv8.community import Community, CommunitySettings
from ipv8.lazy_community import lazy_wrapper
from ipv8.configuration import (
    Bootstrapper,
    BootstrapperDefinition,
    ConfigBuilder,
    Strategy,
    WalkerDefinition,
)
from ipv8.bootstrapping.udpbroadcast.bootstrapper import UDPBroadcastBootstrapper
from ipv8.messaging.lazy_payload import VariablePayload, vp_compile
from ipv8.peerdiscovery.network import PeerObserver
from ipv8.peer import Peer
from ipv8.util import run_forever
from ipv8_service import IPv8

from api import API_HOST, API_PORT, create_app
from blockchain import (
    Block,
    Blockchain,
    Transaction,
    solve_puzzle,
    verify_puzzle,
)
from bridge import ContractEventBridge

DEFAULT_PORT = 8090
DEFAULT_EVENT = "default-event"

# How often a node re-requests chains from every peer it currently knows
# about, as a backstop alongside the event-driven triggers (on discovery,
# on a block arriving ahead of our index). See _periodic_chain_sync.
CHAIN_SYNC_INTERVAL = 15.0

# Bootstrap via UDP broadcast only: peers are discovered on the local
# network, keeping the development overlay isolated from public trackers.
LOCAL_BOOTSTRAP = [BootstrapperDefinition(Bootstrapper.UDPBroadcastBootstrapper, {})]


# ---------------------------------------------------------------------------
# Keep the UDP broadcast beacon off the event loop
# ---------------------------------------------------------------------------
# UDPBroadcastBootstrapper.beacon() announces this node by sending to all
# 65,535 ports of the broadcast address in a blocking sendto() loop. On macOS
# each broadcast sendto costs ~14ms, so a single sweep pins the asyncio event
# loop for ~15 minutes: peer walks stall and the HTTP API never answers a
# request. The sweep is fire-and-forget, so run it on a worker thread instead.
# One sweep at a time — the bootstrapper re-beacons every 30s, which would
# otherwise queue sweeps faster than they can finish.

_blocking_beacon = UDPBroadcastBootstrapper.beacon


def _threaded_beacon(self: UDPBroadcastBootstrapper, service_prefix: bytes) -> None:
    if getattr(self, "_beacon_in_flight", False):
        return
    self._beacon_in_flight = True

    def run() -> None:
        try:
            _blocking_beacon(self, service_prefix)
        finally:
            self._beacon_in_flight = False

    asyncio.get_running_loop().run_in_executor(None, run)


UDPBroadcastBootstrapper.beacon = _threaded_beacon


def event_community_id(event_name: str) -> bytes:
    """Derive a 20-byte overlay community_id from an event name.

    Localized Peer Community Broadcasting: nodes running with the same
    --event value share an overlay and exchange messages; nodes with a
    different event name are on a disjoint overlay and never see them.
    This partitions broadcast traffic by event locality.
    """
    return hashlib.sha1(f"ticketchain-{event_name}".encode()).digest()


# ---------------------------------------------------------------------------
# IPv8 message payloads (JSON-encoded blobs)
# ---------------------------------------------------------------------------

@vp_compile
class TransactionPayload(VariablePayload):
    """Carries a serialized Transaction plus its search puzzle nonce.

    The sender must solve the search puzzle over the serialized data
    before broadcasting; receivers verify it in O(1) before any further
    processing (Sybil/spam resistance).
    """
    msg_id = 1
    # 'varlenH': bytes prefixed with a 2-byte length (up to 65535 bytes) —
    # ample for one serialized Transaction. 'Q': u64 puzzle nonce.
    format_list = ["varlenH", "Q"]
    names = ["data", "puzzle_nonce"]

    # Convenience constructors
    @classmethod
    def from_transaction(cls, tx: Transaction) -> "TransactionPayload":
        data = json.dumps(tx.to_dict()).encode()
        nonce = solve_puzzle(data)
        return cls(data, nonce)

    def to_transaction(self) -> Transaction:
        return Transaction.from_dict(json.loads(self.data))

    def puzzle_ok(self) -> bool:
        return verify_puzzle(self.data, self.puzzle_nonce)


@vp_compile
class BlockPayload(VariablePayload):
    """Carries a serialized Block plus its search puzzle nonce."""
    msg_id = 2
    # 'varlenI': bytes prefixed with a 4-byte length (up to ~4GB) — a block
    # can hold many transactions, so it gets more headroom than a single tx.
    format_list = ["varlenI", "Q"]
    names = ["data", "puzzle_nonce"]

    @classmethod
    def from_block(cls, block: Block) -> "BlockPayload":
        data = json.dumps(block.to_dict()).encode()
        nonce = solve_puzzle(data)
        return cls(data, nonce)

    def to_block(self) -> Block:
        return Block.from_dict(json.loads(self.data))

    def puzzle_ok(self) -> bool:
        return verify_puzzle(self.data, self.puzzle_nonce)


@vp_compile
class ChainRequestPayload(VariablePayload):
    """Ask a peer to send back their full chain (see ChainResponsePayload).

    Sent on peer discovery (so a late joiner catches up) and whenever a
    received block is ahead of our own chain (so a missed broadcast doesn't
    strand us permanently behind). Carries a timestamp purely so every
    request's search puzzle is solved fresh — with no per-instance data,
    the puzzle solution for "please send your chain" would be a constant
    any node could compute once and replay forever, defeating the
    per-message cost the puzzle is meant to impose.
    """
    msg_id = 3
    format_list = ["varlenH", "Q"]
    names = ["data", "puzzle_nonce"]

    @classmethod
    def create(cls) -> "ChainRequestPayload":
        data = json.dumps({"requested_at": time.time()}).encode()
        nonce = solve_puzzle(data)
        return cls(data, nonce)

    def puzzle_ok(self) -> bool:
        return verify_puzzle(self.data, self.puzzle_nonce)


@vp_compile
class ChainResponsePayload(VariablePayload):
    """Carries a peer's full chain (Blockchain.to_dict()) plus its search
    puzzle nonce, sent in reply to a ChainRequestPayload."""
    msg_id = 4
    # 'varlenI': a whole chain can run well past the 65KB a single block's
    # 'varlenH' allows for, so this gets the wider 4-byte length prefix.
    format_list = ["varlenI", "Q"]
    names = ["data", "puzzle_nonce"]

    @classmethod
    def from_chain(cls, blockchain: Blockchain) -> "ChainResponsePayload":
        data = json.dumps(blockchain.to_dict()).encode()
        nonce = solve_puzzle(data)
        return cls(data, nonce)

    def to_chain(self) -> Blockchain:
        return Blockchain.from_dict(json.loads(self.data))

    def puzzle_ok(self) -> bool:
        return verify_puzzle(self.data, self.puzzle_nonce)


# ---------------------------------------------------------------------------
# Community
# ---------------------------------------------------------------------------

class TicketChainCommunity(Community, PeerObserver):
    """Overlay for propagating ticket transactions and blocks between local peers.

    Localized Peer Community Broadcasting: the community_id below is a
    default; start_node() overrides it per-event via event_community_id(),
    so overlays are partitioned by event name.
    """

    community_id = event_community_id(DEFAULT_EVENT)  # 20-byte overlay identifier

    def __init__(self, settings: CommunitySettings) -> None:
        super().__init__(settings)
        self.network.add_peer_observer(self)

        # Each node owns its own Blockchain instance.
        # Difficulty 16 = ~sub-second mining on modern hardware.
        self.blockchain = Blockchain(difficulty=16)

        # Register message handlers
        self.add_message_handler(TransactionPayload, self._on_transaction)
        self.add_message_handler(BlockPayload, self._on_block)
        self.add_message_handler(ChainRequestPayload, self._on_chain_request)
        self.add_message_handler(ChainResponsePayload, self._on_chain_response)

        # Backstop for chain sync — see _periodic_chain_sync.
        self.register_task(
            "periodic_chain_sync", self._periodic_chain_sync, interval=CHAIN_SYNC_INTERVAL
        )

    # ------------------------------------------------------------------
    # Peer lifecycle
    # ------------------------------------------------------------------

    def on_peer_added(self, peer: Peer) -> None:
        print(f"[{self._tag()}] discovered peer: {peer}")
        # Catch up a late joiner (or recover from a chain we quietly missed
        # blocks on): ask whoever we just met for their chain. Asking every
        # newly-met peer, rather than picking one at random out of all known
        # peers, keeps this a one-liner without a peer list to sample from —
        # for the small local meshes this network runs on the two amount to
        # the same thing, and _maybe_adopt_chain() below only actually
        # replaces anything if the reply is both longer and valid, so extra
        # requests are wasted bandwidth at worst, not a correctness risk.
        self.ez_send(peer, ChainRequestPayload.create())

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

    @lazy_wrapper(TransactionPayload)
    def _on_transaction(self, peer: Peer, payload: TransactionPayload) -> None:
        # Search puzzle check first: drop spam cheaply before any parsing
        # or signature verification.
        if not payload.puzzle_ok():
            print(f"[{self._tag()}] rx tx from {peer} → dropped (invalid search puzzle)")
            return

        tx = payload.to_transaction()
        accepted = self.blockchain.add_transaction(tx)
        status = "accepted" if accepted else "rejected"
        print(f"[{self._tag()}] rx tx {tx.tx_hash()[:8]}… from {peer} → {status}")

    @lazy_wrapper(BlockPayload)
    def _on_block(self, peer: Peer, payload: BlockPayload) -> None:
        if not payload.puzzle_ok():
            print(f"[{self._tag()}] rx block from {peer} → dropped (invalid search puzzle)")
            return

        block = payload.to_block()
        # Only append if it extends our chain and passes full validation
        expected_index = len(self.blockchain.chain)
        if block.header.index != expected_index:
            if block.header.index > expected_index:
                # We're behind — the sender's chain has blocks we've never
                # seen (a dropped broadcast, or we just joined). There's no
                # way to splice in a single block without the ones between,
                # so ask for the whole chain instead of discarding this one.
                print(
                    f"[{self._tag()}] rx block #{block.header.index} from {peer} "
                    f"— behind (expected {expected_index}), requesting their chain"
                )
                self.ez_send(peer, ChainRequestPayload.create())
            else:
                # We're ahead — the sender is behind us, nothing to do here;
                # they'll catch up next time they discover a peer or receive
                # a block themselves.
                print(
                    f"[{self._tag()}] rx block #{block.header.index} from {peer} "
                    f"— stale (expected {expected_index}), ignoring"
                )
            return

        # Temporarily append and validate the whole chain
        self.blockchain.chain.append(block)
        if self.blockchain.is_chain_valid():
            # Drop the block's transactions from our mempool: they were also
            # broadcast individually, and keeping them would show every ticket
            # twice in the feed (Confirmed from the block + Pending forever).
            included = {tx.tx_hash() for tx in block.transactions}
            self.blockchain.mempool = [
                tx for tx in self.blockchain.mempool if tx.tx_hash() not in included
            ]
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
    # Chain sync (longest-valid-chain rule)
    # ------------------------------------------------------------------

    async def _periodic_chain_sync(self) -> None:
        """Ask every currently known peer for their chain, on a timer.

        on_peer_added and the "block ahead of us" branch of _on_block both
        already trigger a chain request — but both are event-driven, and we
        observed a real case where the event never fires at all: a peer
        that reconnects with an identity IPv8 has already seen once (e.g.
        the same node restarting) isn't necessarily treated as newly
        discovered, so on_peer_added never runs for it again, and if that
        peer never happens to broadcast us a block directly either, nothing
        ever prompts a resync — even though our own outbound requests to it
        keep silently going unanswered. The issue this all exists for is
        exactly "a node that misses one message can never catch up"; a
        peer whose *discovery* event is the one that got missed is still
        such a node. This timer is the backstop: sync eventually happens
        for every peer regardless of why the event-driven path didn't fire.
        """
        for peer in self.get_peers():
            self.ez_send(peer, ChainRequestPayload.create())

    @lazy_wrapper(ChainRequestPayload)
    def _on_chain_request(self, peer: Peer, payload: ChainRequestPayload) -> None:
        if not payload.puzzle_ok():
            print(f"[{self._tag()}] rx chain request from {peer} → dropped (invalid search puzzle)")
            return
        print(
            f"[{self._tag()}] rx chain request from {peer} → replying "
            f"(len {len(self.blockchain.chain)})"
        )
        self.ez_send(peer, ChainResponsePayload.from_chain(self.blockchain))

    @lazy_wrapper(ChainResponsePayload)
    def _on_chain_response(self, peer: Peer, payload: ChainResponsePayload) -> None:
        if not payload.puzzle_ok():
            print(f"[{self._tag()}] rx chain response from {peer} → dropped (invalid search puzzle)")
            return

        try:
            candidate = payload.to_chain()
        except (KeyError, ValueError, TypeError):
            print(f"[{self._tag()}] rx chain response from {peer} → malformed, discarded")
            return

        if self._maybe_adopt_chain(candidate):
            print(
                f"[{self._tag()}] rx chain response from {peer} → adopted "
                f"(len {len(candidate.chain)}, tip {candidate.latest_block.block_hash()[:12]}…)"
            )
        else:
            print(
                f"[{self._tag()}] rx chain response from {peer} → kept our own "
                f"(theirs: len {len(candidate.chain)})"
            )

    def _maybe_adopt_chain(self, candidate: Blockchain) -> bool:
        """Replace our chain with *candidate* per the longest-valid-chain
        rule (Blockchain.should_replace_with). Returns True iff adopted.
        """
        if not self.blockchain.should_replace_with(candidate):
            return False

        # Mutate the existing Blockchain object in place — api.py's
        # create_app(community.blockchain) captured this exact object at
        # startup, so reassigning self.blockchain to a new instance would
        # leave the HTTP API reading a stale chain forever.
        included = {
            tx.tx_hash() for block in candidate.chain for tx in block.transactions
        }
        self.blockchain.chain = candidate.chain
        self.blockchain.mempool = [
            tx for tx in self.blockchain.mempool if tx.tx_hash() not in included
        ]
        return True

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


async def start_api_server(community: TicketChainCommunity, api_port: int = API_PORT) -> asyncio.Task:
    """Start the FastAPI/uvicorn HTTP server as a background asyncio task.

    Serves GET /tickets on http://127.0.0.1:<api_port> for the React
    frontend, reading live from the community's Blockchain instance.

    Takes *api_port* as an explicit parameter rather than always reading the
    module-level API_PORT: a second node on the same machine (see
    test_two_nodes.py, start_demo.sh) needs its own port, and a bind failure
    here is not a survivable error — uvicorn calls sys.exit() on one, and
    SystemExit raised inside *any* asyncio task, even a fire-and-forget one
    like this server task, propagates through the event loop and kills the
    whole process.
    """
    app = create_app(community.blockchain)
    config = uvicorn.Config(app, host=API_HOST, port=api_port, log_level="warning")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    print(f"HTTP API listening on http://{API_HOST}:{api_port} (GET /tickets)")
    return task


def start_bridge(community: TicketChainCommunity) -> asyncio.Task:
    """Start the Ethereum→P2P event bridge as a background asyncio task.

    The task reference is kept on the community so it is not garbage
    collected; bridge.run() retries internally when the Hardhat node is
    not up yet, so this never crashes the P2P node.
    """
    task = asyncio.create_task(ContractEventBridge(community).run())
    community.bridge_task = task
    return task


async def start_node(
    port: int = DEFAULT_PORT, event: str = DEFAULT_EVENT, api_port: int = API_PORT
) -> IPv8:
    # Localized Peer Community Broadcasting: partition the overlay by event.
    TicketChainCommunity.community_id = event_community_id(event)

    ipv8 = IPv8(
        build_config(port),
        extra_communities={"TicketChainCommunity": TicketChainCommunity},
    )
    await ipv8.start()
    print(f"IPv8 node listening on UDP port {port} (event overlay: {event!r})")

    # Find our community instance and attach the HTTP API to it.
    community = next(
        o for o in ipv8.overlays if isinstance(o, TicketChainCommunity)
    )
    await start_api_server(community, api_port)
    start_bridge(community)
    return ipv8


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TicketChain P2P node")
    parser.add_argument(
        "port", nargs="?", type=int, default=DEFAULT_PORT,
        help=f"UDP port for IPv8 (default {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--event", default=DEFAULT_EVENT,
        help="Event name for the localized community overlay "
             f"(default {DEFAULT_EVENT!r}). Nodes only exchange messages "
             "with peers using the same event name.",
    )
    parser.add_argument(
        "--api-port", type=int, default=API_PORT,
        help=f"Port for the GET /tickets HTTP API (default {API_PORT}). "
             "Running a second node on the same machine (see start_demo.sh) "
             "needs a different value here, or its API server fails to bind "
             "the first node's port.",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    ipv8 = await start_node(args.port, args.event, args.api_port)
    try:
        await run_forever()
    finally:
        # run_forever() returns on SIGINT/SIGTERM but never tore anything
        # down itself; without this, Ctrl+C (or a plain `kill`) leaves the
        # UDP transport closed abruptly by the OS instead of by IPv8 — which
        # otherwise leaves this node looking, to any peer that still has it
        # in its table, like it's still there but has gone silent, rather
        # than like it cleanly left.
        await ipv8.stop()


if __name__ == "__main__":
    run(main())
