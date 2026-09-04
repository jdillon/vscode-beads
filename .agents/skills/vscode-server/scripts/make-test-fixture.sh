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
#   make-test-fixture.sh [--server] [target-dir]   # default: tmp/bd-test-fixture
#
# Fixtures belong in the repo's gitignored `tmp/`, not the system /tmp. Relative
# targets resolve against the current directory, so run this from the repo root.
#
#   --server   Use an external dolt sql-server (bd manages it) instead of the
#              embedded engine. Embedded exercises the CLI backend; --server
#              exercises the Dolt SQL backend. Both paths need testing before a
#              release. Tear a server fixture down with `bd dolt stop` from the
#              fixture directory.
#
# Output (parse these):
#   FIXTURE_DIR:<path>
#   FIXTURE_MODE:<embedded|server>
#   FIXTURE_BEADS:<count>
#   ERROR:<message>
#
# What it covers - see docs/code-server-testing.md for the verification pass:
#   every issue type the extension styles, every bd built-in status plus a
#   custom one, all four dependency types, priorities P0-P4, a fully populated
#   bead (markdown description, design, acceptance, notes, labels, assignee,
#   estimate, external ref, due date), multi-author comments, and beads of the
#   types bd hides by default.

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=fixture-common.sh
source "$script_dir/fixture-common.sh"
project_dir=$(git -C "$script_dir" rev-parse --show-toplevel)
mode="embedded"
target_dir=""

while [ $# -gt 0 ]; do
  case "$1" in
    --server) mode="server"; shift ;;
    -h|--help) sed -n '3,29p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "ERROR:unknown option '$1'"; exit 1 ;;
    *) target_dir="$1"; shift ;;
  esac
done
target_dir=$(safe_fixture_target "${target_dir:-tmp/bd-test-fixture}" "$project_dir")
prefix="fixture"

for tool in bd jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR:$tool not found on PATH"
    exit 1
  fi
done

# Only reuse a path that is absent or already a fixture this script created.
if [ -e "$target_dir" ] && [ ! -d "$target_dir/.beads" ]; then
  echo "ERROR:'$target_dir' exists and is not a bd fixture; refusing to delete it"
  exit 1
fi

# A server-mode fixture leaves a dolt sql-server running against the old data
# directory; stop it before the directory goes away.
if [ -d "$target_dir/.beads" ]; then
  (cd "$target_dir" && bd dolt stop >/dev/null 2>&1) || true
fi

rm -rf -- "$target_dir"
mkdir -p "$target_dir"
cd "$target_dir"
git init -q .

# Without this, a fixture created inside another beads project inherits that
# project's config - `bd init` walks up and lands in shared-server mode, so the
# embedded fixture silently is not embedded. Pinning BEADS_DIR stops the walk.
export BEADS_DIR="$target_dir/.beads"

init_args=(--prefix "$prefix" --non-interactive)
[ "$mode" = "server" ] && init_args+=(--server)
if ! bd init "${init_args[@]}" >/dev/null 2>&1; then
  echo "ERROR:bd init failed in $target_dir (mode=$mode)"
  exit 1
fi

new() { # new <type> <priority> <title>
  bd create --title "$3" --type "$1" --priority "$2" --silent
}

# --- issue types: every built-in the extension gives a label, color and icon --
t_task=$(new task 1 "Task - blocker")
t_task2=$(new task 2 "Task - blocked by the blocker")
t_bug=$(new bug 0 "Bug bead - P0, critical")
new chore 3 "Chore bead - P3" >/dev/null
new decision 2 "Decision bead" >/dev/null
new spike 3 "Spike bead" >/dev/null
new story 2 "Story bead" >/dev/null
new milestone 1 "Milestone bead" >/dev/null
new event 4 "Event bead - P4, backlog" >/dev/null
new molecule 2 "Molecule bead" >/dev/null

# Types bd hides from a default `bd list`. Both backends should agree and keep
# these out of the issue list; if one shows up in the UI, that is the bug.
new gate 2 "Gate bead - should NOT appear in the issue list" >/dev/null
new message 2 "Message bead - should NOT appear in the issue list" >/dev/null

# --- a fully populated bead: every Details panel section is non-empty ---------
rich=$(bd create --title "Rich bead - every field populated" \
  --type feature --priority 0 \
  --assignee jdillon \
  --labels ui,release-test,markdown \
  --estimate 90 \
  --external-ref gh-76 \
  --due +2w \
  --description "$(cat <<'MD'
## Overview

This bead exists to exercise **markdown rendering** in the Details panel.

- bullet one
- bullet two with `inline code`
- [a link](https://github.com/jdillon/vscode-beads)

```ts
const check = (s: string) => s.trim().length > 0;
```

> Blockquote, to confirm it is styled.
MD
)" \
  --design "$(cat <<'MD'
Renders through the same markdown path as the description.

1. numbered
2. list
MD
)" \
  --acceptance "$(cat <<'MD'
- [ ] Description renders as markdown
- [ ] Design, acceptance and notes sections all appear
- [ ] Labels, assignee, estimate and external ref show in the header
MD
)" \
  --notes "Notes field. Should render below acceptance criteria." \
  --silent)

# --- hierarchy: an epic with children (exercises parent-child) ----------------
epic=$(new epic 0 "Epic bead - has two children")
bd create --title "Child of the epic - first" --type task --priority 2 --parent "$epic" --silent >/dev/null
bd create --title "Child of the epic - second" --type task --priority 3 --parent "$epic" --silent >/dev/null

# --- dependencies: all four types the extension renders -----------------------
# (bd only allows task->task blocking, hence the two tasks above)
bd dep add "$t_task2" "$t_task" --type blocks >/dev/null
d_related=$(new task 2 "Related to the rich bead")
bd dep add "$d_related" "$rich" --type related >/dev/null
d_found=$(new bug 1 "Discovered while working the blocker")
bd dep add "$d_found" "$t_task" --type discovered-from >/dev/null

# --- statuses: every bd built-in, plus a user-defined one ---------------------
s_deferred=$(new task 1 "Status: deferred")
bd defer "$s_deferred" --reason "fixture" >/dev/null

s_pinned=$(new task 2 "Status: pinned")
bd update "$s_pinned" --status pinned >/dev/null

s_hooked=$(new task 1 "Status: hooked")
bd update "$s_hooked" --status hooked >/dev/null

s_blocked=$(new task 2 "Status: blocked")
bd update "$s_blocked" --status blocked >/dev/null

s_wip=$(new task 2 "Status: in progress")
bd update "$s_wip" --status in_progress --assignee agent-two >/dev/null

s_closed=$(new task 3 "Status: closed")
bd close "$s_closed" --reason "fixture" >/dev/null

# Custom status must be registered before it can be assigned. Nothing upstream
# constrains the vocabulary, so the UI has to cope with a value it never saw.
bd config set status.custom "awaiting_review" >/dev/null
s_custom=$(new task 3 "Status: custom (awaiting_review)")
bd update "$s_custom" --status awaiting_review --assignee agent-three >/dev/null

# --- comments: multi-author, so the Details comments section has variety -------
bd comments add "$rich" "First comment, from the fixture author." --author jdillon >/dev/null
bd comments add "$rich" "Second comment, different author, with \`inline code\`." --author agent-two >/dev/null
bd comments add "$t_task" "Single comment on the blocker." --author jdillon >/dev/null

# Validate structurally and fail closed: `| grep -c` prints 0 on a failed
# `bd list` and still reads like a successful result.
if ! listing=$(bd list --all --limit 0 --json 2>/dev/null); then
  echo "ERROR:bd list failed in $target_dir"
  exit 1
fi
if ! count=$(printf '%s' "$listing" | jq -e 'if type == "array" then length else error("not an array") end' 2>/dev/null); then
  echo "ERROR:could not parse bd list --json output"
  exit 1
fi
if [ "$count" -lt 1 ]; then
  echo "ERROR:fixture created no beads"
  exit 1
fi

echo "FIXTURE_DIR:$target_dir"
echo "FIXTURE_MODE:$mode"
echo "FIXTURE_BEADS:$count"
