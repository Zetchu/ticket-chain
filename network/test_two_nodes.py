"""Spin up two IPv8 instances on different ports and verify they discover
each other over the local development overlay.

Usage:
    python test_two_nodes.py

Exits 0 when both nodes see each other within the timeout, 1 otherwise.
"""

import sys
from asyncio import run, sleep

from main import start_node

PORT_A = 8090
PORT_B = 8091
TIMEOUT_SECONDS = 30


def peers_of(ipv8):
    return ipv8.overlays[0].get_peers()


async def main() -> int:
    node_a = await start_node(PORT_A)
    node_b = await start_node(PORT_B)

    try:
        waited = 0.0
        while waited < TIMEOUT_SECONDS:
            if peers_of(node_a) and peers_of(node_b):
                print(f"SUCCESS: nodes discovered each other after ~{waited:.1f}s")
                print(f"  node A ({PORT_A}) sees: {peers_of(node_a)}")
                print(f"  node B ({PORT_B}) sees: {peers_of(node_b)}")
                return 0
            await sleep(0.5)
            waited += 0.5

        print(f"FAILURE: no mutual discovery within {TIMEOUT_SECONDS}s")
        return 1
    finally:
        await node_a.stop()
        await node_b.stop()


if __name__ == "__main__":
    sys.exit(run(main()))
