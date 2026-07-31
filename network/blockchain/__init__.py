"""TicketChain blockchain core package.

Provides hand-built transaction signing, Merkle tree, block structure,
Proof-of-Work mining, and chain validation — independent of Ethereum.
"""

from .transaction import Transaction, generate_keypair
from .merkle import MerkleTree, merkle_root
from .block import Block, BlockHeader, genesis_block
from .pow import mine, verify_pow, meets_difficulty, DIFFICULTY
from .chain import Blockchain
from .puzzle import solve_puzzle, verify_puzzle, PUZZLE_DIFFICULTY

__all__ = [
    "Transaction",
    "generate_keypair",
    "MerkleTree",
    "merkle_root",
    "Block",
    "BlockHeader",
    "genesis_block",
    "mine",
    "verify_pow",
    "meets_difficulty",
    "DIFFICULTY",
    "Blockchain",
    "solve_puzzle",
    "verify_puzzle",
    "PUZZLE_DIFFICULTY",
]
