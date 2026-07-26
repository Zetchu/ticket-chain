"""pytest suite for the TicketChain blockchain core.

Run from the network/ directory:
    pip install -r requirements.txt pytest
    pytest test_blockchain.py -v

Covers:
  - Transaction sign / verify / tamper rejection / price-ceiling validation
  - Merkle tree root correctness (even/odd counts) and inclusion proofs
  - Proof-of-Work mining and verification
  - Full-chain validation (happy path and tamper scenarios)
"""

import copy
import pytest

from blockchain import (
    Blockchain,
    Block,
    BlockHeader,
    MerkleTree,
    Transaction,
    generate_keypair,
    genesis_block,
    merkle_root,
    mine,
    meets_difficulty,
    verify_pow,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def keypair_alice():
    return generate_keypair()


@pytest.fixture
def keypair_bob():
    return generate_keypair()


@pytest.fixture
def signed_tx(keypair_alice, keypair_bob):
    """A valid signed transaction from Alice to Bob."""
    priv_alice, pub_alice = keypair_alice
    _, pub_bob = keypair_bob
    tx = Transaction(
        sender=pub_alice,
        recipient=pub_bob,
        ticket_id="TICKET-001",
        price=50,
        face_value=100,
    )
    tx.sign(priv_alice)
    return tx


@pytest.fixture
def blockchain():
    """A fresh Blockchain with difficulty=8 (instant mining for tests)."""
    return Blockchain(difficulty=8)


# ---------------------------------------------------------------------------
# Transaction tests
# ---------------------------------------------------------------------------

class TestTransaction:

    def test_sign_and_verify(self, signed_tx):
        """A signed transaction must verify correctly."""
        assert signed_tx.verify() is True

    def test_unsigned_fails_verify(self, keypair_alice, keypair_bob):
        """An unsigned transaction must fail verify()."""
        _, pub_alice = keypair_alice
        _, pub_bob = keypair_bob
        tx = Transaction(
            sender=pub_alice,
            recipient=pub_bob,
            ticket_id="TICKET-002",
            price=50,
            face_value=100,
        )
        assert tx.verify() is False

    def test_tampered_price_fails_verify(self, signed_tx):
        """Mutating the price after signing must invalidate the signature."""
        signed_tx.price = 9999
        assert signed_tx.verify() is False

    def test_tampered_recipient_fails_verify(self, signed_tx, keypair_bob):
        """Mutating the recipient after signing must invalidate the signature."""
        _, pub_other = generate_keypair()
        signed_tx.recipient = pub_other
        assert signed_tx.verify() is False

    def test_price_at_face_value_is_valid(self, keypair_alice, keypair_bob):
        """Price == face_value is allowed (not scalping)."""
        priv_alice, pub_alice = keypair_alice
        _, pub_bob = keypair_bob
        tx = Transaction(
            sender=pub_alice, recipient=pub_bob,
            ticket_id="T", price=100, face_value=100,
        )
        tx.sign(priv_alice)
        assert tx.is_valid() is True

    def test_price_above_face_value_invalid(self, keypair_alice, keypair_bob):
        """Price > face_value must fail is_valid() (anti-scalping rule)."""
        priv_alice, pub_alice = keypair_alice
        _, pub_bob = keypair_bob
        tx = Transaction(
            sender=pub_alice, recipient=pub_bob,
            ticket_id="T", price=101, face_value=100,
        )
        tx.sign(priv_alice)
        assert tx.is_valid() is False

    def test_serialization_roundtrip(self, signed_tx):
        """to_dict / from_dict must preserve all fields including signature."""
        data = signed_tx.to_dict()
        restored = Transaction.from_dict(data)
        assert restored.tx_hash() == signed_tx.tx_hash()
        assert restored.verify() is True


# ---------------------------------------------------------------------------
# Merkle tree tests
# ---------------------------------------------------------------------------

class TestMerkle:

    def _make_hashes(self, n: int) -> list[str]:
        import hashlib
        return [hashlib.sha256(str(i).encode()).hexdigest() for i in range(n)]

    def test_single_leaf(self):
        hashes = self._make_hashes(1)
        tree = MerkleTree(hashes)
        assert tree.root == hashes[0]

    def test_even_count_root_deterministic(self):
        hashes = self._make_hashes(4)
        root1 = merkle_root(hashes)
        root2 = merkle_root(hashes)
        assert root1 == root2
        assert len(root1) == 64  # hex SHA-256

    def test_odd_count_root_deterministic(self):
        hashes = self._make_hashes(3)
        root1 = merkle_root(hashes)
        root2 = merkle_root(hashes)
        assert root1 == root2
        assert len(root1) == 64

    def test_different_inputs_give_different_roots(self):
        hashes_a = self._make_hashes(4)
        hashes_b = self._make_hashes(4)
        hashes_b[-1] = "a" * 64  # alter last hash
        assert merkle_root(hashes_a) != merkle_root(hashes_b)

    def test_empty_root_is_empty_string(self):
        assert merkle_root([]) == ""

    def test_proof_valid_even(self):
        hashes = self._make_hashes(4)
        tree = MerkleTree(hashes)
        for i in range(4):
            proof = tree.get_proof(i)
            assert MerkleTree.verify_proof(hashes[i], proof, tree.root) is True

    def test_proof_valid_odd(self):
        hashes = self._make_hashes(5)
        tree = MerkleTree(hashes)
        for i in range(5):
            proof = tree.get_proof(i)
            assert MerkleTree.verify_proof(hashes[i], proof, tree.root) is True

    def test_proof_tampered_hash_rejected(self):
        hashes = self._make_hashes(4)
        tree = MerkleTree(hashes)
        proof = tree.get_proof(0)
        wrong_hash = "b" * 64
        assert MerkleTree.verify_proof(wrong_hash, proof, tree.root) is False

    def test_proof_wrong_root_rejected(self):
        hashes = self._make_hashes(4)
        tree = MerkleTree(hashes)
        proof = tree.get_proof(0)
        assert MerkleTree.verify_proof(hashes[0], proof, "c" * 64) is False


# ---------------------------------------------------------------------------
# Proof-of-Work tests
# ---------------------------------------------------------------------------

class TestPoW:

    def test_meets_difficulty_true(self):
        # A hash with enough leading zeros
        hash_hex = "0000" + "f" * 60  # 16 leading zero bits
        assert meets_difficulty(hash_hex, 16) is True

    def test_meets_difficulty_false(self):
        # A hash that clearly does NOT meet difficulty 16
        hash_hex = "ffff" + "0" * 60
        assert meets_difficulty(hash_hex, 16) is False

    def test_mine_satisfies_difficulty(self):
        block = genesis_block(difficulty=8)
        mined = mine(block)
        assert meets_difficulty(mined.block_hash(), 8) is True

    def test_verify_pow_mined_block(self):
        block = genesis_block(difficulty=8)
        mine(block)
        assert verify_pow(block) is True

    def test_verify_pow_unmined_block_fails(self):
        block = genesis_block(difficulty=8)
        # Reset nonce to 0 without mining — extremely unlikely to pass
        block.header.nonce = 0
        # With difficulty 8, the chance of nonce=0 satisfying is ~1/256.
        # We force a non-solution by using a high difficulty.
        block.header.difficulty = 64
        assert verify_pow(block) is False


# ---------------------------------------------------------------------------
# Blockchain (chain-level) tests
# ---------------------------------------------------------------------------

class TestBlockchain:

    def test_genesis_block_exists(self, blockchain):
        assert len(blockchain.chain) == 1
        assert blockchain.chain[0].header.index == 0
        assert blockchain.chain[0].header.prev_hash == "0" * 64

    def test_genesis_block_mined(self, blockchain):
        assert verify_pow(blockchain.chain[0]) is True

    def test_add_valid_transaction(self, blockchain, signed_tx):
        assert blockchain.add_transaction(signed_tx) is True
        assert len(blockchain.mempool) == 1

    def test_add_invalid_transaction_rejected(self, blockchain, signed_tx):
        signed_tx.price = 9999  # tamper after signing
        assert blockchain.add_transaction(signed_tx) is False
        assert len(blockchain.mempool) == 0

    def test_mine_pending_appends_block(self, blockchain, signed_tx):
        blockchain.add_transaction(signed_tx)
        new_block = blockchain.mine_pending()
        assert len(blockchain.chain) == 2
        assert new_block.header.index == 1
        assert len(new_block.transactions) == 1

    def test_mine_pending_clears_mempool(self, blockchain, signed_tx):
        blockchain.add_transaction(signed_tx)
        blockchain.mine_pending()
        assert len(blockchain.mempool) == 0

    def test_mine_pending_prev_hash_links(self, blockchain, signed_tx):
        blockchain.add_transaction(signed_tx)
        new_block = blockchain.mine_pending()
        assert new_block.header.prev_hash == blockchain.chain[0].block_hash()

    def test_chain_valid_after_two_blocks(self, blockchain, signed_tx):
        blockchain.add_transaction(signed_tx)
        blockchain.mine_pending()
        assert blockchain.is_chain_valid() is True

    def test_chain_invalid_after_tx_tamper(self, blockchain, signed_tx):
        """Mutating a mined transaction must break chain validation."""
        blockchain.add_transaction(signed_tx)
        blockchain.mine_pending()
        # Tamper with the transaction in block 1
        blockchain.chain[1].transactions[0].price = 9999
        assert blockchain.is_chain_valid() is False

    def test_chain_invalid_after_prev_hash_break(self, blockchain, signed_tx):
        """Breaking the prev_hash link must fail chain validation."""
        blockchain.add_transaction(signed_tx)
        blockchain.mine_pending()
        blockchain.chain[1].header.prev_hash = "dead" + "0" * 60
        assert blockchain.is_chain_valid() is False

    def test_chain_invalid_after_merkle_root_tamper(self, blockchain, signed_tx):
        """Replacing the Merkle root with a wrong value must fail validation."""
        blockchain.add_transaction(signed_tx)
        blockchain.mine_pending()
        blockchain.chain[1].header.merkle_root = "cafe" + "0" * 60
        assert blockchain.is_chain_valid() is False

    def test_serialization_roundtrip(self, blockchain, signed_tx):
        """Blockchain serialization must preserve chain integrity."""
        blockchain.add_transaction(signed_tx)
        blockchain.mine_pending()
        data = blockchain.to_dict()
        restored = Blockchain.from_dict(data)
        assert len(restored.chain) == len(blockchain.chain)
        assert restored.is_chain_valid() is True
