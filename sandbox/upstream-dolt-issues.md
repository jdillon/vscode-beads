# Upstream Dolt Migration Issues

Analysis of Dolt-related issues in the beads upstream repository. Beads migrated from SQLite to Dolt as the sole storage backend in v0.50.0.

## Migration Path

| Version | Storage |
|---------|---------|
| <= v0.49.6 | SQLite (default) or Dolt (opt-in via `bd init --backend dolt`) |
| v0.50.0 | Dolt only. `bd migrate dolt` for existing projects |
| v0.50.1+ | Dolt only. Migration bugs being patched |
| v0.51.0 | Dolt only. SQLite code fully removed |

## Critical: Single-Process Limitation

**PR #1221** (DoltHub, merged Jan 21): Dolt's embedded mode is explicitly single-process-only.

This means:
- No daemon process alongside CLI commands
- No concurrent `bd` processes (they'll contend on locks)
- No background import/export helper processes
- Agent workflows that spawn multiple `bd` commands simultaneously will hit lock contention

## Active Dolt Issues

### Lock Contention (#1769, #1661, #1776)

**#1769 — "Switch to dolt with 0.50.1 leads to common lockups"** (3 comments)

Users upgrading from v0.49.6 to v0.50.x report `bd doctor --fix` hanging indefinitely. Root cause identified by contributor peterkc: `doctor/dolt.go` opens embedded Dolt via `sql.Open("dolt", ...)` without the `AccessLock` that `DoltStore` uses.

Workaround:
```bash
bd daemon killall 2>/dev/null || true
find .beads -name "LOCK" -type f -delete
bd migrate --yes
find .beads -name "LOCK" -type f -delete
```

Fix: PR #1780 (pending)

**#1661 — "bd commands hang when Dolt SQL server holds embedded database lock"** (2 comments)

When a Dolt SQL server is running on the same data directory, ALL `bd` commands hang then fail:
```
Error: failed to open database: failed to acquire dolt access lock: dolt access lock timeout (exclusive, 15s)
```

The proposed fix is for `bd` to detect a running Dolt server and connect via MySQL protocol instead of embedded mode. Config:
```yaml
# .beads/config.yaml
dolt.mode: "server"
dolt.host: "127.0.0.1"
dolt.port: 3307
```

Not implemented yet.

**#1776 — "Bounded lock retry contract for daemon and direct mode"** (1 comment)

Requesting deterministic timeout/failure semantics for lock contention. Currently, behavior between daemon mode (dead) and direct mode is unclear. Acceptance criteria: load/contention tests proving no indefinite hangs.

### Migration Failures (#1752, #1781, #1516)

**#1752 — "bd migrate dolt fails: tries to mkdir at existing SQLite database path"**
Migration fails when SQLite database file exists at the path where Dolt needs a directory.

**#1781 — "bd migrate dolt fails with 'not a directory' error"** (CLOSED)
Similar migration path issue, fixed.

**#1516 — "Migration failure from 0.49.1 to 0.49.4: missing column spec_id"**
Schema migration gap — `spec_id` column wasn't added during upgrade path.

### Build Issues (#1805)

**#1805 — "v0.51.0 linux_amd64 binary fails: built without CGO support"** (2 comments)

The v0.51.0 Linux binary was built without CGO, making the Dolt backend completely unusable:
```
Error: failed to create dolt database: dolt: this binary was built without CGO support; rebuild with CGO_ENABLED=1
```

Affects both embedded and server modes. **No workaround** — Linux users on v0.51.0 can't use beads at all.

### Installation Issues (#1744)

**#1744 — "Impossible to install cleanly"** (6 comments)

A detailed walkthrough of a user trying to get `bd doctor` clean after `bd init`. After ~10 commands and multiple cycles of `bd sync`, `bd export`, `bd doctor --fix`, `bd daemon stop/start`, `git add/commit/push`... still can't get a clean state.

This predates the Dolt migration (filed against v0.49.6) but highlights the general complexity of the initialization flow.

## Dolt Architecture Implications for vscode-beads

### What This Means for the Extension

1. **No concurrent access**: The extension cannot hold a persistent connection to the database while CLI commands run. Must use CLI as the sole access point.

2. **Lock files to watch**: `.beads/dolt-access.lock` and `.beads/dolt/LOCK` files indicate active database access. The extension should be aware of these.

3. **Auto-commit creates Dolt commits**: Every write via `bd` creates a Dolt commit (see `dolt_autocommit.go`). This means `DOLT_HASHOF('HEAD')` changes on every write — useful for change detection if we ever get SQL access.

4. **Server mode is future**: #1661 proposes `dolt.mode: "server"` config which would allow concurrent access via MySQL protocol. If/when this ships, it could enable richer integration.

5. **Migration is rocky**: Users upgrading from older beads versions may hit issues. The extension should gracefully handle database errors and suggest `bd doctor`.

## Relevant PRs

| PR | Title | Status |
|----|-------|--------|
| #1221 | fix(dolt): enforce single-process mode | MERGED |
| #1780 | fix: add AccessLock to doctor Dolt checks | OPEN |
| #1802 | fix: add dolt-access.lock cleanup to bd doctor | OPEN |

## References

- DoltHub PR: https://github.com/steveyegge/beads/pull/1221
- Lock contention: https://github.com/steveyegge/beads/issues/1769
- SQL server conflict: https://github.com/steveyegge/beads/issues/1661
- Linux build: https://github.com/steveyegge/beads/issues/1805
