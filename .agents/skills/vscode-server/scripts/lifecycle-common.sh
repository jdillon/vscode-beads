#!/usr/bin/env bash

project_root() {
  local root
  root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  realpath "$root"
}

state_dir_for() {
  local project_dir=$1
  local project_hash
  # Preserve the original state-directory contract, including the newline.
  project_hash=$(printf '%s\n' "$project_dir" | md5sum | cut -c1-8)
  printf '/tmp/vscode-dev-%s\n' "$project_hash"
}

process_cwd() {
  local pid=$1
  local cwd
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | while IFS= read -r line; do
    case "$line" in
      n*) printf '%s\n' "${line#n}"; break ;;
    esac
  done)
  [ -n "$cwd" ] && realpath "$cwd"
}

process_is_valid() {
  local pid=$1
  local kind=$2
  local expected_dir=$3
  local command
  local cwd

  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  command=$(ps -p "$pid" -o command= 2>/dev/null) || return 1
  case "$kind" in
    watch) [[ "$command" == *"bun run watch"* ]] || return 1 ;;
    code-server) [[ "$command" == *"code-server"* ]] || return 1 ;;
    *) return 1 ;;
  esac
  cwd=$(process_cwd "$pid") || return 1
  [[ "$cwd" == "$expected_dir" ]]
}

recorded_process_is_valid() {
  local pid_file=$1
  local kind=$2
  local expected_dir=$3
  local pid

  [ -f "$pid_file" ] || return 1
  IFS= read -r pid < "$pid_file"
  process_is_valid "$pid" "$kind" "$expected_dir"
}

port_is_ready() {
  local port=$1
  [[ "$port" =~ ^[0-9]+$ ]] || return 1
  curl --fail --silent --show-error --output /dev/null --max-time 2 \
    "http://127.0.0.1:${port}/"
}

project_has_live_environment() {
  local expected_dir=$1
  local state_dir
  state_dir=$(state_dir_for "$expected_dir")
  recorded_process_is_valid "$state_dir/watch.pid" watch "$expected_dir" || \
    recorded_process_is_valid "$state_dir/code-server.pid" code-server "$expected_dir"
}

acquire_owner() {
  local expected_dir=$1
  local owner_dir=$2
  local owner=""

  if mkdir "$owner_dir" 2>/dev/null; then
    printf '%s\n' "$expected_dir" > "$owner_dir/project"
    return 0
  fi

  [ -f "$owner_dir/project" ] && IFS= read -r owner < "$owner_dir/project"
  if [ "$owner" = "$expected_dir" ]; then
    return 0
  fi
  if [ -n "$owner" ] && project_has_live_environment "$owner"; then
    printf 'ERROR:development environment is owned by %s; run %s/.agents/skills/vscode-server/scripts/stop.sh first\n' \
      "$owner" "$owner"
    return 1
  fi

  rm -rf "$owner_dir"
  if ! mkdir "$owner_dir" 2>/dev/null; then
    printf 'ERROR:could not acquire development environment owner lock at %s\n' "$owner_dir"
    return 1
  fi
  printf '%s\n' "$expected_dir" > "$owner_dir/project"
}

collect_process_tree() {
  local pid=$1
  local child
  while IFS= read -r child; do
    [ -n "$child" ] || continue
    collect_process_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  printf '%s\n' "$pid"
}

stop_process_tree() {
  local pid=$1
  local pids
  local candidate
  local attempt

  pids=$(collect_process_tree "$pid")
  # All candidates are descendants of the validated root at collection time.
  kill -TERM $pids 2>/dev/null || true
  for attempt in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.25
  done
  for candidate in $pids; do
    kill -KILL "$candidate" 2>/dev/null || true
  done
  ! kill -0 "$pid" 2>/dev/null
}
