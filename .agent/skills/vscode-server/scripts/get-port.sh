#!/usr/bin/env bash
# Return a validated port and explicit workspace URL for this worktree.

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lifecycle-common.sh
source "$script_dir/lifecycle-common.sh"

project_dir=$(project_root)
tmp_dir=$(state_dir_for "$project_dir")
if ! recorded_process_is_valid "$tmp_dir/code-server.pid" code-server "$project_dir"; then
  printf 'ERROR:no validated code-server process for %s\n' "$project_dir" >&2
  exit 1
fi
if [ ! -f "$tmp_dir/port" ]; then
  printf 'ERROR:port file not found at %s/port\n' "$tmp_dir" >&2
  exit 1
fi
IFS= read -r port < "$tmp_dir/port"
if ! port_is_ready "$port"; then
  printf 'ERROR:recorded port %s is not accepting requests\n' "$port" >&2
  exit 1
fi
printf 'CODE_SERVER_PORT:%s\n' "$port"
if [ -f "$tmp_dir/browser-url" ]; then
  printf 'BROWSER_URL:%s\n' "$(<"$tmp_dir/browser-url")"
fi
