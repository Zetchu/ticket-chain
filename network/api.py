"""Lightweight HTTP API for the TicketChain P2P node.

Exposes ticket offerings discovered across the P2P network to the React
frontend. Runs on http://127.0.0.1:8080 alongside the IPv8 node, inside
the same asyncio event loop (uvicorn serves as a background task).

Endpoints:
    GET  /tickets       — JSON array of tickets discovered on the local chain
                          (mined blocks + pending mempool transactions).
    POST /images        — store event artwork, addressed by content hash.
    GET  /images/{hash} — serve previously stored artwork.
    GET  /health        — node status.

The ticket schema matches what the frontend expects:
{id, type, price, title, location, date}.
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from blockchain import Blockchain, Transaction

API_HOST = "127.0.0.1"
# Overridable so a second node on the same machine can serve its own feed
# (e.g. TICKETCHAIN_API_PORT=8081 python main.py 8091).
API_PORT = int(os.environ.get("TICKETCHAIN_API_PORT", "8080"))

# Vite dev server origins allowed to call this API.
#
# Any localhost port is accepted, not just 5173: Vite silently falls back to
# 5174, 5175, … when its default port is taken, and a hardcoded list turns that
# into an opaque CORS failure in the browser. The API binds to 127.0.0.1 only
# (see API_HOST), so "any port on this machine" is the same trust boundary the
# socket already enforces.
ALLOWED_ORIGIN_REGEX = r"http://(localhost|127\.0\.0\.1)(:\d+)?"

# Event artwork uploaded by organizers. Stored next to this module, one file
# per image, named by content hash — the same picture uploaded twice is stored
# once, and the reference the contract holds is a fixed-length hash rather than
# a filename someone could collide or spoof.
IMAGE_DIR = Path(os.environ.get("TICKETCHAIN_IMAGE_DIR", Path(__file__).parent / "images"))
MAX_IMAGE_BYTES = 4 * 1024 * 1024
# Only formats a browser will render inline, so a stored file can never be
# something the frontend would hand to the user as a download.
ALLOWED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def _tx_to_ticket(tx: Transaction, status: str) -> dict | None:
    """Map a blockchain Transaction to the frontend ticket schema.

    ``id`` is the ERC-721 token ID of the ticket on the Ethereum side —
    Transaction.ticket_id holds it as a string. The frontend calls
    getTicketDetails(id) and resaleTransfer(id) with it, so a transaction
    whose ticket_id is not a token ID has no on-chain counterpart to show
    and is skipped (returns None) rather than rendering a broken card.
    """
    try:
        token_id = int(tx.ticket_id)
    except (TypeError, ValueError):
        return None

    return {
        "id": token_id,
        "type": status,
        "price": str(tx.price),
        "title": f"Ticket #{token_id}",
        "location": "Local P2P Network",
        "date": datetime.fromtimestamp(tx.timestamp, tz=timezone.utc).strftime(
            "%Y-%m-%d %H:%M"
        ),
    }


def create_app(blockchain: Blockchain) -> FastAPI:
    """Build the FastAPI app bound to *blockchain*.

    Args:
        blockchain: The node's live Blockchain instance. The app reads from
                    it on every request, so mined blocks and mempool changes
                    are reflected immediately.
    """
    app = FastAPI(
        title="TicketChain Node API",
        description="Ticket offerings discovered across the local P2P network.",
        version="0.2.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=ALLOWED_ORIGIN_REGEX,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/tickets")
    def get_tickets() -> list[dict]:
        """Return all ticket offerings known to this node.

        Includes transactions confirmed in mined blocks (type "Confirmed")
        and pending mempool transactions (type "Pending").
        """
        tickets: list[dict] = []

        # Confirmed transactions from mined blocks (skip genesis, no txs)
        for block in blockchain.chain:
            for tx in block.transactions:
                ticket = _tx_to_ticket(tx, "Confirmed")
                if ticket is not None:
                    tickets.append(ticket)

        # Pending transactions from the mempool
        for tx in blockchain.mempool:
            ticket = _tx_to_ticket(tx, "Pending")
            if ticket is not None:
                tickets.append(ticket)

        return tickets

    @app.post("/images")
    async def upload_image(file: UploadFile = File(...)) -> dict:
        """Store event artwork and return the hash the contract should record.

        Content-addressed: the SHA-256 of the bytes is both the filename and
        the reference minted on-chain, so the contract never holds a mutable
        path and re-uploading the same picture is a no-op.
        """
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported image type {file.content_type!r}. "
                f"Allowed: {', '.join(sorted(ALLOWED_IMAGE_TYPES))}.",
            )

        data = await file.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Image exceeds the {MAX_IMAGE_BYTES // (1024 * 1024)} MB limit.",
            )
        if not data:
            raise HTTPException(status_code=400, detail="Empty upload.")

        digest = hashlib.sha256(data).hexdigest()
        IMAGE_DIR.mkdir(parents=True, exist_ok=True)
        stored = IMAGE_DIR / f"{digest}{ALLOWED_IMAGE_TYPES[file.content_type]}"
        if not stored.exists():
            stored.write_bytes(data)

        return {
            "hash": digest,
            "url": f"http://{API_HOST}:{API_PORT}/images/{digest}",
            "bytes": len(data),
        }

    @app.get("/images/{image_hash}")
    def get_image(image_hash: str) -> FileResponse:
        """Serve stored artwork by content hash."""
        # The hash comes straight from a URL, so reject anything that is not a
        # plain hex digest before it reaches the filesystem.
        if len(image_hash) != 64 or not all(c in "0123456789abcdef" for c in image_hash):
            raise HTTPException(status_code=400, detail="Malformed image hash.")

        for extension in ALLOWED_IMAGE_TYPES.values():
            candidate = IMAGE_DIR / f"{image_hash}{extension}"
            if candidate.exists():
                return FileResponse(candidate)

        raise HTTPException(status_code=404, detail="No image stored under that hash.")

    @app.get("/health")
    def health() -> dict:
        """Basic node health/status info."""
        return {
            "status": "ok",
            "chain_length": len(blockchain.chain),
            "mempool_size": len(blockchain.mempool),
            "chain_valid": blockchain.is_chain_valid(),
        }

    return app
