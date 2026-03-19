#!/usr/bin/env bash
# Start complete VS Code extension development environment
#
# Usage: start-dev-environment.sh
#
# Output format (parsed by vscode-server skill):
#   EXTENSION_ID:<publisher>.<name>-dev
#   SYMLINK:<created|verified>
#   BUILD:<success|failed>
#   WATCH_PID:<pid>
#   CODE_SERVER_PORT:<port>
#   ERROR:<message>  (only on failure)
#
# Temp files stored in /tmp/vscode-dev-<project-hash>/

set -euo pipefail

# Project identification - prefer git root for reliability
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null; then
  project_dir="$(git rev-parse --show-toplevel)"
else
  project_dir="$(pwd)"
fi
project_hash=$(echo "$project_dir" | md5sum | cut -c1-8)
tmp_dir="/tmp/vscode-dev-${project_hash}"

# Ensure clean temp directory
rm -rf "$tmp_dir"
mkdir -p "$tmp_dir"

# Temp file paths
port_file="$tmp_dir/port"
watch_pid_file="$tmp_dir/watch.pid"
watch_log="$tmp_dir/watch.log"

# Step 1: Validate package.json
if [[ ! -f package.json ]]; then
  echo "ERROR:package.json not found"
  exit 1
fi

publisher=$(jq -r '.publisher // empty' package.json)
name=$(jq -r '.name // empty' package.json)
vscode_engine=$(jq -r '.engines.vscode // empty' package.json)

if [[ -z "$publisher" || -z "$name" || -z "$vscode_engine" ]]; then
  echo "ERROR:Not a VS Code extension (missing publisher, name, or engines.vscode)"
  exit 1
fi

extension_id="${publisher}.${name}-dev"
echo "EXTENSION_ID:$extension_id"

# Step 2: Check/create symlink
extensions_dir="$HOME/.local/share/code-server/extensions"
symlink_path="$extensions_dir/$extension_id"

mkdir -p "$extensions_dir"
current_link=$(readlink "$symlink_path" 2>/dev/null || echo "")

if [[ "$current_link" == "$project_dir" ]]; then
  echo "SYMLINK:verified"
else
  ln -sf "$project_dir" "$symlink_path"
  echo "SYMLINK:created"
fi

# Step 3: Build
if bun run compile:quiet 2>&1; then
  echo "BUILD:success"
else
  echo "BUILD:failed"
  echo "ERROR:Build failed"
  exit 1
fi

# Step 4: Start watch mode (if not running)
if ! pgrep -f "bun run watch" > /dev/null; then
  bun run watch > "$watch_log" 2>&1 &
  watch_pid=$!
  echo "$watch_pid" > "$watch_pid_file"

  # Give it a moment to start, then verify it's still running
  sleep 1
  if ! kill -0 "$watch_pid" 2>/dev/null; then
    echo "ERROR:Watch mode failed to start"
    cat "$watch_log"
    exit 1
  fi
  echo "WATCH_PID:$watch_pid"
else
  watch_pid=$(pgrep -f "bun run watch" | head -1)
  echo "$watch_pid" > "$watch_pid_file"
  echo "WATCH_PID:$watch_pid"
fi

# Step 5: Start code-server (if not running)
if pgrep -f "code-server" > /dev/null; then
  # Already running, get port from existing file or detect
  if [[ -f "$port_file" ]]; then
    port=$(cat "$port_file")
  else
    cs_pid=$(pgrep -f "code-server" | head -1)
    port=$(lsof -p "$cs_pid" -i -P -n 2>/dev/null | grep LISTEN | awk '{print $9}' | cut -d: -f2 | head -1)
    echo "$port" > "$port_file"
  fi
  echo "CODE_SERVER_PORT:$port"
else
  # Start code-server and parse output for port
  code-server --auth none --port 0 "$project_dir" 2>&1 | while IFS= read -r line; do
    echo "$line"
    if [[ "$line" == *"HTTP server listening on http://"* ]]; then
      port=$(echo "$line" | sed 's/.*:\([0-9]*\)\/.*/\1/')
      echo "$port" > "$port_file"
      echo "CODE_SERVER_PORT:$port"
    fi
  done
fi
