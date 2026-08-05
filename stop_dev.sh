#!/bin/bash
set -u

# Stop every TicketChain service, whether it was started by start_dev.sh,
# start_demo.sh, or by hand in a separate terminal.
#
# Ctrl+C in the start script already shuts down what that script spawned, but a
# service started separately — or one orphaned by a closed terminal — keeps
# holding its port, which then looks like a broken app rather than a stale
# process. This targets the ports the stack owns rather than matching on process
# names, so it can never take out an unrelated editor or shell that happens to
# have "node" or "python" in its command line.
#
# Safe to run when nothing is up: it reports that and exits 0.
#
# Usage: ./stop_dev.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Hardhat JSON-RPC, node HTTP APIs (second node uses 8081), Vite (and the port
# it falls back to if 5173 was taken before strictPort was set).
TCP_PORTS=(8545 8080 8081 5173 5174)
# IPv8 overlay sockets for node A and node B.
UDP_PORTS=(8090 8091)

stopped=0

# Ask politely, then insist. Anything still alive after the grace period is
# almost certainly ignoring SIGTERM, and leaving it running defeats the point.
#
# PIDs arrive as positional arguments rather than an array: macOS ships bash
# 3.2, where expanding an empty array under `set -u` is an error, and most calls
# here pass nothing because most ports are free.
stop_pids() {
  local label=$1
  shift
  if [ $# -eq 0 ]; then
    return 0
  fi

  echo "  stopping $label (pid $*)"
  kill "$@" 2>/dev/null

  for _ in $(seq 1 20); do
    local alive=0
    for pid in "$@"; do
      if kill -0 "$pid" 2>/dev/null; then alive=1; fi
    done
    [ "$alive" -eq 0 ] && break
    sleep 0.25
  done

  for pid in "$@"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "    still alive — forcing"
      kill -9 "$pid" 2>/dev/null
    fi
  done

  stopped=$((stopped + $#))
}

echo "🛑 Stopping TicketChain services..."

for port in "${TCP_PORTS[@]}"; do
  # Listeners only: an inbound connection to the port must not be mistaken for
  # the server itself. Unquoted on purpose — no matches must expand to no
  # arguments, not to one empty one.
  stop_pids "port $port" $(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null)
done

for port in "${UDP_PORTS[@]}"; do
  stop_pids "P2P port $port" $(lsof -ti "udp:$port" 2>/dev/null)
done

# A P2P node whose ports were overridden (TICKETCHAIN_API_PORT, a custom UDP
# port) would survive the sweep above, so also catch anything running out of
# this repo's virtualenv. Scoped to the venv path, so a Python process from any
# other project is untouched.
stop_pids "P2P node (repo venv)" $(pgrep -f "^$ROOT/network/.venv/bin/python" 2>/dev/null)

echo ""
if [ "$stopped" -eq 0 ]; then
  echo "✅ Nothing was running."
else
  echo "✅ Stopped $stopped process(es)."
fi
