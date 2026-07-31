#!/bin/bash
set -u

# Run everything relative to the repo root, wherever this script is called from.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Tickets minted on-chain must match the ticket offerings the P2P node
# publishes — the frontend calls the contract with the IDs the node hands out.
SEED_COUNT=3

VENV="$ROOT/network/.venv"
PIDS=()

echo "🚀 Starting TicketChain Development Environment..."

cleanup() {
  echo ""
  echo "🛑 Shutting down TicketChain..."
  for pid in "${PIDS[@]}"; do
    # Each service runs in its own subshell; kill its children too, or the
    # Hardhat node and Vite survive the shutdown and keep holding their ports.
    pkill -P "$pid" 2>/dev/null
    kill "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# ---------------------------------------------------------------------------
# 0. Python environment for the P2P node
# ---------------------------------------------------------------------------
if [ ! -d "$VENV" ]; then
  echo "🐍 Creating Python venv and installing network dependencies..."
  python3 -m venv "$VENV" || exit 1
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r network/requirements.txt || exit 1
fi

# pyipv8 loads libsodium through libnacl, which on macOS looks in the dyld
# search path and then in <venv>/lib. Homebrew installs to /opt/homebrew/lib,
# which is in neither, so link it where libnacl will find it.
if [ ! -e "$VENV/lib/libsodium.dylib" ]; then
  for candidate in /opt/homebrew/lib/libsodium.dylib /usr/local/lib/libsodium.dylib; do
    if [ -e "$candidate" ]; then
      ln -sf "$candidate" "$VENV/lib/libsodium.dylib"
      break
    fi
  done
  if [ ! -e "$VENV/lib/libsodium.dylib" ]; then
    echo "⚠️  libsodium not found — the P2P node will fail to start."
    echo "   Install it with: brew install libsodium"
  fi
fi

# ---------------------------------------------------------------------------
# 1. Local blockchain
# ---------------------------------------------------------------------------
echo "📦 Starting local blockchain (logs routing to hardhat.log)..."
( cd contracts && exec npx hardhat node ) > hardhat.log 2>&1 &
PIDS+=($!)

# Wait for the JSON-RPC port to actually accept connections — deploying against
# a node that has not finished booting fails intermittently.
echo "⏳ Waiting for JSON-RPC on 127.0.0.1:8545..."
for _ in $(seq 1 60); do
  if nc -z 127.0.0.1 8545 2>/dev/null; then break; fi
  sleep 0.5
done
if ! nc -z 127.0.0.1 8545 2>/dev/null; then
  echo "❌ Hardhat node never came up — see hardhat.log"
  cleanup
fi

# ---------------------------------------------------------------------------
# 2. Deploy contracts (mints the seed tickets, refreshes the frontend ABI)
# ---------------------------------------------------------------------------
echo "⚙️ Deploying fresh smart contracts..."
if ! ( cd contracts && TICKET_SEED_COUNT="$SEED_COUNT" npx hardhat run scripts/deploy.js --network localhost ); then
  echo "❌ Deployment failed — see the output above"
  cleanup
fi

# ---------------------------------------------------------------------------
# 3. P2P node + HTTP API
# ---------------------------------------------------------------------------
echo "🌐 Starting P2P Network (logs routing to network.log)..."
( cd network && exec "$VENV/bin/python" main.py --seed "$SEED_COUNT" ) > network.log 2>&1 &
PIDS+=($!)

# ---------------------------------------------------------------------------
# 4. React frontend
# ---------------------------------------------------------------------------
echo "💻 Starting React UI..."
( cd frontend && exec npm run dev ) &
PIDS+=($!)

echo ""
echo "✅ All systems running! Press CTRL+C to stop."
echo "👉 Frontend available at: http://localhost:5173"
echo "👉 Ticket API:            http://127.0.0.1:8080/tickets"
echo "👉 To view backend logs in a separate window, run: tail -f hardhat.log"

wait
