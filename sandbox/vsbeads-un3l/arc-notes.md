# UI Improvements Sprint 2025-12-29

Arc ID: vsbeads-un3l
Source: bead
Started: 2025-12-29

## Mindsets
(none loaded)

## Context
Sprint to address UI bugs and improvements in vscode-beads extension. Focus areas:
- Tooltip rendering (raw markdown showing)
- Markdown file links not working
- Labels column empty on fresh startup

## Structure
```
vsbeads-un3l (epic) - UI Improvements Sprint 2025-12-29
├── vsbeads-u5xh [P0 bug] Children list vanishes on update
├── vsbeads-2byn [P2] Markdown file links - DONE
├── vsbeads-79pr [P2] Tooltip markdown - DONE
├── vsbeads-mwic [P2 task] Re-sync from v0.37.0 - DONE
├── vsbeads-re92 [P2] Labels empty - DONE
└── vsbeads-el1i [P3 task] Old sync task - DONE
```

## Learnings
- Webview initialization race condition: Don't call initializeView() before React is ready. Wait for "ready" message.

## Discovered Work
(none yet)

## References
- Previous session explored hierarchical ID parent-child mechanism (vsbeads-3ly3, closed)

## Cycle Log
### Cycle 1 - 2025-12-29
Started arc for UI improvements sprint

Done: Setup arc, linked child beads
Next: Start with vsbeads-re92 (labels empty on startup)
Notes: Previous session investigated hierarchical ID mechanism (working correctly)

### Cycle 2 - 2025-12-29
Fixed labels empty on startup bug

Done: vsbeads-re92 (PR #55)
Next: vsbeads-2byn (markdown file links)
Notes: Race condition in BaseViewProvider - initializeView() called before React ready

### Cycle 3 - 2025-12-29
Implemented markdown file links

Done: vsbeads-2byn (committed, PR #55 updated)
- Added `openFile` message type to WebviewToExtensionMessage
- Added `handleOpenFile` in BaseViewProvider to open files with optional line number
- Modified Markdown component to intercept link clicks
- Relative paths resolved against active project root
- Line anchors supported (#L42)
- External URLs pass through to default browser behavior

Next: vsbeads-79pr (tooltip shows raw markdown)

### Cycle 4 - 2025-12-29
Fixed tooltip + created upstream sync process

Done:
- vsbeads-79pr: Custom markdown tooltip replacing native title attribute
- vsbeads-4m5i: Created /upstream-sync command with docs/upstream-sync/ for reports

Added to epic:
- vsbeads-u5xh (P0 - children list vanishing, may be race condition)
- vsbeads-el1i (old sync task, close after mwic)
- vsbeads-mwic (re-sync from v0.37.0 to cover el1i + u5xh context)

Upstream sync analysis found:
- hooked status (GUPP agent work assignment)
- agent/role types (swarm coordination)
- New daemon API fields

Next: vsbeads-mwic (re-sync from v0.37.0) or vsbeads-u5xh (P0 bug)
Notes: vsbeads-u5xh may already be fixed by same race condition fix as vsbeads-re92

### Cycle 5 - 2025-12-29
Completed upstream sync + analyzed P0 bug

Done:
- vsbeads-mwic: Updated report v0.37.0 → v0.40.0, added wisp→ephemeral + created_by
- vsbeads-el1i: Closed (superseded by mwic)
- vsbeads-u5xh: Identified and fixed root cause

Key upstream changes:
- `wisp` → `ephemeral` API rename
- `created_by` field for audit trails
- `hooked` status, `agent`/`role` types, `MolType` enum
- New CLI: worktree, agent, slot, where

P0 bug analysis (vsbeads-u5xh):
- Root cause: Race condition in BaseViewProvider.refresh()
- refresh() calls loadData() without awaiting
- Multiple concurrent loadData() calls can complete out of order
- Stale responses can overwrite newer data, causing dependencies to vanish
- Fix: Request sequencing with loadSequence counter in BeadDetailsViewProvider

Next: Test the fix, close vsbeads-u5xh if verified
Notes: Sync point now v0.40.0 (64d5f20b)
