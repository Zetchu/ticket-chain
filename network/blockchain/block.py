"""Block structure: header, hashing, and genesis block construction.

A Block contains:
  - A BlockHeader with metadata (index, prev_hash, merkle_root, timestamp,
    difficulty, nonce).
  - A list of Transaction objects whose hashes form the Merkle tree.

The block hash is SHA-256 over the serialized header only. Transactions are
authenticated indirectly via the Merkle root stored in the header.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field

from .transaction import Transaction
from .merkle import merkle_root as compute_merkle_root


# ---------------------------------------------------------------------------
# Block header
# ---------------------------------------------------------------------------

@dataclass
class BlockHeader:
    """Immutable metadata that is hashed to produce the block hash.

    Attributes:
        index:       Height of the block in the chain (0 = genesis).
        prev_hash:   Hex hash of the previous block's header (64 '0's for genesis).
        merkle_root: Merkle root of all transaction hashes in this block.
        timestamp:   Unix timestamp (float seconds) at block creation.
        difficulty:  Number of leading zero *bits* required by PoW.
        nonce:       Mutable counter incremented during mining.
    """

    index: int
    prev_hash: str
    merkle_root: str
    timestamp: float
    difficulty: int
    nonce: int = 0

    def serialize(self) -> bytes:
        """Deterministic JSON bytes over all header fields (used for hashing)."""
        payload = {
            "index": self.index,
            "prev_hash": self.prev_hash,
            "merkle_root": self.merkle_root,
            "timestamp": self.timestamp,
            "difficulty": self.difficulty,
            "nonce": self.nonce,
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "prev_hash": self.prev_hash,
            "merkle_root": self.merkle_root,
            "timestamp": self.timestamp,
            "difficulty": self.difficulty,
            "nonce": self.nonce,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BlockHeader":
        return cls(
            index=data["index"],
            prev_hash=data["prev_hash"],
            merkle_root=data["merkle_root"],
            timestamp=data["timestamp"],
            difficulty=data["difficulty"],
            nonce=data["nonce"],
        )


# ---------------------------------------------------------------------------
# Block
# ---------------------------------------------------------------------------

@dataclass
class Block:
    """A single block in the TicketChain.

    Attributes:
        header:       The block's header (hashed for PoW).
        transactions: Ordered list of transactions included in this block.
    """

    header: BlockHeader
    transactions: list[Transaction] = field(default_factory=list)

    # ------------------------------------------------------------------
    # Hashing
    # ------------------------------------------------------------------

    def block_hash(self) -> str:
        """SHA-256 of the serialized header, returned as a hex string."""
        return hashlib.sha256(self.header.serialize()).hexdigest()

    # ------------------------------------------------------------------
    # Structural validation
    # ------------------------------------------------------------------

    def is_valid_structure(self) -> bool:
        """Return True iff:
        - The Merkle root in the header matches the block's transactions.
        - All transactions pass their own is_valid() check.
        """
        expected_root = compute_merkle_root([tx.tx_hash() for tx in self.transactions])
        if self.header.merkle_root != expected_root:
            return False
        return all(tx.is_valid() for tx in self.transactions)

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        return {
            "header": self.header.to_dict(),
            "transactions": [tx.to_dict() for tx in self.transactions],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Block":
        return cls(
            header=BlockHeader.from_dict(data["header"]),
            transactions=[Transaction.from_dict(t) for t in data["transactions"]],
        )


# ---------------------------------------------------------------------------
# Genesis block
# ---------------------------------------------------------------------------

def genesis_block(difficulty: int = 16) -> Block:
    """Create and return the unmined genesis block (index 0).

    The genesis block has no transactions and a zeroed prev_hash.
    It is returned *unmined* — caller must pass it through pow.mine()
    before appending to a chain, or use Blockchain() which handles this.
    """
    header = BlockHeader(
        index=0,
        prev_hash="0" * 64,
        merkle_root="",  # no transactions
        timestamp=time.time(),
        difficulty=difficulty,
        nonce=0,
    )
    return Block(header=header, transactions=[])
