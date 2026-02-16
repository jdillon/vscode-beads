# Upstream Daemon Removal & Change Notification Gap

Analysis of the beads daemon removal (v0.50.0) and its impact on UI consumers.

## Timeline

| Date | Event |
|------|-------|
| Jan 21, 2026 | DoltHub PR #1221 merged: "enforce single-process mode (disable daemon/autostart)" |
| Jan 22, 2026 | beads v0.49.0 released (last version with working daemon + Dolt coexistence) |
| Feb 8, 2026 | SSE watch epic #1595 filed (planned daemon replacement, never implemented) |
| Feb 14, 2026 | beads v0.50.0 released — daemon/RPC completely removed |
| Feb 16, 2026 | beads v0.51.0 released — daemon code fully gone |

## Root Cause: Dolt Incompatibility

DoltHub themselves (coffeegoddd) submitted PR #1221 which enforced single-process mode for Dolt backends:

> "Treat embedded Dolt as single-process-only and disable daemon/RPC/autostart when backend=dolt."
> "Docs updated to explicitly state: Dolt backend runs single-process-only; daemon disabled; use `bd init --backend sqlite` if you need daemon mode."

**Key changes in PR #1221:**
- Blocked `bd daemon *` commands in Dolt workspaces
- Skipped daemon connect/restart/autostart paths for Dolt in CLI startup
- Avoided spawning helper `bd import` processes in Dolt mode
- Added 1,439 lines / removed 313 lines

The fundamental problem: Dolt's embedded mode uses file-level locks that don't support concurrent process access. The daemon pattern (long-running process + CLI clients communicating over Unix socket) was architecturally incompatible.

## What Was Removed

The daemon system was deleted across v0.50.0-v0.51.0:
- `internal/rpc/` — entire RPC package (server, client, protocol, HTTP)
- `internal/daemon/` — daemon lifecycle management
- `cmd/bd/daemon.go` — CLI command
- Unix socket at `.beads/bd.sock`
- `GetMutations` RPC — the push-notification mechanism
- ~24,000+ lines of code

## Orphaned Daemon Bug Reports (~15 issues)

These open issues are now moot since the code they report on no longer exists:

| Issue | Title |
|-------|-------|
| #1344 | "Daemon took too long" |
| #1318 | Can't get daemon running in a devcontainer |
| #1515 | Daemon orphan accumulation: silent flock loss |
| #1533 | daemon: file watcher races with JSONL export |
| #1580 | bd daemon fails in sandboxed agent environments |
| #1609 | Label writes silently dropped when multiple daemons |
| #1623 | Daemon mutation-triggered exports overwritten by auto-imports |
| #1656 | Daemon sync flags inconsistent |
| #1657 | bd daemon stop: false-positive stop |
| #1658 | bd daemon start: default to auto-commit + auto-push |
| #1698 | Degraded daemon creates spurious directory tree |
| #1352 | Warning: Daemon took too long to start (>5s) |
| #1395 | Sync-branch daemon does not update working tree |

## Planned Replacement: SSE Watch System (Never Implemented)

Issues #1595-#1602 describe a planned SSE-based replacement for daemon push notifications:

### Epic: #1595 — "SSE watch endpoint + shell-script Stop hook"

Architecture:
- Daemon HTTP server gets `GET /events` SSE endpoint
- `since` parameter replays from buffer (expanded to 1000) for guaranteed delivery
- Optional `filter` parameter (`issue:X`, `type:X`)
- New `bd watch` command connects via SSE, blocks until condition met
- Bearer token auth via existing `authenticateRequest`

### Sub-tasks

| Issue | Title | Status |
|-------|-------|--------|
| #1596 | Fan-out mutation subscription system | Open (orphaned) |
| #1597 | SSE endpoint: `GET /events` | Open (orphaned) |
| #1598 | SSE client helper | Open (orphaned) |
| #1599 | `bd watch` command | Open (orphaned) |
| #1600 | Stop hook shell script | Open (orphaned) |
| #1601 | Tests: fan-out subscription + SSE endpoint | Open (orphaned) |
| #1602 | Tests: bd watch command + SSE client | Open (orphaned) |

**Problem:** All these issues still reference `internal/rpc` which was deleted in v0.50.0. The designs assume a daemon HTTP server which no longer exists. These plans were written Feb 8, just 6 days before the daemon was removed.

### `bd watch` Command Design (#1599)

```
Flags: --issue, --decision, --until-status, --timeout, --raw, --json, --since
```
- `bd watch --decision=gt-abc --timeout=30m` — block until decision responded
- `bd watch --issue=gt-abc --until-status=closed` — block until issue closed
- `bd watch --raw` — stream all mutations

This would have been ideal for our extension. It never shipped.

## What Currently Exists for Change Detection

### 1. fsnotify on `.beads/` directory (Working)

Used by `bd list --watch` and `bd show --watch`:
- Watches `.beads/` directory for file changes
- 500ms debounce
- Refetches full data on each change event
- No delta detection — full refresh every time

Feature request #1610 asks for `bd show --watch` (which now exists).

### 2. Lifecycle Hooks Proposal (#1754, Unimplemented)

Filed by Compass (AI agent), proposes `.beads/hooks/`:
```
.beads/hooks/
  post-create    # runs after bd create
  post-close     # runs after bd close
  post-update    # runs after bd update
  post-claim     # runs after bd update --claim
```

Each hook receives issue data as JSON on stdin. This would be the ideal push mechanism but has 0 comments and no implementation.

### 3. Dolt System Tables (Available but undocumented for this use)

- `DOLT_HASHOF('HEAD')` — commit hash polling
- `dolt_log` — commit history
- `dolt_diff_issues` — row-level diffs between commits
- `dolt_status` — uncommitted changes

These require SQL access to the Dolt database, which isn't exposed via CLI.

## Impact on UI Consumers

### vscode-beads extension (this project)
- 100% dependent on daemon RPC via `BeadsDaemonClient.ts`
- Used `GetMutations` for real-time updates
- **Completely broken** on beads >= v0.50.0

### monitor-webui example (`examples/monitor-webui/`)
- Also 100% daemon-dependent
- Imports deleted `internal/rpc` package
- **Won't compile** on beads >= v0.50.0
- Old issue #342 about monitor not detecting daemon is now moot

### beads-mcp (Python MCP server)
- Uses `DaemonSocket` for real-time mutation watching (per `COMMUNITY_TOOLS.md`)
- Also broken

## Recommended Strategy for vscode-beads

**fsnotify + CLI polling** is the only viable path:

1. **VS Code FileSystemWatcher** on `.beads/` directory
2. **Debounce** (500ms, matching `bd` CLI pattern)
3. **CLI refresh** via `bd list --json`, `bd show <id> --json`
4. **Optional optimization**: Track last-seen commit hash via `bd` commands that expose it

This is actually simpler than the daemon approach and catches changes from ALL sources (CLI, agents, git pulls, manual edits).

## Upstream Issues to Track

| Issue | Relevance |
|-------|-----------|
| #1754 | Lifecycle hooks — would give us push notifications |
| #1595 | SSE watch epic — may be revived in new architecture |
| #1599 | `bd watch` command — if revived, ideal for extension |
| #1610 | `--watch` flag on `bd show` — confirms fsnotify pattern |

## References

- PR #1221: https://github.com/steveyegge/beads/pull/1221
- SSE epic: https://github.com/steveyegge/beads/issues/1595
- Lifecycle hooks: https://github.com/steveyegge/beads/issues/1754
- monitor-webui: https://github.com/steveyegge/beads/tree/main/examples/monitor-webui
