#!/usr/bin/env bash

# Resolve every existing component physically while preserving a missing tail.
# This exposes intermediate symlinks before a caller considers deletion.
physical_path_allowing_missing_tail() {
  local candidate=$1
  local probe
  local suffix=""
  local component
  local physical

  while [ "$candidate" != "/" ] && [ "${candidate%/}" != "$candidate" ]; do
    candidate=${candidate%/}
  done
  case "/$candidate/" in
    */../*) return 1 ;;
  esac

  probe=$candidate
  while [ ! -e "$probe" ]; do
    component=${probe##*/}
    [ -n "$component" ] || return 1
    suffix="/$component$suffix"
    probe=${probe%/*}
    [ -n "$probe" ] || probe=/
  done
  [ -d "$probe" ] || return 1
  physical=$(cd "$probe" && pwd -P) || return 1
  printf '%s%s\n' "$physical" "$suffix"
}

safe_fixture_target() {
  local requested=$1
  local project_dir=$2
  local absolute
  local physical_target
  local physical_project
  local physical_system_tmp

  case "$requested" in
    /*) absolute=$requested ;;
    *) absolute="$PWD/$requested" ;;
  esac

  physical_target=$(physical_path_allowing_missing_tail "$absolute") || {
    printf "ERROR:could not resolve target '%s'\n" "$requested" >&2
    return 1
  }
  physical_project=$(cd "$project_dir" && pwd -P) || return 1
  physical_system_tmp=$(cd /tmp && pwd -P) || return 1

  case "$physical_target" in
    "$physical_project/tmp/"*|"$physical_system_tmp/"*) ;;
    *)
      printf "ERROR:target must remain under '%s/tmp' or '%s'; got '%s'\n" \
        "$physical_project" "$physical_system_tmp" "$physical_target" >&2
      return 1
      ;;
  esac
  printf '%s\n' "$physical_target"
}
