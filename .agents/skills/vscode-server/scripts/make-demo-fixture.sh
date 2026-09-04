#!/usr/bin/env bash
#
# Create a beads project that looks like a real project, for screenshots.
#
# This is the presentation twin of make-test-fixture.sh: same coverage (every
# status, type, priority, dependency kind, markdown-heavy Details panel), but
# the titles read like a product backlog instead of a test matrix, so the
# screenshots are usable in the README and marketplace listing.
#
# Usage:
#   make-demo-fixture.sh [--server] [target-dir]   # default: tmp/bd-demo-fixture
#
#   --server   Use an external dolt sql-server (bd manages it) instead of the
#              embedded engine. Screenshots normally do not care which backend
#              is behind them; embedded is the cheaper default.
#
# Output (parse these):
#   FIXTURE_DIR:<path>
#   FIXTURE_MODE:<embedded|server>
#   FIXTURE_BEADS:<count>
#   ERROR:<message>

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
    -h|--help) sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "ERROR:unknown option '$1'"; exit 1 ;;
    *) target_dir="$1"; shift ;;
  esac
done
target_dir=$(safe_fixture_target "${target_dir:-tmp/bd-demo-fixture}" "$project_dir")
prefix="orbit"

for tool in bd jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR:$tool not found on PATH"
    exit 1
  fi
done

if [ -e "$target_dir" ] && [ ! -d "$target_dir/.beads" ]; then
  echo "ERROR:'$target_dir' exists and is not a bd fixture; refusing to delete it"
  exit 1
fi

if [ -d "$target_dir/.beads" ]; then
  (cd "$target_dir" && bd dolt stop >/dev/null 2>&1) || true
fi

rm -rf -- "$target_dir"
mkdir -p "$target_dir"
cd "$target_dir"
git init -q .

# Pin BEADS_DIR so a fixture created inside another beads project does not
# inherit that project's config and quietly come up in shared-server mode.
export BEADS_DIR="$target_dir/.beads"

init_args=(--prefix "$prefix" --non-interactive)
[ "$mode" = "server" ] && init_args+=(--server)
if ! bd init "${init_args[@]}" >/dev/null 2>&1; then
  echo "ERROR:bd init failed in $target_dir (mode=$mode)"
  exit 1
fi

new() { # new <type> <priority> <title> [assignee]
  if [ -n "${4:-}" ]; then
    bd create --title "$3" --type "$1" --priority "$2" --assignee "$4" --silent
  else
    bd create --title "$3" --type "$1" --priority "$2" --silent
  fi
}

# --- the Details panel hero: every section populated, markdown throughout -----
rich=$(bd create --title "Offline mode with background sync" \
  --type feature --priority 1 \
  --assignee jdillon \
  --labels offline,sync,mobile \
  --estimate 480 \
  --external-ref gh-412 \
  --due +2w \
  --description "$(cat <<'MD'
## Summary

Let the app keep working without a connection, then reconcile once it is back.
Writes queue locally and replay in order; conflicts resolve last-write-wins per
field rather than per record.

- Queue mutations in IndexedDB, keyed by entity
- Replay on `online`, with exponential backoff on failure
- Surface a **pending changes** badge while the queue is non-empty

```ts
const queue = await openQueue("mutations");
window.addEventListener("online", () => queue.drain({ retry: backoff }));
```

> Scope note: read caching already landed in orbit-1f2. This bead only covers
> the write path.
MD
)" \
  --design "$(cat <<'MD'
1. Service worker intercepts mutating requests and hands them to the queue
2. Queue persists to IndexedDB so a reload does not lose pending writes
3. A single drain loop owns replay, so ordering is never racy
MD
)" \
  --acceptance "$(cat <<'MD'
- [x] Mutations survive a full page reload while offline
- [ ] Replay preserves submission order
- [ ] Conflicts resolve per field, not per record
- [ ] Pending badge clears only after the queue drains
MD
)" \
  --notes "Prototype behind the \`offline.sync\` flag. Rollout waits on the metrics dashboard so we can watch replay failure rate." \
  --silent)

bd comments add "$rich" "Queue replay ordering is the risky part - going with a single drain loop rather than parallel workers." --author jdillon >/dev/null
bd comments add "$rich" "Agreed. Added a soak test that kills the tab mid-drain; picks back up cleanly on reload." --author claude >/dev/null

# --- an epic with children (parent-child) ------------------------------------
epic=$(bd create --title "Authentication and session management" --type epic --priority 1 --labels auth --silent)
auth_oauth=$(bd create --title "Sign in with GitHub OAuth" --type feature --priority 1 --parent "$epic" --assignee jdillon --labels auth --silent)
bd update "$auth_oauth" --status in_progress >/dev/null
bd create --title "Rotate refresh tokens on every use" --type task --priority 2 --parent "$epic" --labels auth,security --silent >/dev/null
auth_rate=$(bd create --title "Rate-limit failed sign-in attempts" --type task --priority 1 --parent "$epic" --labels auth,security --silent)

# --- dependencies -------------------------------------------------------------
# bd only allows task -> task blocking, so the blocker is a task.
throttle=$(new task 1 "Redis-backed request throttling middleware" claude)
bd dep add "$auth_rate" "$throttle" --type blocks >/dev/null
bd update "$auth_rate" --status blocked >/dev/null

notif=$(bd create --title "Real-time notifications over WebSocket" --type feature --priority 2 --labels realtime --assignee claude --silent)
bd dep add "$notif" "$rich" --type related >/dev/null

leak=$(bd create --title "Drain loop leaks a listener when the tab is hidden" --type bug --priority 2 --labels offline --silent)
bd dep add "$leak" "$rich" --type discovered-from >/dev/null

# --- the rest of the backlog: type, priority and assignee variety -------------
stale=$(new bug 0 "Search returns stale results after changing filters" jdillon)
bd update "$stale" --status in_progress >/dev/null
new bug 1 "Timezone offset dropped when saving due dates" agent-2 >/dev/null
new bug 2 "Avatar upload fails for images over 2 MB" >/dev/null
safari=$(new bug 3 "Sidebar collapses on window resize in Safari" "")
bd defer "$safari" --reason "Waiting on the layout rewrite" >/dev/null

new feature 2 "Dark mode across the metrics dashboard" claude >/dev/null
new feature 3 "Export reports to CSV" >/dev/null
new feature 3 "Keyboard shortcuts for the command palette" agent-2 >/dev/null

new chore 3 "Bump dependencies to latest minor versions" >/dev/null
ci=$(new chore 2 "Move CI from Travis to GitHub Actions" jdillon)
bd close "$ci" --reason "Shipped in 0.9" >/dev/null
new chore 4 "Remove the deprecated /v1 API shims" >/dev/null

charting=$(new decision 2 "Charting library for the metrics view")
bd close "$charting" --reason "Picked Observable Plot" >/dev/null
spike=$(new spike 3 "Evaluate SQLite vs Postgres for local dev" claude)
bd update "$spike" --status in_progress >/dev/null

new story 2 "Reviewers can approve changes straight from the inbox" agent-2 >/dev/null
new task 2 "Backfill missing created_at on legacy rows" >/dev/null
new task 3 "Document the sync protocol in the handbook" jdillon >/dev/null

beta=$(new milestone 0 "1.0 public beta")
bd update "$beta" --status pinned >/dev/null
# Hangs the hero bead off the milestone so its Details panel shows a parent as
# well as related and discovered-from - one shot covers three dependency kinds.
bd dep add "$rich" "$beta" --type parent-child >/dev/null
molecule=$(new molecule 2 "Onboarding flow revamp" claude)
bd update "$molecule" --status hooked >/dev/null
new event 4 "Quarterly dependency audit" >/dev/null

# Custom status: must be registered before it can be assigned. Shows the UI
# coping with a vocabulary bd itself does not define.
bd config set status.custom "awaiting_review" >/dev/null
bd update "$notif" --status awaiting_review >/dev/null

bd comments add "$stale" "Repro: apply a status filter, then type in search - the first keystroke renders the pre-filter set." --author agent-2 >/dev/null

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
