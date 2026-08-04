"""Lightweight HTTP API for the TicketChain P2P node.

Exposes ticket offerings discovered across the P2P network to the React
frontend. Runs on http://127.0.0.1:8080 alongside the IPv8 node, inside
the same asyncio event loop (uvicorn serves as a background task).

Endpoints:
    GET /tickets  — JSON array of tickets discovered on the local chain
                    (mined blocks + pending mempool transactions).

The response schema matches what frontend/src/components/TicketGrid.tsx
expects: {id, type, price, title, location, date}.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
        allow_methods=["GET"],
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
