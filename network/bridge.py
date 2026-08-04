"""Ethereum → P2P bridge.

Watches the TicketNFT contract on the local Hardhat node and republishes
every ticket event (TicketMinted, TicketTransferred, TicketListed,
TicketUnlisted) into the P2P layer as a signed blockchain Transaction:
submitted to the mempool, mined, and broadcast to peers. This closes the
gap where a purchase changed on-chain ownership but the P2P feed (and so
GET /tickets) kept showing stale state.

The bridge reads the contract address and ABI from
frontend/src/contracts/TicketNFT.json — the file deploy.js writes — so the
Python side never hardcodes either. It runs as an asyncio task alongside
the IPv8 node and the HTTP API, and retries instead of crashing while the
Hardhat node is not up yet (or the contract has not been deployed).
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import TYPE_CHECKING

from web3 import AsyncWeb3
from web3.providers.rpc import AsyncHTTPProvider

from blockchain import Transaction, generate_keypair

if TYPE_CHECKING:  # pragma: no cover - import cycle guard, typing only
    from main import TicketChainCommunity

# Overridable so a multi-node setup can point secondary nodes elsewhere
# (they receive state over P2P instead of each re-bridging the same chain).
RPC_URL = os.environ.get("TICKETCHAIN_RPC_URL", "http://127.0.0.1:8545")
CONTRACT_JSON = (
    Path(__file__).resolve().parent.parent
    / "frontend" / "src" / "contracts" / "TicketNFT.json"
)

# The on-chain events republished into the P2P feed.
EVENT_NAMES = ("TicketMinted", "TicketTransferred", "TicketListed", "TicketUnlisted")

POLL_INTERVAL = 2.0   # seconds between block-number polls
RETRY_INTERVAL = 5.0  # seconds between reconnect attempts


class ContractEventBridge:
    """Forwards TicketNFT contract events into a TicketChainCommunity."""

    def __init__(
        self,
        community: "TicketChainCommunity",
        rpc_url: str = RPC_URL,
        contract_json: Path = CONTRACT_JSON,
    ) -> None:
        self.community = community
        self.rpc_url = rpc_url
        self.contract_json = contract_json
        # The bridge's P2P identity: every republished event is signed with
        # this key so peers can validate the transaction signature.
        self._key, self._pubkey = generate_keypair()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Watch forever. Any failure (chain down, contract not deployed yet,
        RPC hiccup) logs once and retries — the P2P node must keep running
        regardless of the Ethereum side's state."""
        while True:
            try:
                await self._watch()
            except asyncio.CancelledError:
                raise
            except FileNotFoundError:
                print(
                    f"[bridge] {self.contract_json.name} not found — run "
                    f"contracts/scripts/deploy.js first; retrying in {RETRY_INTERVAL:.0f}s"
                )
                await asyncio.sleep(RETRY_INTERVAL)
            except Exception as exc:  # noqa: BLE001 - deliberate catch-all, see docstring
                print(
                    f"[bridge] {type(exc).__name__}: {exc} — Ethereum node "
                    f"unreachable? retrying in {RETRY_INTERVAL:.0f}s"
                )
                await asyncio.sleep(RETRY_INTERVAL)

    async def _watch(self) -> None:
        info = json.loads(self.contract_json.read_text())
        w3 = AsyncWeb3(AsyncHTTPProvider(self.rpc_url))
        try:
            await self._poll_events(w3, info)
        finally:
            # Close the aiohttp session; otherwise every retry after a failed
            # connection leaks an "Unclosed client session" warning.
            await w3.provider.disconnect()

    async def _poll_events(self, w3: AsyncWeb3, info: dict) -> None:
        contract = w3.eth.contract(
            address=w3.to_checksum_address(info["address"]), abi=info["abi"]
        )

        # All tickets are issued at the contract's fixed face value; cache it
        # once as the anti-scalping ceiling for every republished transaction.
        face_value = int(await contract.functions.FACE_VALUE().call())

        # Start from the current tip: history before the bridge came up is
        # replayed on the next deploy anyway (deploy.js mints fresh tokens).
        last_block = await w3.eth.block_number
        print(
            f"[bridge] watching {info['address']} on {self.rpc_url} "
            f"from block {last_block + 1}"
        )

        while True:
            await asyncio.sleep(POLL_INTERVAL)
            current = await w3.eth.block_number

            if current < last_block:
                # The Hardhat node was restarted and the chain reset.
                print(f"[bridge] chain reset detected (tip {current}) — resyncing")
                last_block = current
                continue
            if current == last_block:
                continue

            logs = []
            for name in EVENT_NAMES:
                event = getattr(contract.events, name)
                logs.extend(
                    await event().get_logs(from_block=last_block + 1, to_block=current)
                )
            logs.sort(key=lambda log: (log["blockNumber"], log["logIndex"]))

            for log in logs:
                self._publish(log, face_value)
            if logs:
                # One P2P block per batch of contract events: mine the mempool
                # and broadcast it so peers pick the state change up.
                self.community.mine_block()

            last_block = current

    # ------------------------------------------------------------------
    # Event → Transaction
    # ------------------------------------------------------------------

    def _publish(self, log, face_value: int) -> None:
        """Republish one contract event as a signed P2P transaction.

        ticket_id carries the ERC-721 token ID as a string — api.py parses
        it back with int() and skips anything non-numeric.
        """
        name = log["event"]
        args = log["args"]

        if name == "TicketMinted":
            price = int(args["faceValue"])
            counterparty = args["to"]
        elif name == "TicketTransferred":
            price = int(args["price"])
            counterparty = args["to"]
        elif name == "TicketListed":
            price = int(args["price"])
            counterparty = args["seller"]
        else:  # TicketUnlisted — no price attached, feed entry marks the pull
            price = 0
            counterparty = args["seller"]

        tx = Transaction(
            sender=self._pubkey,
            recipient=counterparty,  # Ethereum address of the affected party
            ticket_id=str(args["tokenId"]),
            price=price,
            face_value=face_value,
        )
        tx.sign(self._key)
        self.community.submit_transaction(tx)
        print(f"[bridge] {name} tokenId={args['tokenId']} → P2P tx {tx.tx_hash()[:8]}…")
