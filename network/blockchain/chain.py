"""Blockchain: mempool, mining, chain validation.

The Blockchain class ties together Transaction, Block, MerkleTree, and PoW
into a coherent chain with a pending-transaction mempool.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from .block import Block, BlockHeader, genesis_block
from .merkle import merkle_root as compute_merkle_root
from .pow import mine, verify_pow, DIFFICULTY
from .transaction import Transaction


@dataclass
class Blockchain:
    """A local chain of mined Blocks with a pending-transaction mempool.

    Attributes:
        difficulty: Leading zero bits required for PoW (applied to all blocks).
        chain:      Ordered list of mined blocks, starting with genesis.
        mempool:    Pending transactions waiting to be included in the next block.
    """

    difficulty: int = DIFFICULTY
    chain: list[Block] = field(default_factory=list, init=False)
    mempool: list[Transaction] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        # Mine and append genesis block at initialization
        self.chain = [mine(genesis_block(self.difficulty))]

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    @property
    def latest_block(self) -> Block:
        return self.chain[-1]

    def get_block(self, index: int) -> Block | None:
        if 0 <= index < len(self.chain):
            return self.chain[index]
        return None

    # ------------------------------------------------------------------
    # Transaction management
    # ------------------------------------------------------------------

    def add_transaction(self, tx: Transaction) -> bool:
        """Validate and add *tx* to the mempool.

        Args:
            tx: A signed Transaction to be included in the next block.

        Returns:
            True if the transaction was added, False if it failed validation
            (bad signature or price > face_value).
        """
        if not tx.is_valid():
            return False
        self.mempool.append(tx)
        return True

    # ------------------------------------------------------------------
    # Mining
    # ------------------------------------------------------------------

    def mine_pending(self) -> Block:
        """Create a new block from all pending mempool transactions, mine it,
        append it to the chain, and clear the mempool.

        Returns:
            The newly mined and appended Block.
        """
        txs = list(self.mempool)
        root = compute_merkle_root([tx.tx_hash() for tx in txs])

        header = BlockHeader(
            index=len(self.chain),
            prev_hash=self.latest_block.block_hash(),
            merkle_root=root,
            timestamp=time.time(),
            difficulty=self.difficulty,
            nonce=0,
        )
        new_block = Block(header=header, transactions=txs)
        mine(new_block)

        self.chain.append(new_block)
        self.mempool.clear()
        return new_block

    # ------------------------------------------------------------------
    # Chain validation
    # ------------------------------------------------------------------

    def is_chain_valid(self) -> bool:
        """Validate the entire chain.

        Checks for each block (skipping genesis):
        1. PoW: block hash meets declared difficulty.
        2. Linkage: prev_hash matches previous block's actual hash.
        3. Merkle root: matches hashes of stored transactions.
        4. Transactions: all pass is_valid() (signature + price ceiling).

        The genesis block is checked for PoW only.

        Returns:
            True iff all checks pass on every block.
        """
        for i, block in enumerate(self.chain):
            # 1. PoW
            if not verify_pow(block):
                return False

            if i == 0:
                # Genesis: only PoW checked (no prev block, no txs)
                continue

            prev_block = self.chain[i - 1]

            # 2. Linkage
            if block.header.prev_hash != prev_block.block_hash():
                return False

            # 3. Merkle root
            expected_root = compute_merkle_root(
                [tx.tx_hash() for tx in block.transactions]
            )
            if block.header.merkle_root != expected_root:
                return False

            # 4. Transactions
            if not all(tx.is_valid() for tx in block.transactions):
                return False

        return True

    # ------------------------------------------------------------------
    # Serialization (for P2P broadcast)
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        return {
            "difficulty": self.difficulty,
            "chain": [b.to_dict() for b in self.chain],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Blockchain":
        bc = cls.__new__(cls)
        bc.difficulty = data["difficulty"]
        bc.chain = [Block.from_dict(b) for b in data["chain"]]
        bc.mempool = []
        return bc
