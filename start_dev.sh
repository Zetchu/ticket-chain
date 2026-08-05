#!/bin/bash
set -u

# Run everything relative to the repo root, wherever this script is called from.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

VENV="$ROOT/network/.venv"
PIDS=()

echo "🚀 Starting TicketChain Development Environment..."

# Clear out anything left from a previous run before claiming the ports — an
# orphaned Hardhat node or Vite server would otherwise make this run fail in a
# way that looks like a broken app rather than a stale process.
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
# 0. Python environment for the P2P node
# ---------------------------------------------------------------------------
REQUIREMENTS="$ROOT/network/requirements.txt"
# Written after a successful install so its timestamp records which version of
# requirements.txt the venv actually holds.
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

# Reinstall whenever requirements.txt has moved on. Checking only for the
# venv's existence would leave anyone who ran this before a dependency bump
# silently pinned to the old versions.
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
# 2. Deploy contracts (refreshes the frontend ABI)
# ---------------------------------------------------------------------------
echo "⚙️ Deploying fresh smart contracts..."
if ! ( cd contracts && npx hardhat run scripts/deploy.js --network localhost ); then
  echo "❌ Deployment failed — see the output above"
  cleanup
fi

# ---------------------------------------------------------------------------
# 3. P2P node + HTTP API
# ---------------------------------------------------------------------------
echo "🌐 Starting P2P Network (logs routing to network.log)..."
# -u keeps stdout unbuffered: without it Python holds ~8KB back, so network.log
# stays empty (or stale) for most of a session and `tail -f` shows nothing.
( cd network && exec "$VENV/bin/python" -u main.py ) > network.log 2>&1 &
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
