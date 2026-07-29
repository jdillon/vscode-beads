# vscode-beads compatibility with bd v1.1.2

**Date:** 2026-07-27
**Author:** jdillon (via Claude)
**Upstream ref:** `~/ws/reference/beads` @ v1.1.2 (released 2026-07-26)
**Local CLI:** `bd version 1.1.2 (Homebrew)` at `/opt/homebrew/bin/bd`
**Extension ref:** `jdillon/bd-1.1.2-compat` @ d492de1

> Originally a read-only audit. **All five findings have since been fixed** on this
> branch — see [Resolution](#resolution) at the end for what shipped. The findings
> below are preserved as written, in the present tense of the investigation.

---

## Bottom line

**The v1.1.0 → v1.1.2 delta itself needs no action.** It is 4 commits, one of them
functional: a Dolt migration robustness fix. Nothing in the CLI surface, the Dolt SQL
schema, the issue-type/status vocabulary, or the `bd dolt show --json` shape changed.

The audit did, however, surface **two real breaks that exist today** against bd 1.1.x.
Both predate v1.1.2 (they landed in v1.0.5 and earlier) and neither was caught by the
recent PR #78 / PR #81 work. They are ranked first below.

---

## Findings, ranked by whether they break the extension today

### F1 — Beads with `deferred` / `pinned` / `hooked` status are silently dropped 🔴 BROKEN TODAY

**What changed upstream.** Beads has seven built-in statuses, not four
([types.go:327-333](~/ws/reference/beads/internal/types/types.go)):

```go
StatusOpen       Status = "open"
StatusInProgress Status = "in_progress"
StatusBlocked    Status = "blocked"
StatusDeferred   Status = "deferred" // Deliberately put on ice for later
StatusClosed     Status = "closed"
StatusPinned     Status = "pinned" // Persistent bead that stays open indefinitely
StatusHooked     Status = "hooked" // Work actively claimed by a worker
```

On top of that, users can define **arbitrary custom statuses** via
`bd config set status.custom "awaiting_review,awaiting_testing"`
([config.go:63-86](~/ws/reference/beads/cmd/bd/config.go)), each with a behavioral
category (`active` / `wip` / `done` / `frozen`).

`deferred` is directly user-reachable — `bd defer` is a first-class shipped command, and
its own help states: *"Deferred issues don't show in 'bd ready' but **remain visible in
'bd list'**."* So bd hands these beads to the extension and expects them displayed.

**Which extension code.** `src/backend/types.ts:225-255` — `normalizeStatus()` has a
`switch` covering only `open` / `in_progress` / `active` / `blocked` / `closed` / `done` /
`completed` / `cancelled`, and returns `null` in the `default` arm.

The `null` then propagates:

| File:line | Effect |
|---|---|
| `src/providers/BeadsPanelViewProvider.ts:64` | `.filter(b => b !== null)` — bead vanishes from the issues list |
| `src/providers/DashboardViewProvider.ts:67` | same filter — bead vanishes from dashboard counts/summary |
| `src/providers/BeadDetailsViewProvider.ts:113-118` | Details panel renders the error **"Invalid bead status"** |

**Verified.** Ran the real source:

```text
$ bun -e 'import {normalizeStatus, issueToWebviewBead} from "./src/backend/types.ts" ...'
open             -> "open"
in_progress      -> "in_progress"
blocked          -> "blocked"
closed           -> "closed"
[vscode-beads] Unknown bead status "deferred" - skipping
deferred         -> null
[vscode-beads] Unknown bead status "pinned" - skipping
pinned           -> null
[vscode-beads] Unknown bead status "hooked" - skipping
hooked           -> null
[vscode-beads] Unknown bead status "awaiting_review" - skipping
awaiting_review  -> null
issueToWebviewBead(deferred) => null
```

**Is it a v1.1.2 regression?** No. `hooked` was already flagged as pending in the
2025-12-29 sync report (v0.40.0). This is long-standing debt that v1.1.2 does not change.

**Is it firing right now?** Not on this repo's own database — current status distribution
is `open=87, closed=20, blocked=2, in_progress=1`, no deferred/pinned/hooked beads exist.
It is **latent but one command away**: a single `bd defer <id>` makes that bead disappear
from every view, with the only trace being a `console.warn` in the webview.

**Smallest fix.** Not a one-liner — deliberately left as a recommendation:

1. Extend `BeadStatus` in **both** `src/backend/types.ts:21` and `src/webview/types.ts:9`
   to include `deferred | pinned | hooked`.
2. Add entries to `STATUS_LABELS` / `STATUS_COLORS` in both files.
3. Decide Kanban behavior — `src/webview/views/KanbanBoard.tsx:26` hard-codes
   `COLUMNS: BeadStatus[] = ["open", "in_progress", "blocked", "closed"]`. Either add
   columns or explicitly bucket the new statuses.
4. Consider a passthrough for *custom* statuses rather than another closed enum, since
   `status.custom` is unbounded by design. A safer shape: normalize known aliases, and
   pass unknown statuses through as-is with the existing unknown-color fallback, instead
   of dropping the bead.

> Point 4 is the actual root cause. A closed enum will keep breaking every time upstream
> or a user adds a status. Dropping the bead entirely is the wrong failure mode — a bead
> displayed with an unstyled badge is strictly better than a bead that silently isn't there.

---

### F2 — Embedded-Dolt projects never show dependents ("Blocks") in the Details panel 🔴 BROKEN TODAY

**What changed upstream.** Commit `cfcc95799` *"feat(show): count-only JSON details with
opt-in streamed payloads"* (2026-05-22) made `dependents` and `comments` **opt-in** in
`bd show --json`, behind `--include-dependents` / `--include-comments`. Default output
now carries only `dependent_count` / `comment_count`.

First release containing it: **v1.0.5**. Confirmed not in v1.0.4, present in v1.1.0.

**Verified live against bd 1.1.2** (issue with `dependent_count: 1`):

```text
$ bd show vsbeads-yjr --json | keys
id, title, description, status, priority, issue_type, owner, estimated_minutes,
created_at, created_by, updated_at, labels, dependencies, parent,
dependent_count, dependency_count, comment_count          <-- no "dependents"

$ bd show vsbeads-yjr --json --include-dependents | keys
... labels, dependencies, dependents, parent, ...          <-- "dependents" appears
dependents: [{"id":"vsbeads-hgm","title":"Test sub-agent context isolation",
             "status":"open","priority":1,"issue_type":"task","dependency_type":"blocks"}]
```

**Which extension code.** `src/backend/BeadsCommandRunner.ts:113`:

```ts
const result = await this.runReadJson(["show", id, "--json"], { cacheTtlMs: 250 });
```

No `--include-dependents`. Then `src/backend/types.ts:387` maps `issue.dependents` →
`bead.blocks`, which is therefore always `undefined`.

**Scope.** CLI-backend only — i.e. **embedded Dolt projects**. `BeadsBackendFactory.ts:34-40`
routes `embedded: true` to `BeadsCommandRunner`, everything else to `BeadsDoltBackend`.
Server-mode projects are unaffected because `BeadsDoltBackend.loadDependents()`
(`BeadsDoltBackend.ts:340-364`) runs its own SQL and does not go through `bd show`.

This is precisely the path PR #78 added, so it is new-ish surface that has never had the
dependents list working.

Comments are *not* affected: `BeadDetailsViewProvider.ts:91-97` fetches them separately
via `bd comments <id> --json` and merges them in, so `--include-comments` is not needed.

**Smallest fix — and why I did not just ship it.** The change is one line:

```ts
["show", id, "--json", "--include-dependents"]
```

But it is **not safe unconditionally**. `minSupportedVersion` is `"0.51.0"`
(`BeadsProjectManager.ts:397`, defaulted again at `BeadsCommandRunner.ts:66`), and the
flag does not exist before v1.0.5. bd exits non-zero on an unknown flag — verified:

```text
$ bd create --title x --definitely-not-a-flag y --json --dry-run
Error: unknown flag: --definitely-not-a-flag
```

So on bd 0.51–1.0.4 the flag would break `show` outright — trading a missing panel
section for a completely broken Details panel. Note those older versions returned
`dependents` by default and so need no flag at all.

Two viable options, **Jason's call** (this is a support-policy decision, not a bug fix):

- **(a) Bump the floor.** Set `minSupportedVersion` to `1.0.5` (or `1.1.0`) and add the
  flag unconditionally. Two lines. Cleanest. Cost: drops support for bd < 1.0.5.
- **(b) Version-gate.** `checkCompatibility()` already resolves `detectedVersion`; add the
  flag only when `compareSemver(version, "1.0.5") >= 0`. No support dropped. Cost: a
  conditional and a branch that is hard to exercise in tests.

I lean **(a)**. The extension already hard-requires bd ≥ 1.1-era behavior in places —
the typed-dependency-column detection added for #79 exists specifically for schema
migration 0043 — and 0.51.0 is long-dead.

---

### F3 — Seven upstream issue types have no label, color, icon, or sort order 🟡 COSMETIC

**Upstream built-in types at v1.1.2** ([types.go:524-542](~/ws/reference/beads/internal/types/types.go)):

`bug`, `feature`, `task`, `epic`, `chore`, `decision`, `message`, `molecule`, `gate`,
`spike`, `story`, `milestone` — plus `event` (internal, `IsBuiltIn` only).

**Extension** (`src/webview/types.ts:161`):

`bug`, `feature`, `task`, `epic`, `chore`, `merge-request`, `molecule`.

**Missing:** `decision`, `message`, `gate`, `spike`, `story`, `milestone`, `event`.

`decision` is the one that matters — it is offered in the user-facing create help:

```text
-t, --type string  Issue type (bug|feature|task|epic|chore|decision); custom types
                   require types.custom config; aliases: enhancement/feat→feature,
                   dec/adr→decision
```

Conversely `merge-request` was **removed** from upstream core and is now a custom-only
type (`types.go:544-546`: *"Most orchestrator types (convoy, merge-request, slot, agent,
role, rig) were removed from beads core"*). Harmless to keep — custom types are still
legal, and users may still have such beads.

**Not broken — degrades gracefully.** Verified in source:
- `src/webview/common/TypeIcon.tsx:25-30` → falls back to `icons.notdef` + `UNKNOWN_TYPE_COLOR`
- `src/webview/common/TypeBadge.tsx:26` → falls back to the raw type string
- `src/webview/types.ts:213-216` `getTypeSortOrder()` → `UNKNOWN_TYPE_SORT_ORDER` (99)

So a `decision` bead renders as a gray "missing glyph" icon with the literal text
`decision`, sorted last. Ugly, not broken.

**Smallest fix.** Add entries to `TYPE_LABELS`, `TYPE_COLORS`, `TYPE_TEXT_COLORS`,
`TYPE_SORT_ORDER` in `src/webview/types.ts` and drop matching SVGs into
`src/webview/icons/`. Multi-file and needs icon assets sourced from Font Awesome Free →
recommendation, not an auto-fix. Suggest doing `decision` at minimum, since it is the
only one a normal user creates by hand.

---

### F4 — SQL backend does not apply bd's default type-hiding filters 🟡 LATENT

`bd list` hides several bead classes unless explicitly asked:

```text
--include-gates      Include gate issues in output (normally hidden)
--include-infra      Include infrastructure beads (agent/role/message) in output
--include-templates  Include template molecules in output
```

`BeadsDoltBackend.list()` (`src/backend/BeadsDoltBackend.ts:130-131`) filters only on
`ephemeral`:

```sql
FROM issues
WHERE (ephemeral = 0 OR ephemeral IS NULL)
```

So in **server mode** the extension would surface gate / molecule / agent / role / message
beads that bd itself hides, while **embedded mode** (CLI backend) would not — the two
backends disagree.

**Verified: not firing today.** Both paths return identical results on this database:

```text
SQL backend list count: 110
by type: feature=44, task=35, bug=17, epic=9, chore=5

bd list --all --limit 0 --json  count: 110
by type: bug=17, task=35, epic=9, feature=44, chore=5
```

No gate/infra/template beads exist here, so the divergence is theoretical. It becomes
visible the first time a swarm/molecule or gate workflow runs against a project.

**Smallest fix.** Add to the `list()` WHERE clause:

```sql
AND issue_type NOT IN ('gate', 'agent', 'role', 'message')
```

Only worth doing if matching bd's default hiding is the desired product behavior — the
extension may legitimately want to show everything. Flagging the inconsistency, not
prescribing it.

---

### F5 — Stale sync docs 🔵 DOCS ONLY

- `docs/upstream-sync/README.md` records sync point **v0.40.0** and a "Pending Updates"
  checklist referencing `BeadsDaemonClient.ts` and `docs/reference/beads-daemon-api.md`.
  **Neither file exists** in the extension. The daemon is gone from both sides:
  `git ls-tree v1.1.2 internal/rpc/` returns empty upstream, and `src/backend/` contains
  no daemon client. The task item "diff daemon API docs vs `internal/rpc/protocol.go`" is
  moot — both artifacts are gone.
- `docs/reference/beads-protected-branch.md:43` still documents `bd daemon --stop`, a
  removed command.

**Fix.** Update the sync point to v1.1.2, delete the dead checklist entries, drop the
`bd daemon --stop` reference.

---

## Explicitly verified — no action needed

| Surface | Result |
|---|---|
| **v1.1.0 → v1.1.2 delta** | 4 commits. One functional: `564049bb8` *"fix(schema): survive dolt#11131 encoding drift in the aux row re-key"* — migration robustness only, no API/schema surface change. Others are version bumps + MCP lock. |
| **Dolt SQL schema** | Every column the extension SELECTs verified present on the live bd 1.1.2 database (`jdillon_vscode_beads` @ 127.0.0.1:3308): `issues` 54 cols, `labels` 2 (`issue_id, label`), `comments` 5 (`id, issue_id, author, text, created_at`), `dependencies` 10. All of `id, title, description, design, acceptance_criteria, notes, status, priority, issue_type, assignee, estimated_minutes, external_ref, created_at, updated_at, closed_at, ephemeral` present. |
| **Typed dependency columns (#79 / PR #81)** | `depends_on_issue_id`, `depends_on_wisp_id`, `depends_on_external` all present; `depends_on_id` gone. The runtime detection in `getDepSqlParts()` (`BeadsDoltBackend.ts:292-312`) matches the live schema correctly. |
| **Migration level** | v1.1.2 ships migrations through `0053`. HEAD (632 commits ahead, unreleased) has `0054`–`0059`, incl. `0055_move_leases_to_table` and `0058_heal_wisp_dependencies_split_constraints`. None touch extension-queried columns, but this is the surface to re-check at v1.2. |
| **`bd dolt show --json` shape** | Live output: `{backend, connection_ok, database, embedded:false, host, port, schema_version:1, shared_server:true, user}`. `BeadsBackendFactory.isEmbeddedDoltInfo()` reads `embedded` — correct for both modes ([dolt.go:1298-1316](~/ws/reference/beads/cmd/bd/dolt.go)). New `schema_version` is an additive JSON-envelope field, harmlessly ignored by the TS interface. |
| **CLI flags invoked** | All verified against `bd 1.1.2 --help`: `list --all --limit 0 --json`, `show <id> --json`, `create`, `update`, `close --reason`, `dep add/remove --type --json`, `comments <id> --json`, `comments add <id> <text> --author`, `info --json`, `version`, `dolt status/start/stop`, `where`. |
| **`bd create --label`** | Not a bug despite help showing `--labels`. `--label` is a registered hidden alias ([create.go:864-865](~/ws/reference/beads/cmd/bd/create.go): `StringSlice("label", ...)` + `MarkHidden`). Extension's `toStringArray()` emitting `--label` is correct. |
| **`bd where` parsing** | Live output first line is the `.beads` dir; `probeBeadsProject()` (`BeadsProjectManager.ts:289-295`) takes the first non-empty line. Correct. |
| **Priority normalization** | Upstream is 0–4 (`--priority string Priority (0-4 or P0-P4, 0=highest)`). `normalizePriority()` clamps to 0–4. Correct. |
| **Daemon API doc** | N/A — daemon removed upstream and never re-added to the extension. See F5. |

---

## Recommendations

| # | Action | Priority | Size |
|---|---|---|---|
| 1 | Stop dropping beads with unrecognized status; support `deferred`/`pinned`/`hooked` + custom statuses (F1) | P1 | medium — 2 type files + Kanban decision |
| 2 | Decide min-version policy, then add `--include-dependents` to CLI-backend `show` (F2) | P1 | 2 lines once policy is set |
| 3 | Add `decision` type label/color/icon; optionally the other six (F3) | P3 | small + icon assets |
| 4 | Decide whether SQL backend should mirror bd's gate/infra hiding (F4) | P4 | 1 line if yes |
| 5 | Refresh `docs/upstream-sync/README.md` to v1.1.2; drop dead daemon items (F5) | P4 | docs |

**Nothing here is caused by v1.1.2.** If the goal was strictly "does v1.1.2 break us" —
the answer is no, and the honest recommendation for that question alone is *no action
needed*. F1 and F2 are pre-existing bugs this audit happened to surface.

---

## Environment note (not extension-related)

This repo's own Dolt database has pending schema migrations against dirty tables, so bd
**writes** currently fail:

```text
Error: failed to open database: failed to initialize schema: schema migration: pending
schema migrations alter pre-existing dirty tables: comments, compaction_snapshots,
dependencies, events, issue_snapshots, issues, labels; run 'bd dolt commit' to commit
the working set at the current schema, then re-run the migration (gastownhall/beads#4566)
```

Reads (`bd list`, `bd show`, direct SQL) work fine. Resolve with `bd dolt commit` when
convenient. Worth noting that the extension in server mode would keep *displaying* data
normally while every edit fails — the error surfaces only on write.

---

## Sync point

Upstream reference clone advanced to `v1.1.2` (HEAD `c989b6b87`, 632 commits past v1.1.0
on `main`). Recorded sync point in `docs/upstream-sync/README.md` is still **v0.40.0** and
should be updated to **v1.1.2** — see F5.

The tracked sync record lives at
[`docs/upstream-sync/2026-07-27-upstream-sync-report.md`](../docs/upstream-sync/2026-07-27-upstream-sync-report.md);
`docs/upstream-sync/README.md` now records **v1.1.2** as the sync point.

---

## Resolution

All five findings fixed on branch `jdillon/bd-1.1.2-compat`.

| # | Finding | Fix |
|---|---|---|
| F1 | Beads with `deferred`/`pinned`/`hooked`/custom status dropped | `normalizeStatus` passes unrecognized statuses through verbatim instead of returning `null`; `BeadStatus` extended to bd's seven built-ins; label/color/count maps re-keyed to `Record<string, …>` with fallbacks; Kanban derives columns from data; filter presets and menu updated |
| F2 | Embedded-Dolt details panel never showed dependents | `createShowCommandArgs()` now passes `--include-dependents`; `MIN_SUPPORTED_BD_VERSION` introduced as a single constant and raised `0.51.0` → `1.0.5` |
| F3 | Seven upstream issue types unstyled | Added to `BeadType`, `TYPE_LABELS`, `TYPE_COLORS`, `TYPE_TEXT_COLORS`, `TYPE_SORT_ORDER`, plus seven Font Awesome Free icons |
| F4 | SQL backend ignored bd's default type hiding | `list()` excludes `gate`/`agent`/`role`/`message` and template molecules |
| F5 | Stale sync docs | Sync point → v1.1.2, dead daemon checklist removed, `bd daemon --stop` → `bd dolt stop` |

**On colors and icons.** Upstream defines canonical *status* colors in
`internal/ui/styles.go`, so the new statuses use bd's own values (`pinned` `#d2a6ff`,
`hooked` `#59c2ff`, `deferred` muted `#6c7680`). The pre-existing four statuses were
left on the extension's palette — recoloring them was not asked for. Upstream colors
only `bug` and `epic` among *types* (the rest render as plain terminal text), so there
was nothing canonical to copy for the seven new types; they follow the extension's
existing palette. Upstream's glyphs are terminal Unicode (`❄`, `📌`, `◇`), not SVG, so
icons were sourced from Font Awesome Free to match the existing icon set.

**Follow-up: completing the status/type visual mapping.** A review pass found two
places the extended enum was not fully mapped, both now fixed:

- `DashboardView.tsx` — the "by status" bar fill read `STATUS_COLORS[status]` with no
  fallback, so a custom status rendered an uncolored bar while its badge was gray.
  Badge and bar now agree for all eight statuses (verified via computed styles).
- `DetailsView.tsx` — the status and type dropdowns were built solely from the
  built-in maps, so a bead with a custom status/type had a select whose value matched
  none of its options. A shared `withCurrentValue()` helper appends the bead's own
  value; this fixes custom *types* as well, which had the identical defect.

There is no status *icon* in this extension — status renders as a colored text badge
(`StatusBadge` / `StatusPriorityPill`), driven entirely by `STATUS_LABELS` +
`STATUS_COLORS`. Only *types* have SVG icons. So extending those two maps plus the
fallbacks above is the complete visual surface for statuses.

**Verification.** `tsc --noEmit` clean, `eslint` clean. At the time of the audit,
21/21 jest tests passed (9 new, covering status passthrough and the `show`
flag/version floor); after merging main the suite is **23/23 across 5 suites**,
the extra suite being main's no-project loading-state tests from #83. The new
`list()` query was executed against the live bd 1.1.2 database and returns 110 rows,
identical to `bd list --all --limit 0 --json`.

**Post-review fix.** Code review caught a defect this audit missed: the Issues
view's initial `columnFilters` hardcoded `["open", "in_progress", "blocked"]`
while the `not-closed` preset had been widened to six statuses, so the default
table *and* board views still hid `deferred`/`pinned`/`hooked` behind a chip
reading "Not Closed". This is the `7 of 11` visible in the first round of manual
testing, which was wrongly attributed to stale persisted filter state. The
initial filter is now derived from the preset so the two cannot drift.
