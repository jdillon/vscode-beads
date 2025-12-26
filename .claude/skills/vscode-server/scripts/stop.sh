#!/usr/bin/env bash
# Stop vscode-server dev environment

set -euo pipefail

# Project identification - prefer git root for reliability
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null; then
  project_dir="$(git rev-parse --show-toplevel)"
else
  project_dir="$(pwd)"
fi
project_hash=$(echo "$project_dir" | md5sum | cut -c1-8)
tmp_dir="/tmp/vscode-dev-${project_hash}"

pkill -f "bun run watch" && echo "Watch mode stopped" || echo "Watch mode was not running"
pkill -f "code-server" && echo "code-server stopped" || echo "code-server was not running"

# Clean up temp files
rm -rf "$tmp_dir" && echo "Temp files cleaned up"
