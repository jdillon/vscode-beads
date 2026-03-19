#!/usr/bin/env bash
# Show status of vscode-server dev environment

set -euo pipefail

# Project identification - prefer git root for reliability
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null; then
  project_dir="$(git rev-parse --show-toplevel)"
else
  project_dir="$(pwd)"
fi
project_hash=$(echo "$project_dir" | md5sum | cut -c1-8)
tmp_dir="/tmp/vscode-dev-${project_hash}"

echo "=== Watch Mode ==="
if pgrep -f "bun run watch" > /dev/null; then
  pid=$(cat "$tmp_dir/watch.pid" 2>/dev/null || pgrep -f "bun run watch" | head -1)
  echo "Running (PID: $pid)"
else
  echo "Not running"
fi

echo "=== code-server ==="
if pgrep -f "code-server" > /dev/null; then
  port=$(cat "$tmp_dir/port" 2>/dev/null || echo "unknown")
  echo "Running (Port: $port)"
else
  echo "Not running"
fi
