#!/bin/bash
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

set -e

# Project identification
PROJECT_DIR="$(pwd)"
PROJECT_HASH=$(echo "$PROJECT_DIR" | md5sum | cut -c1-8)
TMP_DIR="/tmp/vscode-dev-${PROJECT_HASH}"

# Ensure clean temp directory
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

# Temp file paths
PORT_FILE="$TMP_DIR/port"
WATCH_PID_FILE="$TMP_DIR/watch.pid"
WATCH_LOG="$TMP_DIR/watch.log"

cleanup() {
  # Called on script exit - don't remove files, they're needed by status/reload
  # Files are cleaned up by stop command or next start
  :
}
trap cleanup EXIT

# Step 1: Validate package.json
if [[ ! -f package.json ]]; then
  echo "ERROR:package.json not found"
  exit 1
fi

PUBLISHER=$(jq -r '.publisher // empty' package.json)
NAME=$(jq -r '.name // empty' package.json)
VSCODE_ENGINE=$(jq -r '.engines.vscode // empty' package.json)

if [[ -z "$PUBLISHER" || -z "$NAME" || -z "$VSCODE_ENGINE" ]]; then
  echo "ERROR:Not a VS Code extension (missing publisher, name, or engines.vscode)"
  exit 1
fi

EXTENSION_ID="${PUBLISHER}.${NAME}-dev"
echo "EXTENSION_ID:$EXTENSION_ID"

# Step 2: Check/create symlink
EXTENSIONS_DIR="$HOME/.local/share/code-server/extensions"
SYMLINK_PATH="$EXTENSIONS_DIR/$EXTENSION_ID"

mkdir -p "$EXTENSIONS_DIR"
CURRENT_LINK=$(readlink "$SYMLINK_PATH" 2>/dev/null || echo "")

if [[ "$CURRENT_LINK" == "$PROJECT_DIR" ]]; then
  echo "SYMLINK:verified"
else
  ln -sf "$PROJECT_DIR" "$SYMLINK_PATH"
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
  bun run watch > "$WATCH_LOG" 2>&1 &
  WATCH_PID=$!
  echo "$WATCH_PID" > "$WATCH_PID_FILE"

  # Give it a moment to start, then verify it's still running
  sleep 1
  if ! kill -0 "$WATCH_PID" 2>/dev/null; then
    echo "ERROR:Watch mode failed to start"
    cat "$WATCH_LOG"
    exit 1
  fi
  echo "WATCH_PID:$WATCH_PID"
else
  WATCH_PID=$(pgrep -f "bun run watch" | head -1)
  echo "$WATCH_PID" > "$WATCH_PID_FILE"
  echo "WATCH_PID:$WATCH_PID"
fi

# Step 5: Start code-server (if not running)
if pgrep -f "code-server" > /dev/null; then
  # Already running, get port from existing file or detect
  if [[ -f "$PORT_FILE" ]]; then
    PORT=$(cat "$PORT_FILE")
  else
    CS_PID=$(pgrep -f "code-server" | head -1)
    PORT=$(lsof -p "$CS_PID" -i -P -n 2>/dev/null | grep LISTEN | awk '{print $9}' | cut -d: -f2 | head -1)
    echo "$PORT" > "$PORT_FILE"
  fi
  echo "CODE_SERVER_PORT:$PORT"
else
  # Start code-server and parse output for port
  code-server --auth none --port 0 "$PROJECT_DIR" 2>&1 | while IFS= read -r line; do
    echo "$line"
    if [[ "$line" == *"HTTP server listening on http://"* ]]; then
      PORT=$(echo "$line" | sed 's/.*:\([0-9]*\)\/.*/\1/')
      echo "$PORT" > "$PORT_FILE"
      echo "CODE_SERVER_PORT:$PORT"
    fi
  done
fi
