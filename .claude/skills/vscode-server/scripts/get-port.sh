#!/usr/bin/env bash
# Get the code-server port from temp file

set -euo pipefail

# Project identification - prefer git root for reliability
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null; then
  project_dir="$(git rev-parse --show-toplevel)"
else
  project_dir="$(pwd)"
fi
project_hash=$(echo "$project_dir" | md5sum | cut -c1-8)
tmp_dir="/tmp/vscode-dev-${project_hash}"
port_file="$tmp_dir/port"

if [[ -f "$port_file" ]]; then
  cat "$port_file"
else
  echo "ERROR:port file not found at $port_file" >&2
  exit 1
fi
