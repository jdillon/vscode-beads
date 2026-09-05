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
  recorded_process_identity "$pid_file" "$kind" "$expected_dir" >/dev/null
}

# Darwin has no pidfd. Pair the PID with immutable process metadata so a
# recycled numeric PID never passes a later signal gate.
process_identity() {
  local pid=$1
  local identity

  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  identity=$(ps -p "$pid" -o lstart= -o command= 2>/dev/null) || return 1
  [ -n "$identity" ] || return 1
  printf '%s\t%s\n' "$pid" "$identity"
}

process_identity_is_current() {
  local identity=$1
  local pid
  local expected
  local current

  [[ "$identity" == *$'\t'* ]] || return 1
  pid=${identity%%$'\t'*}
  expected=${identity#*$'\t'}
  current=$(ps -p "$pid" -o lstart= -o command= 2>/dev/null) || return 1
  [[ "$current" == "$expected" ]]
}

recorded_process_identity() {
  local pid_file=$1
  local kind=$2
  local expected_dir=$3
  local pid
  local identity

  [ -f "$pid_file" ] || return 1
  IFS= read -r pid < "$pid_file"
  identity=$(process_identity "$pid") || return 1
  process_is_valid "$pid" "$kind" "$expected_dir" || return 1
  process_identity_is_current "$identity" || return 1
  printf '%s\n' "$identity"
}

port_is_ready() {
  local port=$1
  [[ "$port" =~ ^[0-9]+$ ]] || return 1
  curl --fail --silent --show-error --output /dev/null --max-time 2 \
    --noproxy '*' \
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

collect_descendant_identities() {
  local parent_identity=$1
  local pid
  local child
  local child_identity
  local child_parent

  [[ "$parent_identity" == *$'\t'* ]] || return 1
  pid=${parent_identity%%$'\t'*}
  process_identity_is_current "$parent_identity" || return 0
  while IFS= read -r child; do
    [ -n "$child" ] || continue
    child_identity=$(process_identity "$child") || continue
    child_parent=$(ps -p "$child" -o ppid= 2>/dev/null) || continue
    [[ "$child_parent" =~ ^[[:space:]]*$pid[[:space:]]*$ ]] || continue
    process_identity_is_current "$parent_identity" || continue
    collect_descendant_identities "$child_identity"
    printf '%s\n' "$child_identity"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
}

signal_process_identity() {
  local identity=$1
  local signal=$2
  local pid

  process_identity_is_current "$identity" || return 0
  pid=${identity%%$'\t'*}
  kill "-$signal" "$pid" 2>/dev/null
}

stop_process_tree() {
  local root_identity=$1
  local pid
  local identities
  local identity
  local attempt
  local signal_failed=false

  [[ "$root_identity" == *$'\t'* ]] || return 1
  pid=${root_identity%%$'\t'*}
  process_identity_is_current "$root_identity" || return 0
  identities=$(collect_descendant_identities "$root_identity")
  identities="${identities:+${identities}$'\n'}${root_identity}"

  while IFS= read -r identity; do
    [ -n "$identity" ] || continue
    signal_process_identity "$identity" TERM || signal_failed=true
  done <<< "$identities"
  [ "$signal_failed" = false ] || return 1

  for attempt in {1..20}; do
    if ! process_identity_is_current "$root_identity"; then
      return 0
    fi
    sleep 0.25
  done

  while IFS= read -r identity; do
    [ -n "$identity" ] || continue
    signal_process_identity "$identity" KILL || signal_failed=true
  done <<< "$identities"
  [ "$signal_failed" = false ] || return 1
  ! process_identity_is_current "$root_identity"
}
