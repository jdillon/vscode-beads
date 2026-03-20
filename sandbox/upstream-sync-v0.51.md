# Upstream Sync Analysis: Beads v0.49.2 -> v0.51.0

**Date**: 2026-02-16
**Scope**: 653 commits, 9 releases (v0.49.3 through v0.51.0)
**Impact**: Critical -- extension architecture fundamentally misaligned with upstream

---

## TL;DR

The beads project underwent a **massive architectural overhaul** between v0.49.2 and v0.51.0. The three biggest changes:

1. **Daemon/RPC system completely removed** (-19,663 lines) -- our extension is 100% daemon-dependent
2. **SQLite backend removed**, replaced by Dolt (versioned SQL database)
3. **JSONL sync layer removed** (-7,634 lines) -- `bd sync` is now a no-op

Our extension (`BeadsDaemonClient.ts`, `BeadsProjectManager.ts`) communicates exclusively via Unix socket RPC to a daemon that **no longer exists**. The extension is completely broken against beads >= v0.50.0.

---

## What Changed Upstream

### Phase 1: Dolt Becomes Default (v0.50.0)

Dolt is now the default storage backend for `bd init`. It's a versioned MySQL-compatible database with cell-level merge, native branching, and built-in push/pull. Key properties:
- **Embedded mode** (default): No server, uses `dolthub/driver` -- database/sql interface
- **Server mode** (federation): Connects to `dolt sql-server` for multi-writer scenarios
- Writes are immediate -- no intermediate JSONL representation needed
- Version control is native -- commit, branch, merge, push, pull are SQL procedures

### Phase 2: Remove Daemon/RPC (v0.50.0)

The entire daemon subsystem was deleted:

| Component | Lines Removed |
|-----------|---------------|
| `internal/rpc/` (38 files) | -14,886 |
| `internal/daemon/` (8 files) | -2,459 |
| `if daemonClient != nil` branches (56 files) | -3,384 |
| `markDirtyAndScheduleFlush()` calls (33 files) | -820 |
| Broken tests after deletion | -2,782 |
| **Total** | **~24,331** |

All CLI commands now use **direct embedded database access**. No socket, no RPC, no daemon process. The `bd daemon` command no longer exists.

### Phase 3: Remove JSONL Sync Layer (v0.50.0)

The automatic SQLite-to-JSONL sync loop was removed (-7,634 lines):
- `internal/importer/` deleted
- Autoflush, autoimport, dirty tracking, export hashes -- all deleted
- `bd sync` is now a **silent no-op** (flags preserved for backward compat)
- JSONL files still exist for manual import/export, but aren't auto-generated

### Phase 4: Remove SQLite Backend (v0.51.0)

An 8-phase cleanup in v0.51.0 removed all legacy infrastructure:

| Phase | What Was Removed |
|-------|------------------|
| 2 | Daemon compat stub, `--no-daemon` flag |
| 3 | 3-way merge engine (`internal/merge/`, 3,958 lines) |
| 4 | Tombstone/soft-delete system (-6,117 lines) |
| 5 | JSONL sync layer remnants |
| 6 | SQLite backend entirely (`internal/storage/sqlite/`, ~131 files) |
| 7 | Storage factory, memory backend, provider abstraction |
| 8 | CLI & config cleanup -- remaining SQLite/daemon config keys |

After v0.51.0, the storage layer is:
```
internal/storage/
  storage.go       -- shared Transaction interface
  metadata.go      -- JSON validation helper
  versioned.go     -- history/diff/conflict/sync types
  batch.go         -- batch create options
  dolt/            -- THE ONLY STORAGE IMPLEMENTATION (~51 files)
  doltutil/        -- shared utilities
```

### New Features Since v0.49.2

#### New CLI Commands
| Command | Version | Purpose |
|---------|---------|---------|
| `bd sql` | v0.50.0 | Raw SQL access to underlying database |
| `bd graph` | v0.50.0 | Visualization overhaul (DAG, DOT, HTML) |
| `bd help --all` | v0.50.0 | Complete command reference dump |
| `bd show --watch` | v0.50.0 | Auto-refresh on file changes |
| `bd search` | v0.49.5 | Content and null-check filters |
| `bd promote` | v0.49.5 | Promote wisps to persistent beads |
| `bd todo` | v0.49.5 | Lightweight task management |
| `bd find-duplicates` | v0.49.5 | AI-powered duplicate detection |
| `bd validate` | v0.49.5 | Data-integrity health checks |
| `bd human` | v0.49.4 | Human bead management subcommands |

#### New Built-in Issue Types
| Type | Aliases | Purpose |
|------|---------|---------|
| `decision` | `dec`, `adr` | Decision records (required sections: Decision, Rationale, Alternatives) |
| `message` | - | Threading, ephemeral lifecycle, mail delegation |

**Custom types** (require `types.custom` config): `molecule`, `gate`, `convoy`, `merge-request`, `slot`, `agent`, `role`, `rig`

#### Status Changes
Valid statuses are now: `open`, `in_progress`, `blocked`, `deferred`, `closed`, `pinned`, `hooked`
- **Removed**: `tombstone` (entire tombstone/soft-delete system deleted)
- **New**: `deferred`, `pinned`, `hooked`

> **Extension impact**: `normalizeStatus()` in `types.ts` currently returns `null` for unknown statuses, silently dropping beads. `deferred`, `pinned`, and `hooked` beads will be invisible.

#### Behavioral Changes
- **`bd ready`**: Now returns **open-only** (was open + in_progress). Docs recommend `bd claim <id>` instead of `bd update --status in_progress`.
- **`bd delete`**: Now permanent deletion. Tombstone/soft-delete removed. `--hard` and `--reason` flags gone.
- **`bd sync`**: Silent no-op. "With Dolt-native storage, writes are persisted immediately."
- **`bd update --claim`**: Now uses atomic compare-and-swap via `store.ClaimIssue()`.

#### Removed Issue Fields
| Removed Field | JSON key | Reason |
|---------------|----------|--------|
| `DeletedAt` | `deleted_at` | Tombstone system removed |
| `DeletedBy` | `deleted_by` | Tombstone system removed |
| `DeleteReason` | `delete_reason` | Tombstone system removed |
| `OriginalType` | `original_type` | Tombstone system removed |

#### New Issue Fields (from `internal/types/types.go`)
```go
// Spec/Wisp Fields
SpecID   string   `json:"spec_id,omitempty"`   // Link to specification document
WispType WispType `json:"wisp_type,omitempty"` // heartbeat|ping|patrol|gc_report|recovery|error|escalation

// Slot Fields (exclusive access primitives)
Holder string `json:"holder,omitempty"`

// Source Tracing Fields
SourceFormula  string `json:"source_formula,omitempty"`
SourceLocation string `json:"source_location,omitempty"`

// Agent Identity Fields
HookBead     string     `json:"hook_bead,omitempty"`
RoleBead     string     `json:"role_bead,omitempty"`
AgentState   AgentState `json:"agent_state,omitempty"`   // idle|running|stuck|stopped
LastActivity *time.Time `json:"last_activity,omitempty"`
RoleType     string     `json:"role_type,omitempty"`
Rig          string     `json:"rig,omitempty"`

// Molecule Type Fields
MolType MolType `json:"mol_type,omitempty"` // swarm|patrol|work

// Work Type Fields
WorkType WorkType `json:"work_type,omitempty"` // mutex|open_competition

// Event Fields
EventKind string `json:"event_kind,omitempty"`
Actor     string `json:"actor,omitempty"`
Target    string `json:"target,omitempty"`
Payload   string `json:"payload,omitempty"`
```

#### New `bd list` Flags
- `--label-pattern` - Filter by label glob pattern
- `--label-regex` - Filter by label regex
- `--spec` - Filter by spec_id prefix
- `--wisp-type` - Filter by wisp type (heartbeat, ping, patrol, etc.)
- `--rig` - Query a different rig's database

#### New `bd search` Flags
- `--desc-contains` - Filter by description substring
- `--notes-contains` - Filter by notes substring
- `--empty-description` - Filter issues with empty/missing description
- `--no-assignee` - Filter issues with no assignee
- `--no-labels` - Filter issues with no labels

#### Tracker Plugin Framework (v0.50.1/v0.50.3)
New `internal/tracker/` module with plugin registry:
- `tracker.Register()` + `init()` pattern for auto-discovery
- `Engine` orchestrates Pull -> Detect -> Resolve -> Push
- Adapters for **Linear**, **GitLab**, and **Jira** (all inline packages now)
- `PullHooks` and `PushHooks` for tracker-specific behaviors

#### Installation Changes
- **Homebrew**: Now standard formulae catalog: `brew install beads` (was custom tap)
- **npm**: `npm install -g @beads/bd`
- **Mise**: `mise install github:steveyegge/beads`
- **Install script**: `curl -fsSL .../install.sh | bash`

---

## Current State of vscode-beads

### Architecture (as-built)

```
Extension Host                         Webview (React)
+----------------------------+         +-----------------------+
| extension.ts               |         | DashboardView.tsx     |
| - BeadsProjectManager      |  msg    | IssuesView.tsx        |
|   - discovers .beads dirs  | <-----> | DetailsView.tsx       |
|   - manages daemon lifecycle|        | KanbanBoard.tsx       |
| - View Providers           |         +-----------------------+
+----------------------------+
       |
       v (Unix socket RPC)
+----------------------------+
| BeadsDaemonClient.ts       |
| - socket to .beads/bd.sock |   <--- THIS NO LONGER EXISTS UPSTREAM
| - mutation polling          |
+----------------------------+
```

### What's Broken (Everything)

| Component | Problem | Severity |
|-----------|---------|----------|
| `BeadsDaemonClient.ts` | Connects to daemon socket that no longer exists | **FATAL** |
| `BeadsProjectManager.ts` | Spawns `bd daemon --start/--stop` (command removed) | **FATAL** |
| `BeadsProjectManager.ts` | Checks for `.beads/bd.sock` and `daemon.pid` | **FATAL** |
| `BeadsProjectManager.ts` | Checks for `.beads/beads.db` (SQLite, now Dolt) | **BROKEN** |
| Mutation polling | `get_mutations` RPC operation no longer exists | **FATAL** |
| Dashboard | `onStartDaemon` button handler | Dead UI |
| Error handling | Socket error detection (`ENOENT`, `socket`) | Wrong errors |

### What Still Works (in theory, if rewired)

| Component | Status |
|-----------|--------|
| Webview React components | Fine -- just need data piped differently |
| Types/normalization | Mostly fine -- need new types added |
| View providers | Structure is fine -- need backend swap |
| Build system | Fine |
| Extension registration | Fine |

### Dead Code Inventory

| Code | File | Notes |
|------|------|-------|
| `normalizeBead()` | `types.ts:279` | CLI JSON parser, nothing imports it |
| `BeadsInfo` interface | `types.ts:117` | From CLI era |
| `DaemonInfo` interface | `types.ts:127` | From CLI era |
| `CommandResult` interface | `types.ts:194` | From CLI era |
| `BeadFilters` / `BeadSort` | `types.ts:202-215` | From CLI era |
| `DependencyGraph` | `types.ts:154` | Never used |
| `beads.refreshInterval` config | `package.json` | Defined but never read |
| Various unused `Op` enums | `BeadsDaemonClient.ts` | count, dep_tree, shutdown |

### Existing Bugs (pre-upstream-sync)

1. **`beads.pathToBd` ignored**: `BeadsProjectManager.ts` hardcodes `"bd"` in spawn calls instead of reading the setting
2. **MutationEvent field casing**: Interface uses PascalCase (`Type`, `IssueID`) but daemon API was snake_case -- latent bug or Go default
3. **Unknown status = invisible bead**: `normalizeStatus()` returns null for unknown statuses, silently dropping beads from all views

---

## Options for Unfucking This

### Option A: CLI Backend (Recommended)

Replace daemon socket RPC with `bd <command> --json` subprocess calls. This is what the CLI was always designed for, and what the upstream project now exclusively uses.

**Architecture**:
```
Extension Host                         Webview (React)
+----------------------------+         +-----------------------+
| extension.ts               |         | (unchanged)           |
| - BeadsProjectManager      |  msg    |                       |
|   - discovers .beads dirs  | <-----> |                       |
|   - NO daemon lifecycle    |         |                       |
| - View Providers           |         +-----------------------+
+----------------------------+
       |
       v (child_process.spawn)
+----------------------------+
| BeadsBackend.ts (new)      |
| - bd list --json           |
| - bd show <id> --json      |
| - bd create --json         |
| - bd update <id> --json    |
+----------------------------+
```

**Pros**:
- Aligns perfectly with upstream's direction
- No daemon dependency -- works with any `bd` version
- Simpler architecture -- no socket management, no mutation polling
- `bd` handles all locking, connection management internally

**Cons**:
- No real-time updates (must poll via periodic `bd list --json`)
- Each operation spawns a subprocess (slower than socket, but fine for UI)
- Need to handle `bd` not being installed / wrong version

**Change scope**:
- Delete `BeadsDaemonClient.ts`
- Rewrite `BeadsProjectManager.ts` (remove daemon lifecycle)
- New `BeadsBackend.ts` -- spawn `bd` CLI commands with `--json`
- Update view providers to use new backend
- Replace mutation polling with timer-based refresh
- Update types for new issue types/fields
- Delete dead code

### Option B: Dolt Direct Access

Connect directly to the Dolt database from the extension.

**Pros**: Real-time, no CLI dependency
**Cons**: Couples extension to Dolt internals, requires native module (mysql driver), schema changes break us, embedded vs server mode complexity, advisory lock management. **Not recommended** -- this is exactly what upstream moved away from with the CLI abstraction.

### Option C: MCP Server

Use the `beads-mcp` Python server as the backend instead of CLI or daemon.

**Pros**: Higher-level API, designed for tool consumers
**Cons**: Python dependency, extra process, MCP protocol overhead, may not expose all operations we need. **Not recommended** as primary backend -- maybe as optional future enhancement.

---

## Recommended Path: Option A (CLI Backend)

### What to Keep
- All webview components (React)
- Type system (with additions for new types)
- View provider structure
- Build system
- Extension registration

### What to Delete
- `BeadsDaemonClient.ts` (entire file)
- Daemon references in `BeadsProjectManager.ts`
- Dead code in `types.ts`
- `docs/reference/beads-daemon-api.md`
- Daemon-related error handling in views

### What to Build
1. **`BeadsBackend.ts`** -- CLI wrapper
   - `list(filters?)` -> `bd list --json [--status=X] [--type=Y]`
   - `show(id)` -> `bd show <id> --json`
   - `create(args)` -> `bd create --json --title="..." --type=X`
   - `update(id, args)` -> `bd update <id> --json --status=X`
   - `close(id)` -> `bd close <id> --json`
   - `ready()` -> `bd ready --json`
   - `stats()` -> `bd stats --json`
   - `addDep(from, to, type)` -> `bd dep add <from> <to> --type=X`
   - `removeDep(from, to)` -> `bd dep remove <from> <to>`
   - `addComment(id, text)` -> `bd comment add <id> --text="..."`
   - `listComments(id)` -> `bd comment list <id> --json`
   - `addLabel(id, label)` -> `bd label add <id> <label>`
   - `removeLabel(id, label)` -> `bd label remove <id> <label>`

2. **Refresh strategy** -- Timer-based polling
   - Default interval: 5-10 seconds (configurable via `beads.refreshInterval`)
   - Immediate refresh after mutations (create/update/close/dep)
   - File watcher on `.beads/` directory as optimization signal

3. **Project detection update**
   - Check for `.beads/` directory (still valid)
   - Remove `.beads/beads.db` check -- look for `.beads/dolt/` or `.beads/metadata.json`
   - Remove daemon socket/PID checks
   - Version detection via `bd --version`

4. **Type updates**
   - Add `BeadType`: `decision`, `message`, `gate`, `convoy`
   - Add `BeadStatus`: handle `deferred`, `review` etc. gracefully (don't silently drop)
   - Add new issue fields: `holder`, `agentState`, `rig`, `molType`, `workType`, etc.
   - Add `DependencyType`: `supersedes`, `duplicates`, `replies_to`

### Migration Concerns

- Users on old beads versions (< v0.50.0) would break if we remove daemon support. But given the pace of upstream changes, supporting pre-v0.50.0 seems impractical.
- The extension should detect beads version and show clear error if too old.
- Consider a minimum version check: `bd --version` >= v0.50.0.

---

## Version Compatibility Matrix

| Extension Version | Beads Version | Status |
|-------------------|---------------|--------|
| Current (0.12.0) | <= v0.49.2 | Works (daemon exists) |
| Current (0.12.0) | v0.49.3-v0.49.6 | Probably works |
| Current (0.12.0) | >= v0.50.0 | **Completely broken** |
| After rewrite | <= v0.49.x | Broken (no daemon fallback) |
| After rewrite | >= v0.50.0 | Works |

---

## Immediate Next Steps

1. **Update local beads installation** to v0.51.0 (currently on old version from homebrew tap)
   - `brew install beads` (new standard formula) or install via script
2. **Create implementation plan** for CLI backend rewrite
3. **Branch**: `feat/cli-backend-rewrite`
4. **Phase 1**: New `BeadsBackend.ts` + update `BeadsProjectManager.ts`
5. **Phase 2**: Wire up view providers to new backend
6. **Phase 3**: Update types for new issue types/fields
7. **Phase 4**: Clean up dead code, update docs, update CLAUDE.md
