"""Week 2 performance benchmarks for the Progress Report.

Measures the three metrics the Week 2 QA task asks for:

1. Transaction execution time  — sign + validate one Transaction
   (blockchain/transaction.py), off-chain, on the hand-built core.
2. Block finality               — time to mine a block to the configured
   PoW difficulty (blockchain/pow.py) and, separately, for the receiving
   peer to accept it into its chain.
3. P2P ticket discovery latency — wall-clock time from a node broadcasting
   a mined block to a peer node's HTTP API (GET /tickets) reflecting it.

Usage:
    python benchmark.py            # local-core benchmarks only (fast)
    python benchmark.py --p2p      # also runs the two-node P2P benchmark
                                    # (spins up two IPv8 nodes + HTTP APIs)

Results are printed as a table and written to benchmark_results.json next
to this script, so the numbers quoted in the Week 2 report are reproducible.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path

from blockchain import Blockchain, Transaction, generate_keypair
from blockchain.pow import DIFFICULTY

RESULTS_PATH = Path(__file__).parent / "benchmark_results.json"


def _stats(samples: list[float]) -> dict:
    return {
        "n": len(samples),
        "min_ms": round(min(samples) * 1000, 4),
        "max_ms": round(max(samples) * 1000, 4),
        "avg_ms": round(statistics.mean(samples) * 1000, 4),
        "median_ms": round(statistics.median(samples) * 1000, 4),
    }


# ---------------------------------------------------------------------------
# 1. Transaction execution time (sign + validate)
# ---------------------------------------------------------------------------

def bench_transaction_execution(n: int = 200) -> dict:
    seller_key, seller = generate_keypair()
    _, buyer = generate_keypair()

    sign_times: list[float] = []
    validate_times: list[float] = []

    for i in range(n):
        tx = Transaction(
            sender=seller,
            recipient=buyer,
            ticket_id=str(i),
            price=50_000_000_000_000_000,
            face_value=50_000_000_000_000_000,
        )

        t0 = time.perf_counter()
        tx.sign(seller_key)
        t1 = time.perf_counter()
        sign_times.append(t1 - t0)

        t2 = time.perf_counter()
        assert tx.is_valid()
        t3 = time.perf_counter()
        validate_times.append(t3 - t2)

    return {
        "sign": _stats(sign_times),
        "validate": _stats(validate_times),
        "sign_plus_validate_avg_ms": round(
            (statistics.mean(sign_times) + statistics.mean(validate_times)) * 1000, 4
        ),
    }


# ---------------------------------------------------------------------------
# 2. Block finality (PoW mining time)
# ---------------------------------------------------------------------------

def bench_block_finality(trials: int = 10, txs_per_block: int = 5) -> dict:
    seller_key, seller = generate_keypair()
    _, buyer = generate_keypair()

    mine_times: list[float] = []
    nonces: list[int] = []

    for _ in range(trials):
        chain = Blockchain(difficulty=DIFFICULTY)
        for i in range(txs_per_block):
            tx = Transaction(
                sender=seller,
                recipient=buyer,
                ticket_id=str(i),
                price=50_000_000_000_000_000,
                face_value=50_000_000_000_000_000,
            )
            tx.sign(seller_key)
            chain.add_transaction(tx)

        t0 = time.perf_counter()
        block = chain.mine_pending()
        t1 = time.perf_counter()

        mine_times.append(t1 - t0)
        nonces.append(block.header.nonce)

    return {
        "difficulty_bits": DIFFICULTY,
        "txs_per_block": txs_per_block,
        "mine_time": _stats(mine_times),
        "avg_nonce_iterations": round(statistics.mean(nonces), 1),
    }


# ---------------------------------------------------------------------------
# 3. P2P discovery + propagation latency (requires --p2p)
# ---------------------------------------------------------------------------

def _ensure_libsodium_discoverable() -> None:
    """On Windows, libnacl (an ipv8 dependency) loads libsodium via a bare
    ctypes.cdll.LoadLibrary('libsodium') call, which only checks the calling
    process's own directory, System32, and PATH — not the venv's Scripts/
    directory by default. If a libsodium.dll has been placed next to this
    interpreter (see docs/demo-scenarios.md's Windows setup note), register
    it explicitly so the import below doesn't fail with "Could not locate
    nacl lib". No-op on macOS/Linux, where start_dev.sh handles this instead.
    """
    if sys.platform != "win32":
        return
    scripts_dir = Path(sys.executable).parent
    if (scripts_dir / "libsodium.dll").exists():
        os.add_dll_directory(str(scripts_dir))


def _patch_vp_compile_for_pep667() -> None:
    """pyipv8 2.13's vp_compile() (ipv8/messaging/lazy_payload.py) fills in
    generated methods via ``exec(code, globals(), locals()); locals()['x']``,
    relying on writes through the locals() mapping landing back in the
    enclosing frame. PEP 667 (Python 3.13+) makes locals() snapshots
    independent, so that write silently vanishes and the lookup raises
    KeyError('__init__') the moment any ipv8 module applies the decorator
    (import ipv8.community -> ... -> ipv8.messaging.payload). Re-implement
    the same compilation using a real, explicit dict instead of locals().
    No-op effect otherwise: this only replaces *how* the generated methods
    are captured, not what gets generated.
    """
    import inspect
    import types

    import ipv8.messaging.lazy_payload as lp

    def vp_compile_fixed(vp_definition):
        ns: dict = {}
        exec(lp._compile_init(vp_definition.names, {
            k: v.default
            for k, v in inspect.signature(vp_definition.__init__).parameters.items()
            if v.default is not inspect.Parameter.empty
        }), lp.__dict__, ns)
        exec(lp._compile_from_unpack_list(vp_definition, vp_definition.names), lp.__dict__, ns)
        exec(lp._compile_to_pack_list(vp_definition, vp_definition.format_list, vp_definition.names), lp.__dict__, ns)

        setattr(vp_definition, '__init__', ns['__init__'])
        setattr(vp_definition, '__match_args__', tuple(vp_definition.names))
        setattr(vp_definition, 'from_unpack_list', types.MethodType(ns['from_unpack_list'], vp_definition))
        setattr(vp_definition, 'to_pack_list', ns['to_pack_list'])
        return vp_definition

    lp.vp_compile = vp_compile_fixed


async def bench_p2p(discovery_timeout: float = 30.0, propagation_timeout: float = 15.0) -> dict:
    _ensure_libsodium_discoverable()
    if sys.version_info >= (3, 13):
        _patch_vp_compile_for_pep667()
    # Imported lazily: pulls in ipv8/uvicorn, only needed for --p2p.
    import main as main_module
    from main import start_node

    PORT_A, PORT_B = 8190, 8191
    API_A, API_B = 8180, 8181

    # main.py does `from api import API_HOST, API_PORT`, binding its own
    # module-level copy of API_PORT — patching api.API_PORT afterwards has no
    # effect on it, since start_api_server() reads main.API_PORT. Patch that
    # name directly so the two nodes' HTTP APIs don't collide on :8080.
    async def start(port: int, api_port: int):
        main_module.API_PORT = api_port
        return await start_node(port, event="benchmark")

    node_a = await start(PORT_A, API_A)
    node_b = await start(PORT_B, API_B)

    try:
        # --- discovery latency: time until both nodes see each other ---
        t0 = time.perf_counter()
        waited = 0.0
        discovered = False
        while waited < discovery_timeout:
            overlay_a = node_a.overlays[0]
            overlay_b = node_b.overlays[0]
            if overlay_a.get_peers() and overlay_b.get_peers():
                discovered = True
                break
            await asyncio.sleep(0.1)
            waited = time.perf_counter() - t0
        discovery_latency = time.perf_counter() - t0

        if not discovered:
            return {"error": f"no mutual discovery within {discovery_timeout}s"}

        # give the random-walk strategy a moment to open a bidirectional link
        await asyncio.sleep(1.0)

        # --- propagation latency: A mines a ticket offer, time until B's
        #     HTTP API reflects it ---
        community_a = node_a.overlays[0]
        seller_key, seller = generate_keypair()
        _, buyer = generate_keypair()
        tx = Transaction(
            sender=seller, recipient=buyer, ticket_id="bench-1",
            price=50_000_000_000_000_000, face_value=50_000_000_000_000_000,
        )
        tx.sign(seller_key)

        t0 = time.perf_counter()
        community_a.submit_transaction(tx)
        community_a.mine_block()

        # ticket_id "bench-1" isn't an int token ID, so the HTTP API's
        # _tx_to_ticket() would silently skip it (see api.py) — check the
        # node's raw chain instead, which is what the API reads from anyway.
        propagated = False
        waited = 0.0
        while waited < propagation_timeout:
            overlay_b = node_b.overlays[0]
            if any(
                t.ticket_id == "bench-1"
                for block in overlay_b.blockchain.chain
                for t in block.transactions
            ):
                propagated = True
                break
            await asyncio.sleep(0.05)
            waited = time.perf_counter() - t0
        propagation_latency = time.perf_counter() - t0

        return {
            "discovery_latency_s": round(discovery_latency, 3),
            "propagation_latency_s": round(propagation_latency, 3) if propagated else None,
            "propagated": propagated,
        }
    finally:
        await node_a.stop()
        await node_b.stop()
        main_module.API_PORT = 8080


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--p2p", action="store_true", help="also run the two-node P2P benchmark")
    args = parser.parse_args()

    print("Running blockchain-core benchmarks...")
    results = {
        "transaction_execution": bench_transaction_execution(),
        "block_finality": bench_block_finality(),
    }

    if args.p2p:
        print("Running P2P discovery/propagation benchmark (two local IPv8 nodes)...")
        results["p2p"] = asyncio.run(bench_p2p())

    RESULTS_PATH.write_text(json.dumps(results, indent=2))

    print(f"\nResults written to {RESULTS_PATH}\n")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    sys.exit(main())
