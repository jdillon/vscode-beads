#!/usr/bin/env bash
# Stop only processes recorded and validated for the current worktree.

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lifecycle-common.sh
source "$script_dir/lifecycle-common.sh"

project_dir=$(project_root)
tmp_dir=$(state_dir_for "$project_dir")
owner_dir="/tmp/vscode-beads-dev-owner"
stop_failed=false

stop_recorded() {
  local kind=$1
  local pid_file=$2
  local label=$3
  local pid

  if recorded_process_is_valid "$pid_file" "$kind" "$project_dir"; then
    IFS= read -r pid < "$pid_file"
    if stop_process_tree "$pid"; then
      printf '%s:stopped\n' "$label"
    else
      printf 'ERROR:failed to stop %s PID %s\n' "$label" "$pid"
      stop_failed=true
    fi
  elif [ -f "$pid_file" ]; then
    printf '%s:stale-not-stopped\n' "$label"
  else
    printf '%s:not-running\n' "$label"
  fi
}

printf 'PROJECT_DIR:%s\nSTATE_DIR:%s\n' "$project_dir" "$tmp_dir"
stop_recorded code-server "$tmp_dir/code-server.pid" CODE_SERVER
stop_recorded watch "$tmp_dir/watch.pid" WATCH

if [ "$stop_failed" = true ]; then
  printf 'ERROR:state retained because one or more processes did not stop\n'
  exit 1
fi

rm -rf "$tmp_dir"
if [ -f "$owner_dir/project" ]; then
  IFS= read -r owner < "$owner_dir/project"
  [ "$owner" != "$project_dir" ] || rm -rf "$owner_dir"
fi
printf 'STATE:removed\n'
