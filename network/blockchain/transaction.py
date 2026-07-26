"""Transaction: creation, signing, verification, and validation.

Uses SECP256K1 (same curve as Ethereum/Bitcoin) via the `cryptography`
library, which is already pinned in requirements.txt.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Optional

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.exceptions import InvalidSignature


# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------

def generate_keypair() -> tuple[ec.EllipticCurvePrivateKey, str]:
    """Generate a fresh SECP256K1 keypair.

    Returns:
        (private_key, public_key_hex) — the hex string is the uncompressed
        public key (65 bytes = 130 hex chars) used as a wallet address.
    """
    private_key = ec.generate_private_key(ec.SECP256K1())
    public_key_hex = _pubkey_to_hex(private_key.public_key())
    return private_key, public_key_hex


def _pubkey_to_hex(public_key: ec.EllipticCurvePublicKey) -> str:
    raw = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    return raw.hex()


def _hex_to_pubkey(hex_str: str) -> ec.EllipticCurvePublicKey:
    raw = bytes.fromhex(hex_str)
    return ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256K1(), raw)


# ---------------------------------------------------------------------------
# Transaction
# ---------------------------------------------------------------------------

@dataclass
class Transaction:
    """A ticket transfer transaction.

    Attributes:
        sender:      Hex-encoded uncompressed public key of the sender.
        recipient:   Hex-encoded uncompressed public key of the recipient.
        ticket_id:   Unique identifier of the ticket being transferred.
        price:       Offered sale price (arbitrary integer units).
        face_value:  Original face value of the ticket (anti-scalping ceiling).
        timestamp:   Unix timestamp of creation (float seconds).
        signature:   DER-encoded ECDSA signature bytes, or None if unsigned.
    """

    sender: str
    recipient: str
    ticket_id: str
    price: int
    face_value: int
    timestamp: float = field(default_factory=time.time)
    signature: Optional[bytes] = field(default=None, repr=False)

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def _signable_bytes(self) -> bytes:
        """Deterministic bytes over all fields *except* the signature.

        This is what gets hashed for tx_hash() and what is signed/verified.
        """
        payload = {
            "sender": self.sender,
            "recipient": self.recipient,
            "ticket_id": self.ticket_id,
            "price": self.price,
            "face_value": self.face_value,
            "timestamp": self.timestamp,
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()

    def tx_hash(self) -> str:
        """SHA-256 of the signable payload, returned as a hex string."""
        return hashlib.sha256(self._signable_bytes()).hexdigest()

    def to_dict(self) -> dict:
        return {
            "sender": self.sender,
            "recipient": self.recipient,
            "ticket_id": self.ticket_id,
            "price": self.price,
            "face_value": self.face_value,
            "timestamp": self.timestamp,
            "signature": self.signature.hex() if self.signature else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Transaction":
        sig = bytes.fromhex(data["signature"]) if data.get("signature") else None
        return cls(
            sender=data["sender"],
            recipient=data["recipient"],
            ticket_id=data["ticket_id"],
            price=data["price"],
            face_value=data["face_value"],
            timestamp=data["timestamp"],
            signature=sig,
        )

    # ------------------------------------------------------------------
    # Signing & verification
    # ------------------------------------------------------------------

    def sign(self, private_key: ec.EllipticCurvePrivateKey) -> None:
        """Sign this transaction with *private_key* (ECDSA/SHA-256).

        The signature is stored in ``self.signature`` as DER-encoded bytes.
        """
        self.signature = private_key.sign(
            self._signable_bytes(),
            ec.ECDSA(hashes.SHA256()),
        )

    def verify(self) -> bool:
        """Return True if the signature is valid for the sender's public key."""
        if self.signature is None:
            return False
        try:
            pubkey = _hex_to_pubkey(self.sender)
            pubkey.verify(
                self.signature,
                self._signable_bytes(),
                ec.ECDSA(hashes.SHA256()),
            )
            return True
        except (InvalidSignature, Exception):
            return False

    # ------------------------------------------------------------------
    # Business-rule validation
    # ------------------------------------------------------------------

    def is_valid(self) -> bool:
        """Return True iff the signature is valid AND price ≤ face_value."""
        return self.verify() and self.price <= self.face_value
