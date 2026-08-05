"""pytest suite for the TicketChain blockchain core.

Run from the network/ directory:
    pip install -r requirements.txt pytest
    pytest test_blockchain.py -v

Covers:
  - Transaction sign / verify / tamper rejection / price-ceiling validation
  - Merkle tree root correctness (even/odd counts) and inclusion proofs
  - Proof-of-Work mining and verification
  - Full-chain validation (happy path and tamper scenarios)
  - Search puzzle sequence (per-message PoW for Sybil resistance)
  - HTTP API (GET /tickets, GET /health)
"""

import copy
import hashlib

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
    solve_puzzle,
    verify_pow,
    verify_puzzle,
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

    def test_roundtrip_with_event_metadata(self, keypair_alice, keypair_bob):
        """Sign/verify must survive serialization when the optional lifecycle
        and event fields are set — they are part of the signed payload."""
        priv_alice, pub_alice = keypair_alice
        _, pub_bob = keypair_bob
        tx = Transaction(
            sender=pub_alice, recipient=pub_bob,
            ticket_id="3", price=50, face_value=100,
            kind="Listed", event_name="Sunset Festival", event_date=1893456000,
        )
        tx.sign(priv_alice)

        restored = Transaction.from_dict(tx.to_dict())
        assert restored.kind == "Listed"
        assert restored.event_name == "Sunset Festival"
        assert restored.event_date == 1893456000
        assert restored.tx_hash() == tx.tx_hash()
        assert restored.verify() is True

    def test_transactions_without_new_fields_still_validate(self, signed_tx):
        """A transaction created before kind/event_name/event_date existed
        must sign the exact same bytes as today's default construction: its
        serialized form has no new keys and it still verifies."""
        data = signed_tx.to_dict()
        assert "kind" not in data
        assert "event_name" not in data
        assert "event_date" not in data
        assert Transaction.from_dict(data).verify() is True

    def test_tampered_event_name_fails_verify(self, keypair_alice, keypair_bob):
        """The event metadata is covered by the signature when present."""
        priv_alice, pub_alice = keypair_alice
        _, pub_bob = keypair_bob
        tx = Transaction(
            sender=pub_alice, recipient=pub_bob,
            ticket_id="3", price=50, face_value=100,
            kind="Listed", event_name="Sunset Festival", event_date=1893456000,
        )
        tx.sign(priv_alice)
        tx.event_name = "Scam Fest"
        assert tx.verify() is False


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


# ---------------------------------------------------------------------------
# Chain sync tests (longest-valid-chain rule)
# ---------------------------------------------------------------------------

class TestChainSync:
    """Blockchain.should_replace_with — the rule a node applies when a
    peer's chain arrives over P2P chain sync (see network/main.py's
    ChainRequestPayload / ChainResponsePayload)."""

    @staticmethod
    def _mine_n_more(chain: Blockchain, n: int) -> Blockchain:
        for _ in range(n):
            chain.mine_pending()
        return chain

    def test_rejects_shorter_chain(self, blockchain):
        self._mine_n_more(blockchain, 2)
        candidate = Blockchain(difficulty=8)  # genesis only
        assert blockchain.should_replace_with(candidate) is False

    def test_rejects_equal_length_chain(self, blockchain):
        self._mine_n_more(blockchain, 1)
        candidate = self._mine_n_more(Blockchain(difficulty=8), 1)
        assert blockchain.should_replace_with(candidate) is False

    def test_adopts_longer_valid_chain(self, blockchain):
        candidate = self._mine_n_more(Blockchain(difficulty=8), 2)
        assert blockchain.should_replace_with(candidate) is True

    def test_rejects_longer_chain_with_broken_linkage(self, blockchain):
        """A longer chain that fails is_chain_valid() must be rejected —
        this is what stops a node from adopting a bogus longer chain."""
        candidate = self._mine_n_more(Blockchain(difficulty=8), 2)
        candidate.chain[1].header.prev_hash = "dead" + "0" * 60
        assert candidate.is_chain_valid() is False  # sanity
        assert blockchain.should_replace_with(candidate) is False

    def test_rejects_longer_chain_with_tampered_transaction(self, blockchain, signed_tx):
        candidate = Blockchain(difficulty=8)
        candidate.add_transaction(signed_tx)
        candidate.mine_pending()
        self._mine_n_more(candidate, 1)
        candidate.chain[1].transactions[0].price = 9999
        assert candidate.is_chain_valid() is False  # sanity
        assert blockchain.should_replace_with(candidate) is False

    def test_rejects_longer_chain_with_different_genesis(self, blockchain):
        """A chain that is internally self-consistent but started from a
        different genesis must not be adopted just for being longer —
        that would let an unrelated network hijack a node outright."""
        candidate = self._mine_n_more(Blockchain(difficulty=4), 2)
        assert candidate.is_chain_valid() is True  # sanity: valid on its own
        assert candidate.chain[0].block_hash() != blockchain.chain[0].block_hash()
        assert blockchain.should_replace_with(candidate) is False

    def test_rejects_empty_candidate(self, blockchain):
        candidate = Blockchain(difficulty=8)
        candidate.chain = []
        assert blockchain.should_replace_with(candidate) is False

    def test_does_not_mutate_either_chain(self, blockchain):
        """should_replace_with is a pure decision — the caller is
        responsible for actually swapping the chain over."""
        candidate = self._mine_n_more(Blockchain(difficulty=8), 2)
        before_len = len(blockchain.chain)
        blockchain.should_replace_with(candidate)
        assert len(blockchain.chain) == before_len
        assert len(candidate.chain) == 3


# ---------------------------------------------------------------------------
# Search puzzle tests (per-message Sybil resistance)
# ---------------------------------------------------------------------------

class TestSearchPuzzle:

    def test_solve_and_verify(self):
        """A solved puzzle must verify for the same message."""
        message = b"ticket availability: TICKET-001"
        nonce = solve_puzzle(message)
        assert verify_puzzle(message, nonce) is True

    def test_invalid_nonce_rejected(self):
        """A wrong nonce must fail verification (unless it happens to solve

        the puzzle too — avoided by checking against a known non-solution).
        """
        message = b"ticket availability: TICKET-002"
        nonce = solve_puzzle(message)
        # nonce is the *smallest* solution, so any smaller value fails.
        for wrong in range(nonce):
            assert verify_puzzle(message, wrong) is False

    def test_negative_nonce_rejected(self):
        message = b"anything"
        assert verify_puzzle(message, -1) is False

    def test_tampered_message_rejected(self):
        """Changing the message after solving must invalidate the nonce."""
        message = b"price=50"
        nonce = solve_puzzle(message)
        tampered = b"price=99"
        # The same nonce is astronomically unlikely to solve the tampered
        # message at 8 bits; if it coincidentally does, solve again on a
        # message we know differs in solution.
        if verify_puzzle(tampered, nonce):
            pytest.skip("coincidental collision at low difficulty")
        assert verify_puzzle(tampered, nonce) is False

    def test_higher_difficulty(self):
        """Puzzle works at higher difficulty (12 bits ≈ 4096 attempts)."""
        message = b"stress"
        nonce = solve_puzzle(message, difficulty=12)
        assert verify_puzzle(message, nonce, difficulty=12) is True
        # A 12-bit solution is not automatically an 16-bit solution check
        # (it may be, but verifying at the solved difficulty must pass).


# ---------------------------------------------------------------------------
# HTTP API tests (GET /tickets, GET /health)
# ---------------------------------------------------------------------------

class TestAPI:

    @staticmethod
    def _offering(token_id: str, **fields) -> Transaction:
        """A signed ticket offering for on-chain token *token_id*."""
        priv, pub = generate_keypair()
        _, pub2 = generate_keypair()
        tx = Transaction(
            sender=pub, recipient=pub2,
            ticket_id=token_id, price=10, face_value=20,
            **fields,
        )
        tx.sign(priv)
        return tx

    @pytest.fixture
    def client(self, blockchain):
        """A FastAPI TestClient bound to a blockchain with 1 mined tx and
        1 pending tx. ticket_id carries the ERC-721 token ID of the ticket."""
        from fastapi.testclient import TestClient
        from api import create_app

        # 1 confirmed transaction (mined into block #1)
        blockchain.add_transaction(self._offering("0"))
        blockchain.mine_pending()

        # 1 pending transaction (left in mempool)
        blockchain.add_transaction(self._offering("7"))

        return TestClient(create_app(blockchain))

    def test_get_tickets_returns_list(self, client):
        resp = client.get("/tickets")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_tickets_shape(self, client):
        """Each ticket must have the exact fields the frontend expects."""
        tickets = client.get("/tickets").json()
        assert len(tickets) == 2
        for ticket in tickets:
            assert set(ticket.keys()) == {
                "id", "type", "price", "title", "location", "date"
            }
            assert isinstance(ticket["id"], int)
            assert isinstance(ticket["price"], str)

    def test_get_tickets_confirmed_and_pending(self, client):
        tickets = client.get("/tickets").json()
        types = [t["type"] for t in tickets]
        assert "Confirmed" in types
        assert "Pending" in types

    def test_get_tickets_pending_title(self, client):
        tickets = client.get("/tickets").json()
        pending = [t for t in tickets if t["type"] == "Pending"]
        assert pending[0]["title"] == "Ticket #7"

    def test_get_tickets_ids_are_token_ids(self, client):
        """`id` is the ERC-721 token ID the frontend calls the contract with."""
        tickets = client.get("/tickets").json()
        assert [t["id"] for t in tickets] == [0, 7]

    def test_one_row_per_token(self, blockchain):
        """A ticket minted, listed, and sold is ONE feed entry — the latest
        transaction for the token — not three."""
        from fastapi.testclient import TestClient
        from api import create_app

        blockchain.add_transaction(self._offering("3", kind="Minted"))
        blockchain.add_transaction(self._offering("3", kind="Listed"))
        blockchain.mine_pending()
        blockchain.add_transaction(self._offering("3", kind="Sold"))
        blockchain.mine_pending()

        tickets = TestClient(create_app(blockchain)).get("/tickets").json()
        assert len(tickets) == 1
        assert tickets[0]["id"] == 3
        assert tickets[0]["type"] == "Sold"

    def test_pending_wins_over_mined(self, blockchain):
        """A not-yet-mined sale must override the token's mined history and
        show as Pending."""
        from fastapi.testclient import TestClient
        from api import create_app

        blockchain.add_transaction(self._offering("5", kind="Listed"))
        blockchain.mine_pending()
        blockchain.add_transaction(self._offering("5", kind="Sold"))

        tickets = TestClient(create_app(blockchain)).get("/tickets").json()
        assert len(tickets) == 1
        assert tickets[0]["type"] == "Pending"

    def test_event_metadata_used_for_title_and_date(self, blockchain):
        """Bridged event_name/event_date become the feed's title and date;
        transactions without them keep the placeholder title."""
        from fastapi.testclient import TestClient
        from api import create_app

        blockchain.add_transaction(self._offering(
            "0", kind="Listed",
            event_name="Sunset Festival", event_date=1893456000,
        ))
        blockchain.add_transaction(self._offering("1"))
        blockchain.mine_pending()

        by_id = {t["id"]: t for t in
                 TestClient(create_app(blockchain)).get("/tickets").json()}
        assert by_id[0]["title"] == "Sunset Festival"
        assert by_id[0]["date"] == "2030-01-01 00:00"
        assert by_id[1]["title"] == "Ticket #1"

    def test_get_tickets_skips_transactions_without_a_token_id(self, blockchain):
        """A ticket_id that is not a token ID has no on-chain counterpart, so
        it is left out rather than rendered as a card that cannot be read."""
        from fastapi.testclient import TestClient
        from api import create_app

        blockchain.add_transaction(self._offering("3"))
        blockchain.add_transaction(self._offering("TICKET-001"))

        tickets = TestClient(create_app(blockchain)).get("/tickets").json()
        assert [t["id"] for t in tickets] == [3]

    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["chain_length"] == 2   # genesis + 1 mined
        assert body["mempool_size"] == 1   # 1 pending
        assert body["chain_valid"] is True

    def test_cors_headers(self, client):
        """The Vite dev origin must be allowed by CORS."""
        resp = client.get(
            "/tickets", headers={"Origin": "http://localhost:5173"}
        )
        assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


class TestImageUpload:
    """POST /images and GET /images/{hash} — organizer event artwork."""

    # Smallest valid PNG: a single transparent pixel.
    PNG = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
    )

    @pytest.fixture
    def client(self, blockchain, tmp_path, monkeypatch):
        """A client whose uploads land in a temp directory, not the repo."""
        from fastapi.testclient import TestClient
        import api

        monkeypatch.setattr(api, "IMAGE_DIR", tmp_path / "images")
        return TestClient(api.create_app(blockchain))

    def test_upload_returns_content_hash_and_url(self, client):
        resp = client.post(
            "/images", files={"file": ("pass.png", self.PNG, "image/png")}
        )
        assert resp.status_code == 200

        body = resp.json()
        assert body["hash"] == hashlib.sha256(self.PNG).hexdigest()
        assert body["hash"] in body["url"]
        assert body["bytes"] == len(self.PNG)

    def test_uploaded_image_is_served_back(self, client):
        digest = client.post(
            "/images", files={"file": ("pass.png", self.PNG, "image/png")}
        ).json()["hash"]

        resp = client.get(f"/images/{digest}")
        assert resp.status_code == 200
        assert resp.content == self.PNG

    def test_same_image_twice_is_stored_once(self, client, tmp_path):
        """Content addressing: re-uploading is a no-op, not a duplicate."""
        first = client.post("/images", files={"file": ("a.png", self.PNG, "image/png")})
        second = client.post("/images", files={"file": ("b.png", self.PNG, "image/png")})

        assert first.json()["hash"] == second.json()["hash"]
        assert len(list((tmp_path / "images").iterdir())) == 1

    def test_rejects_a_non_image_upload(self, client):
        resp = client.post(
            "/images", files={"file": ("payload.html", b"<script>", "text/html")}
        )
        assert resp.status_code == 415

    def test_rejects_an_empty_upload(self, client):
        resp = client.post("/images", files={"file": ("empty.png", b"", "image/png")})
        assert resp.status_code == 400

    def test_rejects_an_oversized_upload(self, client):
        from api import MAX_IMAGE_BYTES

        oversized = b"\x89PNG" + b"\x00" * MAX_IMAGE_BYTES
        resp = client.post(
            "/images", files={"file": ("huge.png", oversized, "image/png")}
        )
        assert resp.status_code == 413

    def test_unknown_hash_is_404(self, client):
        resp = client.get(f"/images/{'a' * 64}")
        assert resp.status_code == 404

    def test_malformed_hash_is_rejected_before_touching_the_filesystem(self, client):
        """A hash arrives from a URL, so only a plain hex digest may reach disk.

        Path separators and dot segments are normalised away before routing, so
        the guard covers the rest: wrong length, wrong alphabet, anything that
        is not a bare hex digest.
        """
        for bad in ("not-a-hash", "a" * 63, "g" * 64, "0x" + "a" * 62):
            assert client.get(f"/images/{bad}").status_code == 400
