#!/usr/bin/env bash
# Start the worktree-owned code-server development environment.
# Usage: start-dev-environment.sh [--workspace fixture|source|no-project] [--server]

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lifecycle-common.sh
source "$script_dir/lifecycle-common.sh"

project_dir=$(project_root)
cd "$project_dir"
tmp_dir=$(state_dir_for "$project_dir")
owner_dir="/tmp/vscode-beads-dev-owner"
start_log="$tmp_dir/start.log"
watch_log="$tmp_dir/watch.log"
watch_pid_file="$tmp_dir/watch.pid"
code_server_log="$tmp_dir/code-server.log"
code_server_pid_file="$tmp_dir/code-server.pid"
port_file="$tmp_dir/port"
browser_url_file="$tmp_dir/browser-url"
workspace_dir_file="$tmp_dir/workspace-dir"
workspace_mode_file="$tmp_dir/workspace-mode"
workspace_mode="fixture"
fixture_mode="embedded"

while [ $# -gt 0 ]; do
  case "$1" in
    --workspace)
      [ $# -ge 2 ] || { printf 'ERROR:--workspace requires fixture, source, or no-project\n'; exit 1; }
      workspace_mode=$2
      shift 2
      ;;
    --server) fixture_mode="server"; shift ;;
    -h|--help)
      printf 'Usage: %s [--workspace fixture|source|no-project] [--server]\n' "$0"
      exit 0
      ;;
    *) printf 'ERROR:unknown option %s\n' "$1"; exit 1 ;;
  esac
done

case "$workspace_mode" in
  fixture|source|no-project) ;;
  *) printf 'ERROR:unknown workspace mode %s\n' "$workspace_mode"; exit 1 ;;
esac
if [ "$fixture_mode" = "server" ] && [ "$workspace_mode" != "fixture" ]; then
  printf 'ERROR:--server is only valid with --workspace fixture\n'
  exit 1
fi

mkdir -p "$tmp_dir"
: > "$start_log"
exec > >(tee -a "$start_log") 2>&1

for tool in bun code-server curl git jq lsof md5sum nohup perl realpath; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'ERROR:%s not found on PATH\n' "$tool"
    exit 1
  fi
done
printf 'START_LOG:%s\n' "$start_log"

publisher=$(jq -r '.publisher // empty' package.json)
name=$(jq -r '.name // empty' package.json)
vscode_engine=$(jq -r '.engines.vscode // empty' package.json)
if [ -z "$publisher" ] || [ -z "$name" ] || [ -z "$vscode_engine" ]; then
  printf 'ERROR:not a VS Code extension (missing publisher, name, or engines.vscode)\n'
  exit 1
fi
extension_id="${publisher}.${name}-dev"
extensions_dir="$HOME/.local/share/code-server/extensions"
symlink_path="$extensions_dir/$extension_id"
current_link=$(readlink "$symlink_path" 2>/dev/null || true)
if [ -n "$current_link" ] && [ "$current_link" != "$project_dir" ] && \
    project_has_live_environment "$current_link"; then
  printf 'ERROR:extension symlink is owned by live environment %s; run %s/.agent/skills/vscode-server/scripts/stop.sh first\n' \
    "$current_link" "$current_link"
  exit 1
fi

case "$workspace_mode" in
  fixture)
    fixture_args=("$project_dir/tmp/bd-test-fixture")
    [ "$fixture_mode" = "server" ] && fixture_args=(--server "${fixture_args[@]}")
    fixture_output=$("$script_dir/make-test-fixture.sh" "${fixture_args[@]}") || {
        printf '%s\n' "$fixture_output"
        exit 1
      }
    printf '%s\n' "$fixture_output"
    workspace_dir=$(printf '%s\n' "$fixture_output" | perl -ne 'print $1 if /^FIXTURE_DIR:(.+)$/')
    fixture_count=$(printf '%s\n' "$fixture_output" | perl -ne 'print $1 if /^FIXTURE_BEADS:(\d+)$/')
    reported_mode=$(printf '%s\n' "$fixture_output" | perl -ne 'print $1 if /^FIXTURE_MODE:(.+)$/')
    if [ "$fixture_count" != "23" ] || [ "$reported_mode" != "$fixture_mode" ] || [ ! -d "$workspace_dir/.beads" ]; then
      printf 'ERROR:fixture readiness check failed (mode=%s beads=%s dir=%s)\n' \
        "$reported_mode" "$fixture_count" "$workspace_dir"
      exit 1
    fi
    ;;
  source)
    workspace_dir="$project_dir"
    ;;
  no-project)
    workspace_dir="$project_dir/tmp/beads-fixture-noproject"
    rm -rf "$workspace_dir"
    mkdir -p "$workspace_dir/.vscode"
    printf '{"beads.pathToBd":"tools/bd"}\n' > "$workspace_dir/.vscode/settings.json"
    ;;
esac

printf 'PROJECT_DIR:%s\n' "$project_dir"
printf 'STATE_DIR:%s\n' "$tmp_dir"
printf 'WORKSPACE_MODE:%s\n' "$workspace_mode"
printf 'WORKSPACE_DIR:%s\n' "$workspace_dir"
printf '%s\n' "$workspace_dir" > "$workspace_dir_file"
printf '%s\n' "$workspace_mode" > "$workspace_mode_file"

if bun run compile:quiet; then
  printf 'BUILD:success\n'
else
  printf 'BUILD:failed\nERROR:build failed\n'
  exit 1
fi

acquire_owner "$project_dir" "$owner_dir"
printf 'OWNER:%s\n' "$project_dir"

mkdir -p "$extensions_dir"
if [ -e "$symlink_path" ] && [ ! -L "$symlink_path" ]; then
  printf 'ERROR:%s exists and is not a symlink; remove it first\n' "$symlink_path"
  exit 1
fi
current_link=$(readlink "$symlink_path" 2>/dev/null || true)
if [ "$current_link" = "$project_dir" ]; then
  printf 'SYMLINK:verified\n'
else
  ln -sfn "$project_dir" "$symlink_path"
  printf 'SYMLINK:created\n'
fi
actual_link=$(readlink "$symlink_path" 2>/dev/null || true)
if [ "$actual_link" != "$project_dir" ]; then
  printf 'ERROR:symlink %s points to %s, expected %s\n' \
    "$symlink_path" "$actual_link" "$project_dir"
  exit 1
fi
printf 'EXTENSION_ID:%s\nSYMLINK_TARGET:%s\n' "$extension_id" "$actual_link"

if recorded_process_is_valid "$watch_pid_file" watch "$project_dir"; then
  IFS= read -r watch_pid < "$watch_pid_file"
  printf 'WATCH:reused\n'
else
  rm -f "$watch_pid_file"
  : > "$watch_log"
  nohup bun run watch > "$watch_log" 2>&1 &
  watch_pid=$!
  printf '%s\n' "$watch_pid" > "$watch_pid_file"
  sleep 1
  if ! process_is_valid "$watch_pid" watch "$project_dir"; then
    printf 'ERROR:watch mode failed to start; see %s\n' "$watch_log"
    exit 1
  fi
  printf 'WATCH:started\n'
fi
printf 'WATCH_PID:%s\nWATCH_LOG:%s\n' "$watch_pid" "$watch_log"

code_server_reused=false
if recorded_process_is_valid "$code_server_pid_file" code-server "$project_dir"; then
  IFS= read -r code_server_pid < "$code_server_pid_file"
  if [ -f "$port_file" ]; then
    IFS= read -r port < "$port_file"
    if port_is_ready "$port"; then
      code_server_reused=true
    fi
  fi
  if [ "$code_server_reused" != true ]; then
    printf 'ERROR:recorded code-server process is alive but its port is not ready; run %s/stop.sh\n' "$script_dir"
    exit 1
  fi
fi

if [ "$code_server_reused" = true ]; then
  printf 'CODE_SERVER:reused\n'
else
  rm -f "$code_server_pid_file" "$port_file"
  : > "$code_server_log"
  nohup code-server --auth none --bind-addr 127.0.0.1:0 > "$code_server_log" 2>&1 &
  code_server_pid=$!
  printf '%s\n' "$code_server_pid" > "$code_server_pid_file"
  port=""
  for _ in {1..40}; do
    if ! process_is_valid "$code_server_pid" code-server "$project_dir"; then
      printf 'ERROR:code-server failed to start; see %s\n' "$code_server_log"
      exit 1
    fi
    port=$(perl -ne '$last=$1 if /HTTP server listening on http:\/\/[^:]+:(\d+)\//; END { print "$last\n" if defined $last }' \
      "$code_server_log")
    if [ -n "$port" ] && port_is_ready "$port"; then
      break
    fi
    port=""
    sleep 0.5
  done
  if [ -z "$port" ]; then
    printf 'ERROR:code-server port did not become ready; see %s\n' "$code_server_log"
    exit 1
  fi
  printf '%s\n' "$port" > "$port_file"
  printf 'CODE_SERVER:started\n'
fi

workspace_encoded=$(jq -rn --arg value "$workspace_dir" '$value | @uri')
browser_url="http://127.0.0.1:${port}/?folder=${workspace_encoded}"
printf '%s\n' "$browser_url" > "$browser_url_file"
printf 'CODE_SERVER_PID:%s\n' "$code_server_pid"
printf 'CODE_SERVER_PORT:%s\n' "$port"
printf 'CODE_SERVER_LOG:%s\n' "$code_server_log"
printf 'BROWSER_URL:%s\n' "$browser_url"
printf 'READY:true\n'
