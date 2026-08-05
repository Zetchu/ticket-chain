#!/bin/bash
set -u

# Two-node variant of start_dev.sh: brings up the exact same stack (Hardhat
# node, deployed contracts, React frontend), plus a *second* P2P node (B,
# UDP port 8091) alongside the primary one (A, port 8090), so chain-sync
# propagation between peers is something you can watch happen live rather
# than just something a test asserts.
#
# Node B does not run its own Ethereum bridge against the contract:
# TICKETCHAIN_RPC_URL points it at a port nothing listens on, so its bridge
# retries harmlessly forever (see network/bridge.py) and B's chain instead
# comes entirely from P2P chain sync with node A — the same path a real
# second peer joining the network would take. Running two independent
# bridges against the same contract would have each node mining its own
# block for the same on-chain event (different sender key, different
# timestamp, different hash), which is exactly the kind of silent chain
# divergence this two-node setup exists to demonstrate *isn't* a problem
# anymore.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

VENV="$ROOT/network/.venv"
PIDS=()

echo "🚀 Starting TicketChain Two-Node Demo..."

# Same reason as start_dev.sh: never inherit a half-running stack.
"$ROOT/stop_dev.sh"
echo ""

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
# 0. Python environment for the P2P nodes (same logic as start_dev.sh)
# ---------------------------------------------------------------------------
REQUIREMENTS="$ROOT/network/requirements.txt"
INSTALL_MARKER="$VENV/.requirements-installed"

# pyipv8 3.x imports typing.Concatenate, so it needs Python 3.10 or newer.
# On macOS `python3` is often Apple's 3.9, which would build a venv the node
# cannot run in — so search for a usable interpreter rather than assuming.
MIN_MINOR=10
supports_ipv8() {
  "$1" -c "import sys; sys.exit(0 if sys.version_info >= (3, $MIN_MINOR) else 1)" 2>/dev/null
}

PYTHON=''
for candidate in python3.14 python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1 && supports_ipv8 "$candidate"; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "❌ Python 3.$MIN_MINOR+ is required (pyipv8 3.x)."
  echo "   Found: $(python3 --version 2>&1). Install a newer one, e.g.:"
  echo "     brew install python@3.12        # macOS"
  echo "     sudo apt install python3.12      # Debian/Ubuntu"
  exit 1
fi

# An existing venv built on an older interpreter can't be upgraded in place.
if [ -x "$VENV/bin/python" ] && ! supports_ipv8 "$VENV/bin/python"; then
  echo "♻️  Rebuilding venv on $("$PYTHON" --version 2>&1) (was $("$VENV/bin/python" --version 2>&1))..."
  rm -rf "$VENV"
fi

if [ ! -d "$VENV" ]; then
  echo "🐍 Creating Python venv with $PYTHON..."
  "$PYTHON" -m venv "$VENV" || exit 1
fi

# Reinstall whenever requirements.txt has moved on.
if [ ! -f "$INSTALL_MARKER" ] || [ "$REQUIREMENTS" -nt "$INSTALL_MARKER" ]; then
  echo "🐍 Installing network dependencies..."
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r "$REQUIREMENTS" || exit 1
  touch "$INSTALL_MARKER"
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
    echo "⚠️  libsodium not found — the P2P nodes will fail to start."
    echo "   Install it with: brew install libsodium"
  fi
fi

# ---------------------------------------------------------------------------
# 1. Local blockchain
# ---------------------------------------------------------------------------
echo "📦 Starting local blockchain (logs routing to hardhat.log)..."
( cd contracts && exec npx hardhat node ) > hardhat.log 2>&1 &
PIDS+=($!)

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
# 2. Deploy contracts (refreshes the frontend ABI)
# ---------------------------------------------------------------------------
echo "⚙️ Deploying fresh smart contracts..."
if ! ( cd contracts && npx hardhat run scripts/deploy.js --network localhost ); then
  echo "❌ Deployment failed — see the output above"
  cleanup
fi

# ---------------------------------------------------------------------------
# 3. P2P node A — the "real" node, bridging on-chain events (:8090, API :8080)
# ---------------------------------------------------------------------------
echo "🌐 Starting P2P node A on :8090 (logs routing to network-a.log)..."
( cd network && exec "$VENV/bin/python" -u main.py 8090 ) > network-a.log 2>&1 &
PIDS+=($!)

# ---------------------------------------------------------------------------
# 4. P2P node B — a peer with no bridge of its own (:8091, API :8081);
#    everything it knows comes from chain sync with node A
# ---------------------------------------------------------------------------
echo "🌐 Starting P2P node B on :8091 (logs routing to network-b.log)..."
(
  cd network
  export TICKETCHAIN_RPC_URL="http://127.0.0.1:1"  # nothing listens here — bridge no-ops
  exec "$VENV/bin/python" -u main.py 8091 --api-port 8081
) > network-b.log 2>&1 &
PIDS+=($!)

# ---------------------------------------------------------------------------
# 5. React frontend
# ---------------------------------------------------------------------------
echo "💻 Starting React UI..."
( cd frontend && exec npm run dev ) &
PIDS+=($!)

echo ""
echo "✅ All systems running! Press CTRL+C to stop."
echo "👉 Frontend available at: http://localhost:5173"
echo "👉 Node A ticket API:     http://127.0.0.1:8080/tickets"
echo "👉 Node B ticket API:     http://127.0.0.1:8081/tickets  (watch it converge onto A's)"
echo "👉 To watch propagation:  tail -f network-a.log network-b.log"

wait
