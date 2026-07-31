"""Search puzzle sequence: per-message Proof-of-Work for Sybil resistance.

Before a node may broadcast a ticket availability message to the overlay,
it must solve a lightweight cryptographic search puzzle: find a nonce such
that SHA-256(message || nonce) has a required number of leading zero bits.

This is intentionally much cheaper than block-level PoW (default 8 bits
vs. 16 for blocks — roughly 256 hash attempts vs. 65k). The goal is not
consensus but spam/Sybil resistance: a legitimate node pays a negligible
cost per message, while an attacker flooding the network must pay it for
every single message, making large-scale spam computationally expensive.

Receivers verify the puzzle in O(1) (a single hash) before doing any
further processing, so invalid messages are dropped cheaply.
"""

from __future__ import annotations

import hashlib

# Default puzzle difficulty: leading zero bits required on the message hash.
# 8 bits ≈ 256 attempts on average — negligible for a single message,
# prohibitive at spam volumes.
PUZZLE_DIFFICULTY: int = 8


def _puzzle_hash(message: bytes, nonce: int) -> str:
    """SHA-256 over message || nonce (nonce as 8-byte big-endian)."""
    return hashlib.sha256(message + nonce.to_bytes(8, "big")).hexdigest()


def _meets_target(hash_hex: str, difficulty: int) -> bool:
    """True iff *hash_hex* has at least *difficulty* leading zero bits."""
    return int(hash_hex, 16) >> (256 - difficulty) == 0


def solve_puzzle(message: bytes, difficulty: int = PUZZLE_DIFFICULTY) -> int:
    """Find a nonce satisfying the search puzzle for *message*.

    Args:
        message:    The serialized message bytes to be broadcast.
        difficulty: Leading zero bits required (default 8).

    Returns:
        The smallest nonce n such that SHA-256(message || n) meets the target.
    """
    nonce = 0
    while not _meets_target(_puzzle_hash(message, nonce), difficulty):
        nonce += 1
    return nonce


def verify_puzzle(
    message: bytes, nonce: int, difficulty: int = PUZZLE_DIFFICULTY
) -> bool:
    """Verify a search puzzle solution in a single hash operation.

    Args:
        message:    The serialized message bytes as received.
        nonce:      The nonce claimed by the sender.
        difficulty: Leading zero bits required (must match sender's).

    Returns:
        True iff SHA-256(message || nonce) meets the difficulty target.
    """
    if nonce < 0:
        return False
    return _meets_target(_puzzle_hash(message, nonce), difficulty)
