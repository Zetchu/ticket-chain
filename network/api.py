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

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from blockchain import Blockchain, Transaction

API_HOST = "127.0.0.1"
API_PORT = 8080

# Vite dev server origins allowed to call this API.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def _tx_to_ticket(tx: Transaction, ticket_number: int, status: str) -> dict:
    """Map a blockchain Transaction to the frontend ticket schema."""
    return {
        "id": ticket_number,
        "type": status,
        "price": str(tx.price),
        "title": tx.ticket_id,
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
        allow_origins=ALLOWED_ORIGINS,
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
        ticket_number = 1

        # Confirmed transactions from mined blocks (skip genesis, no txs)
        for block in blockchain.chain:
            for tx in block.transactions:
                tickets.append(_tx_to_ticket(tx, ticket_number, "Confirmed"))
                ticket_number += 1

        # Pending transactions from the mempool
        for tx in blockchain.mempool:
            tickets.append(_tx_to_ticket(tx, ticket_number, "Pending"))
            ticket_number += 1

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
