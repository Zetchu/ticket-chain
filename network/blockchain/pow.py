"""Proof-of-Work: mining and verification.

Uses a leading-zero-bits difficulty target over the block's SHA-256 hash.
The miner increments the header nonce until the hash satisfies the target.

Difficulty of 16 means the hash integer must have 16 leading zero bits,
i.e. the first 4 hex characters must all be '0'. This is fast enough for
demos (sub-second on modern hardware) while being visually verifiable.
"""

from __future__ import annotations

from .block import Block

# Default difficulty: number of leading zero *bits* required.
DIFFICULTY: int = 16


def meets_difficulty(hash_hex: str, difficulty: int) -> bool:
    """Return True iff *hash_hex* has at least *difficulty* leading zero bits.

    Args:
        hash_hex:   64-character hex string (SHA-256 output).
        difficulty: Number of leading zero bits required.

    Example:
        difficulty=16 → first 4 hex chars must be '0000'
        difficulty=20 → first 5 hex chars '00000' and top nibble of 6th = 0
    """
    hash_int = int(hash_hex, 16)
    # A 256-bit hash has 'difficulty' leading zeros when shifted right by
    # (256 - difficulty) bits the result is 0.
    return hash_int >> (256 - difficulty) == 0


def mine(block: Block) -> Block:
    """Mine *block* by incrementing its nonce until PoW is satisfied.

    Mutates ``block.header.nonce`` in-place and returns the same block for
    convenience (allows chaining: ``mined = mine(my_block)``).

    Args:
        block: A fully constructed block (header + transactions). The nonce
               is reset to 0 before mining begins.

    Returns:
        The same block object with an updated nonce satisfying PoW.
    """
    block.header.nonce = 0
    while not meets_difficulty(block.block_hash(), block.header.difficulty):
        block.header.nonce += 1
    return block


def verify_pow(block: Block) -> bool:
    """Return True iff *block*'s hash meets its declared difficulty."""
    return meets_difficulty(block.block_hash(), block.header.difficulty)
