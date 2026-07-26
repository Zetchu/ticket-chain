"""Merkle tree over transaction hashes.

Builds a binary Merkle tree using SHA-256, with standard duplicate-last-node
handling for odd counts. Supports root computation and inclusion proofs.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Optional


def _sha256_pair(left: str, right: str) -> str:
    """Hash the concatenation of two hex digests and return a hex digest."""
    combined = bytes.fromhex(left) + bytes.fromhex(right)
    return hashlib.sha256(combined).hexdigest()


def merkle_root(tx_hashes: list[str]) -> str:
    """Compute the Merkle root of *tx_hashes*.

    Args:
        tx_hashes: List of hex-encoded SHA-256 transaction hashes.

    Returns:
        Hex-encoded root hash, or an empty string for an empty list.
    """
    if not tx_hashes:
        return ""
    tree = MerkleTree(tx_hashes)
    return tree.root


@dataclass
class MerkleTree:
    """Binary Merkle tree.

    Attributes:
        layers: All levels of the tree from leaves (index 0) to root (last).
                Each layer is a list of hex hash strings.
    """

    tx_hashes: list[str]
    layers: list[list[str]] = field(default_factory=list, init=False, repr=False)

    def __post_init__(self) -> None:
        if not self.tx_hashes:
            self.layers = [[]]
            return
        self.layers = [list(self.tx_hashes)]
        self._build()

    def _build(self) -> None:
        current = self.layers[0]
        while len(current) > 1:
            next_layer: list[str] = []
            # Duplicate last node if odd count
            if len(current) % 2 == 1:
                current = current + [current[-1]]
            for i in range(0, len(current), 2):
                next_layer.append(_sha256_pair(current[i], current[i + 1]))
            self.layers.append(next_layer)
            current = next_layer

    @property
    def root(self) -> str:
        """The Merkle root hash (top of the tree)."""
        if not self.layers or not self.layers[-1]:
            return ""
        return self.layers[-1][0]

    def get_proof(self, index: int) -> list[dict]:
        """Return the inclusion proof for the leaf at *index*.

        Each element is ``{"hash": <hex>, "side": "left"|"right"}``,
        describing which sibling to hash with at each level.

        Args:
            index: Zero-based index into the original tx_hashes list.

        Returns:
            List of sibling descriptors from leaf level up to (not including)
            the root, or an empty list if the tree is empty.
        """
        if not self.layers or index < 0 or index >= len(self.tx_hashes):
            return []

        proof: list[dict] = []
        current_index = index

        for layer in self.layers[:-1]:  # stop before the root layer
            # Duplicate last node if odd count in this layer
            padded = layer if len(layer) % 2 == 0 else layer + [layer[-1]]
            # Determine sibling
            if current_index % 2 == 0:
                sibling_index = current_index + 1
                side = "right"
            else:
                sibling_index = current_index - 1
                side = "left"
            proof.append({"hash": padded[sibling_index], "side": side})
            current_index //= 2

        return proof

    @staticmethod
    def verify_proof(tx_hash: str, proof: list[dict], root: str) -> bool:
        """Verify an inclusion proof.

        Args:
            tx_hash: Hex hash of the transaction to verify.
            proof:   Output of :meth:`get_proof`.
            root:    Expected Merkle root.

        Returns:
            True iff the proof correctly reconstructs *root* from *tx_hash*.
        """
        current = tx_hash
        for step in proof:
            if step["side"] == "right":
                current = _sha256_pair(current, step["hash"])
            else:
                current = _sha256_pair(step["hash"], current)
        return current == root
