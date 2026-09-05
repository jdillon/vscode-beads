#!/usr/bin/env bash
# Report only state owned by the current worktree.

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lifecycle-common.sh
source "$script_dir/lifecycle-common.sh"

project_dir=$(project_root)
tmp_dir=$(state_dir_for "$project_dir")
owner_dir="/tmp/vscode-beads-dev-owner"
extension_id=$(jq -r '"\(.publisher).\(.name)-dev"' "$project_dir/package.json")
symlink_path="$HOME/.local/share/code-server/extensions/$extension_id"

printf 'PROJECT_DIR:%s\nSTATE_DIR:%s\n' "$project_dir" "$tmp_dir"
if [ -f "$owner_dir/project" ]; then
  IFS= read -r owner < "$owner_dir/project"
  if [ "$owner" = "$project_dir" ]; then
    printf 'OWNER:current\n'
  elif project_has_live_environment "$owner"; then
    printf 'OWNER:other\nOWNER_PROJECT:%s\n' "$owner"
  else
    printf 'OWNER:stale\nOWNER_PROJECT:%s\n' "$owner"
  fi
else
  printf 'OWNER:none\n'
fi

actual_link=$(readlink "$symlink_path" 2>/dev/null || true)
if [ "$actual_link" = "$project_dir" ]; then
  printf 'SYMLINK:verified\n'
elif [ -n "$actual_link" ]; then
  printf 'SYMLINK:other\n'
else
  printf 'SYMLINK:missing\n'
fi
printf 'SYMLINK_TARGET:%s\n' "$actual_link"

if recorded_process_is_valid "$tmp_dir/watch.pid" watch "$project_dir"; then
  IFS= read -r watch_pid < "$tmp_dir/watch.pid"
  printf 'WATCH:running\nWATCH_PID:%s\nWATCH_LOG:%s\n' "$watch_pid" "$tmp_dir/watch.log"
elif [ -f "$tmp_dir/watch.pid" ]; then
  printf 'WATCH:stale\n'
else
  printf 'WATCH:stopped\n'
fi

if recorded_process_is_valid "$tmp_dir/code-server.pid" code-server "$project_dir"; then
  IFS= read -r code_server_pid < "$tmp_dir/code-server.pid"
  printf 'CODE_SERVER:running\nCODE_SERVER_PID:%s\n' "$code_server_pid"
  if [ -f "$tmp_dir/port" ]; then
    IFS= read -r port < "$tmp_dir/port"
    if port_is_ready "$port"; then
      printf 'CODE_SERVER_PORT:%s\nPORT:ready\n' "$port"
    else
      printf 'CODE_SERVER_PORT:%s\nPORT:stale\n' "$port"
    fi
  else
    printf 'PORT:missing\n'
  fi
  printf 'CODE_SERVER_LOG:%s\n' "$tmp_dir/code-server.log"
elif [ -f "$tmp_dir/code-server.pid" ]; then
  printf 'CODE_SERVER:stale\n'
else
  printf 'CODE_SERVER:stopped\n'
fi

[ -f "$tmp_dir/workspace-mode" ] && printf 'WORKSPACE_MODE:%s\n' "$(<"$tmp_dir/workspace-mode")"
[ -f "$tmp_dir/workspace-dir" ] && printf 'WORKSPACE_DIR:%s\n' "$(<"$tmp_dir/workspace-dir")"
[ -f "$tmp_dir/browser-url" ] && printf 'BROWSER_URL:%s\n' "$(<"$tmp_dir/browser-url")"
[ -f "$tmp_dir/start.log" ] && printf 'START_LOG:%s\n' "$tmp_dir/start.log"
exit 0
