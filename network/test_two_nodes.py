"""Spin up two IPv8 instances on different ports and verify:

  1. They discover each other over the local development overlay.
  2. A late joiner catches up: node A mines *before* node B even exists,
     then B is started and converges onto A's chain (same length and tip
     hash) via the P2P chain-sync protocol (ChainRequestPayload /
     ChainResponsePayload in main.py, triggered from on_peer_added) — not
     the ordinary single-block broadcast path, which by itself can't
     explain how a node that joined late gets the blocks it missed.
  3. A node that drops out and comes back catches up too: B is stopped,
     A mines again while B is gone, and a fresh B (same port) converges
     onto A's now-longer chain after restarting.

Usage:
    python test_two_nodes.py

Exits 0 when all checks pass within their timeouts, 1 otherwise.
"""

import sys
from asyncio import run, sleep

from blockchain import Transaction, generate_keypair
from main import start_node

PORT_A = 8090
PORT_B = 8091
# Not 8080/8081: a node's own default is 8080, which collides with whatever
# else on a dev machine already claims it (and does on at least one — this
# was tripping over a pre-existing local service during development).
API_PORT_A = 8180
API_PORT_B = 8181
# start_api_server()'s uvicorn task is fire-and-forget and ipv8.stop() does
# not know to cancel it, so node B's phase-2 restart (same UDP port, fresh
# IPv8/community instance) still leaves the old HTTP server holding
# API_PORT_B. Give the restart its own port rather than chasing that
# cleanup — a bind failure here kills the whole process (see
# start_api_server's docstring), so it's not something to risk a race on.
API_PORT_B_RESTARTED = 8182
DISCOVERY_TIMEOUT_SECONDS = 30
CONVERGENCE_TIMEOUT_SECONDS = 15


def peers_of(ipv8):
    return ipv8.overlays[0].get_peers()


def _mine_dummy_block(community) -> None:
    """Mine one block containing a single signed transaction, so the chain
    actually grows (an empty mempool would still mine — this just makes
    each block distinguishable in the logs)."""
    seller_key, seller = generate_keypair()
    _, buyer = generate_keypair()
    tx = Transaction(
        sender=seller, recipient=buyer, ticket_id="convergence-check",
        price=50_000_000_000_000_000, face_value=50_000_000_000_000_000,
    )
    tx.sign(seller_key)
    community.submit_transaction(tx)
    community.mine_block()


async def wait_for_discovery(node_a, node_b, label: str) -> bool:
    waited = 0.0
    while waited < DISCOVERY_TIMEOUT_SECONDS:
        if peers_of(node_a) and peers_of(node_b):
            print(f"SUCCESS: {label} — nodes discovered each other after ~{waited:.1f}s")
            return True
        await sleep(0.5)
        waited += 0.5

    print(f"FAILURE: {label} — no mutual discovery within {DISCOVERY_TIMEOUT_SECONDS}s")
    return False


async def wait_for_convergence(node_a, node_b, label: str) -> bool:
    """Wait for B's chain to exactly match A's (length and tip hash)."""
    community_a = node_a.overlays[0]
    community_b = node_b.overlays[0]

    a_len = len(community_a.blockchain.chain)
    a_tip = community_a.blockchain.latest_block.block_hash()

    waited = 0.0
    while waited < CONVERGENCE_TIMEOUT_SECONDS:
        b_chain = community_b.blockchain.chain
        if len(b_chain) == a_len and b_chain[-1].block_hash() == a_tip:
            print(f"SUCCESS: {label} — B converged onto A's chain after ~{waited:.1f}s "
                  f"(length {a_len}, tip {a_tip[:16]}…)")
            return True
        await sleep(0.25)
        waited += 0.25

    print(f"FAILURE: {label} — B did not converge within {CONVERGENCE_TIMEOUT_SECONDS}s")
    print(f"  A: length {a_len}, tip {a_tip[:16]}…")
    print(
        f"  B: length {len(community_b.blockchain.chain)}, "
        f"tip {community_b.blockchain.latest_block.block_hash()[:16]}…"
    )
    return False


async def main() -> int:
    node_a = await start_node(PORT_A, api_port=API_PORT_A)
    community_a = node_a.overlays[0]

    try:
        # --- Phase 1: late joiner ---------------------------------------
        # A mines twice *before* B exists, so B can only ever learn about
        # this history via chain sync — the ordinary single-block broadcast
        # can't explain it, since B was never there to receive it.
        _mine_dummy_block(community_a)
        _mine_dummy_block(community_a)

        node_b = await start_node(PORT_B, api_port=API_PORT_B)

        if not await wait_for_discovery(node_a, node_b, "phase 1 (late joiner)"):
            return 1
        if not await wait_for_convergence(node_a, node_b, "phase 1 (late joiner)"):
            return 1

        # --- Phase 2: drop out and rejoin --------------------------------
        # B goes away, A mines again while it's gone, then a fresh B (same
        # UDP port, so same on-disk identity key) comes back and must catch
        # up rather than staying stuck on the chain it left with.
        await node_b.stop()
        _mine_dummy_block(community_a)

        node_b = await start_node(PORT_B, api_port=API_PORT_B_RESTARTED)

        if not await wait_for_discovery(node_a, node_b, "phase 2 (rejoin after drop)"):
            return 1
        if not await wait_for_convergence(node_a, node_b, "phase 2 (rejoin after drop)"):
            return 1

        return 0
    finally:
        await node_a.stop()
        await node_b.stop()


if __name__ == "__main__":
    sys.exit(run(main()))
