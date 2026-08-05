# Upstream Beads Sync

Tracks synchronization between vscode-beads and upstream [beads](https://github.com/gastownhall/beads).

## Current Sync Point

**v1.1.2** (released 2026-07-26)

## Sync History

| Date | Version | Summary |
|------|---------|---------|
| 2026-07-27 | v1.1.2 | `deferred`/`pinned`/`hooked` + custom statuses, 7 new issue types, `bd show` dependents now opt-in, min bd version → 1.0.5 |
| 2025-12-29 | v0.40.0 | `wisp`→`ephemeral`, `created_by`, `hooked` status, `agent`/`role` types, daemon API fields |

## Reports

- [2026-07-27](2026-07-27-upstream-sync-report.md) - v0.40.0 → v1.1.2
- [2025-12-29](2025-12-29-upstream-sync-report.md) - v0.37.0 → v0.40.0

## Pending Updates

Nothing outstanding as of v1.1.2.

Note: the daemon was removed upstream (`internal/rpc/` no longer exists) and the
extension has no daemon client, so the former `BeadsDaemonClient.ts` /
`beads-daemon-api.md` items are obsolete and have been dropped.
