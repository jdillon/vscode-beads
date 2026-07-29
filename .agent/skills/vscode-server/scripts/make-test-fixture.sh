#!/usr/bin/env bash
#
# Create a throwaway beads project with known, complete state for UI testing.
#
# Why this exists: testing the extension against a real project's database is
# unreliable (it may lack the statuses/types under test, and it may be mid
# schema-migration and refuse writes). Never mutate a real database to produce
# test data - build a fixture instead.
#
# Usage:
#   make-test-fixture.sh [target-dir]        # default: /tmp/bd-test-fixture
#
# Output (parse these):
#   FIXTURE_DIR:<path>
#   FIXTURE_BEADS:<count>
#   ERROR:<message>
#
# The fixture uses embedded Dolt (bd init default), which exercises the CLI
# backend. For the Dolt SQL backend, re-init with --server.

set -euo pipefail

target_dir="${1:-/tmp/bd-test-fixture}"
prefix="fixture"

if ! command -v bd >/dev/null 2>&1; then
  echo "ERROR:bd not found on PATH"
  exit 1
fi

rm -rf "$target_dir"
mkdir -p "$target_dir"
cd "$target_dir"
git init -q .

if ! bd init --prefix "$prefix" --non-interactive >/dev/null 2>&1; then
  echo "ERROR:bd init failed in $target_dir"
  exit 1
fi

new() { # new <type> <priority> <title>
  bd create --title "$3" --type "$1" --priority "$2" --silent
}

# --- issue types: every bd built-in the extension styles -------------------
t_task=$(new task 1 "Task - blocker")
t_task2=$(new task 2 "Task - blocked by the blocker")
new bug 0 "Bug bead" >/dev/null
new feature 2 "Feature bead" >/dev/null
new epic 0 "Epic bead" >/dev/null
new chore 3 "Chore bead" >/dev/null
new decision 2 "Decision bead" >/dev/null
new spike 3 "Spike bead" >/dev/null
new story 2 "Story bead" >/dev/null
new milestone 1 "Milestone bead" >/dev/null

# --- dependency: gives the Details panel a non-empty BLOCKS list -----------
# (bd only allows task->task blocking, hence two tasks above)
bd dep add "$t_task2" "$t_task" --type blocks >/dev/null

# --- statuses: every bd built-in, plus a user-defined one ------------------
s_deferred=$(new task 1 "Status: deferred")
bd defer "$s_deferred" --reason "fixture" >/dev/null

s_pinned=$(new task 2 "Status: pinned")
bd update "$s_pinned" --status pinned >/dev/null

s_hooked=$(new task 1 "Status: hooked")
bd update "$s_hooked" --status hooked >/dev/null

s_blocked=$(new task 2 "Status: blocked")
bd update "$s_blocked" --status blocked >/dev/null

s_wip=$(new task 2 "Status: in progress")
bd update "$s_wip" --status in_progress >/dev/null

s_closed=$(new task 3 "Status: closed")
bd close "$s_closed" --reason "fixture" >/dev/null

# Custom status must be registered before it can be assigned.
bd config set status.custom "awaiting_review" >/dev/null
s_custom=$(new task 3 "Status: custom (awaiting_review)")
bd update "$s_custom" --status awaiting_review >/dev/null

# --- a comment, so the Details comments section is non-empty ---------------
bd comments add "$t_task" "Fixture comment" >/dev/null

count=$(bd list --all --limit 0 --json | grep -c '"id"' || true)
echo "FIXTURE_DIR:$target_dir"
echo "FIXTURE_BEADS:$count"
