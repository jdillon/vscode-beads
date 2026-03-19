# Upstream Beads Sync Check

Check the upstream beads repo for changes that affect vscode-beads.

## Output

Write your report to: `docs/upstream-sync/{{YYYY-MM-DD}}-upstream-sync-report.md` (use today's date).

---

## Process

### Step 1: Fetch Latest Upstream

```bash
cd ~/ws/reference/beads
git fetch origin
git stash  # if needed
git pull origin main
```

Note the current version tag:
```bash
git describe --tags --abbrev=0
```

### Step 2: Determine Last Sync Point

Read the last sync point from `docs/upstream-sync/README.md` (the "Current Sync Point" section).

After completing the sync report, update README.md with:
- New sync point version
- Entry in Sync History table
- Link to new report in Reports section
- Updated Pending Updates checklist

### Step 3: Analyze Relevant Files

For each area below, check for changes since the last sync point.

#### Types & Schema (`internal/types/types.go`)

Check for new or changed:
- **Status values**: `StatusOpen`, `StatusInProgress`, `StatusBlocked`, `StatusClosed`, etc.
- **IssueType values**: `TypeBug`, `TypeFeature`, `TypeTask`, `TypeEpic`, etc.
- **New fields** on the Issue struct that should be displayed

```bash
git diff <last-sync>..HEAD -- internal/types/types.go
```

**What to update in vscode-beads:**
- `src/webview/types.ts`: BeadStatus, BeadType, colors, labels, sort order
- `src/webview/icons/`: Add icons for new types
- `src/webview/common/TypeIcon.tsx`: Icon mappings

#### Daemon API (`internal/rpc/protocol.go`)

Check for new or changed RPC operations:
```bash
git diff <last-sync>..HEAD -- internal/rpc/protocol.go
```

**What to update in vscode-beads:**
- `src/backend/BeadsDaemonClient.ts`: Add new RPC methods
- `docs/reference/beads-daemon-api.md`: Document new operations

#### Dependency Model (`internal/storage/sqlite/dependencies.go`)

Check for changes to dependency handling:
```bash
git diff <last-sync>..HEAD -- internal/storage/sqlite/dependencies.go
```

**What to update in vscode-beads:**
- `docs/reference/beads-dependency-model.md`: Update if model changes

#### Protected Branch / Sync (`internal/syncbranch/`)

Check for changes to the sync branch workflow:
```bash
git diff <last-sync>..HEAD -- internal/syncbranch/
```

**What to update in vscode-beads:**
- `docs/reference/beads-protected-branch.md`: Update workflow docs

#### CLI Commands

Check for new commands or flags:
```bash
git diff <last-sync>..HEAD -- cmd/bd/*.go | grep -E "^[\+\-].*cobra|Cmd|Flag"
```

**What to update in vscode-beads:**
- `src/backend/BeadsBackend.ts`: Add support for new CLI features

#### Daemon Lifecycle (`cmd/bd/daemon*.go`, `cmd/bd/main_daemon.go`)

Check for changes to daemon start/stop/status commands:
```bash
git diff <last-sync>..HEAD -- cmd/bd/daemon*.go cmd/bd/main_daemon.go
```

**What to update in vscode-beads:**
- `src/backend/BeadsBackend.ts`: Daemon start/stop methods
- `src/backend/BeadsProjectManager.ts`: Daemon lifecycle management

### Step 4: Write Report

The report should include:
- Summary of what changed
- Detailed analysis by area (only areas with relevant changes)
- **For each changed upstream file, include a markdown link** like `[types.go](~/ws/reference/beads/internal/types/types.go)` for easy navigation
- **For new concepts** (types, statuses, fields), explain what they're for and the use-case - check commit messages, code comments, and docs for context
- Proposed plan with priorities (P1: breaking, P2: new types, P3: enhancements, P4: docs)
- Outstanding questions needing answers
- Sync checklist
- Recommended next steps
- Record the sync point (tag or commit hash)

Be thorough but concise. Focus on changes that actually impact vscode-beads.

---

## Reference Docs We Maintain

| Doc | Tracks |
|-----|--------|
| `docs/upstream-sync/` | Sync point, history, reports |
| `docs/reference/beads-daemon-api.md` | RPC protocol, daemon operations |
| `docs/reference/beads-dependency-model.md` | Dependency types, blocking semantics |
| `docs/reference/beads-protected-branch.md` | Sync branch workflow, worktree setup |
| `docs/reference/beads-caveats.md` | Known limitations, edge cases |
