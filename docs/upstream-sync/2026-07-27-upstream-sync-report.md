# Upstream sync: v0.40.0 → v1.1.2

**Date:** 2026-07-27
**Upstream:** [steveyegge/beads](https://github.com/steveyegge/beads) @ v1.1.2 (2026-07-26)
**Previous sync point:** v0.40.0

Full audit with reproduction steps and verification output:
[`sandbox/bd-1.1.2-compat.md`](../../sandbox/bd-1.1.2-compat.md).

## v1.1.0 → v1.1.2 in isolation: no impact

Four commits, one functional: `564049bb8` *"fix(schema): survive dolt#11131 encoding
drift in the aux row re-key"* — Dolt migration robustness only. No change to the CLI
surface, the SQL schema, the type/status vocabulary, or `bd dolt show --json`.

Everything below comes from the accumulated v0.40.0 → v1.1.2 gap, not from v1.1.2.

## Changes applied

### Statuses (`internal/types/types.go`)

bd has seven built-in statuses, not four:

```go
StatusOpen, StatusInProgress, StatusBlocked, StatusDeferred,
StatusClosed, StatusPinned, StatusHooked
```

plus unbounded user-defined statuses via `bd config set status.custom`.

`normalizeStatus()` previously returned `null` for anything outside the original four,
and callers filtered those beads out — so `bd defer <id>` made an issue disappear from
every view, and the details panel showed "Invalid bead status".

- `src/backend/types.ts`, `src/webview/types.ts`: `BeadStatus` extended to bd's seven;
  added `BUILT_IN_STATUSES`; `normalizeStatus` now passes unrecognized statuses through
  verbatim (preserving casing/punctuation so they round-trip to bd) and returns `null`
  only when the status is absent.
- `byStatus` / label / color maps re-keyed to `Record<string, …>` with fallbacks.
- Status colors for the new statuses copied from bd's own palette
  (`internal/ui/styles.go`): `pinned` `#d2a6ff`, `hooked` `#59c2ff`, `deferred` muted
  `#6c7680`. The original four keep the extension's existing colors.
- `KanbanBoard.tsx`: columns are now derived — the core four always render, other
  built-ins and custom statuses get a column only when beads actually use them.
- `IssuesView.tsx`: "Not Closed" preset includes deferred/pinned/hooked; "Active"
  includes hooked; the status filter menu lists custom statuses found in the data.

### Issue types

Built-ins at v1.1.2: `bug feature task epic chore decision message molecule gate spike
story milestone` (+ internal `event`). `merge-request` was demoted to a custom type
upstream but is retained here for existing databases.

- `src/webview/types.ts`: added `decision`, `message`, `gate`, `spike`, `story`,
  `milestone`, `event` to `BeadType`, `TYPE_LABELS`, `TYPE_COLORS`,
  `TYPE_TEXT_COLORS`, `TYPE_SORT_ORDER`.
- `src/webview/icons/`: added Font Awesome Free icons — `decision` (scale-balanced),
  `message` (comment), `gate` (door-closed), `spike` (magnifying-glass), `story`
  (book-open), `milestone` (flag-checkered), `event` (clock-rotate-left).

Upstream colors only cover `bug` and `epic` (everything else renders as plain terminal
text), so there was nothing canonical to copy for the new types; they follow the
extension's existing palette.

### `bd show --json` payload

bd commit `cfcc95799` (first released in **v1.0.5**) made `dependents` and `comments`
opt-in, leaving only `dependent_count` / `comment_count` by default. The CLI backend
never passed the flag, so the details panel's "blocks" list was always empty on
embedded-Dolt projects.

- `src/backend/BeadsCommandRunner.ts`: extracted `createShowCommandArgs()`, which now
  passes `--include-dependents`. Comments are still fetched via `bd comments`, so
  `--include-comments` is not needed.

### Minimum bd version

- `src/backend/BeadsBackend.ts`: new `MIN_SUPPORTED_BD_VERSION = "1.0.5"`, consumed by
  both `BeadsCommandRunner` and `BeadsProjectManager` (previously `"0.51.0"` duplicated
  in two places). The floor is required because bd rejects unknown flags outright, so
  `--include-dependents` cannot be sent to bd < 1.0.5.

### Backend parity

`bd list` hides gate and infrastructure beads unless `--include-gates` /
`--include-infra` / `--include-templates` are passed. The Dolt SQL backend read the
table directly and applied no such filter, so server-mode projects would surface
coordination beads that embedded-mode projects hide.

- `src/backend/BeadsDoltBackend.ts`: `list()` now excludes `gate`/`agent`/`role`/`message`
  and template molecules. Verified against the live database — 110 rows both before and
  after, matching `bd list --all --limit 0 --json` exactly.

## Verified, no change needed

- **Dolt schema**: every column the extension selects exists on a live bd 1.1.2 database
  (`issues` 54 cols, `labels` 2, `comments` 5, `dependencies` 10). The typed-dependency
  detection added for #79 matches the live schema.
- **`bd dolt show --json`**: `embedded` field present; backend-mode detection correct.
  New `schema_version` envelope field is additive and ignored.
- **CLI flags**: all invoked commands/flags verified against bd 1.1.2 `--help`.
  `bd create --label` is a registered hidden alias for `--labels`.
- **`bd where`**: output parsing unchanged and correct.
- **Daemon**: removed upstream (`internal/rpc/` gone); the extension has no daemon
  client. `docs/reference/beads-daemon-api.md` does not exist and is not needed.

## Sync point

Recorded sync point advanced to **v1.1.2**.
