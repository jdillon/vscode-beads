# Upstream Sync Report: v0.37.0 -> v0.40.0

**Generated**: 2025-12-29
**Reference repo**: `~/ws/reference/beads` at v0.40.0
**Sync target**: vscode-beads

---

## Summary

The upstream beads repo has significant changes since v0.37.0, introducing agent identity, swarm coordination, and API refinements. Key changes requiring updates:

1. **Field rename**: `wisp` → `ephemeral` (API change)
2. **New field**: `created_by` - track issue creator
3. **New status**: `hooked` - for GUPP work assignment
4. **New types**: `agent`, `role` - for agent identity beads
5. **New fields**: Agent state, molecule type, reparenting support
6. **New dependency types**: Several new edge types for graph relationships
7. **New RPC operations**: Agent slot management, parent reparenting

---

## Detailed Changes by Area

### 0. API Changes (v0.37.0 → v0.38.0)

**Field Rename: `wisp` → `ephemeral`**

The `wisp` field was renamed to `ephemeral` across all APIs:
- [types.go](~/ws/reference/beads/internal/types/types.go): `Issue.Wisp` → `Issue.Ephemeral`
- [protocol.go](~/ws/reference/beads/internal/rpc/protocol.go): CreateArgs, UpdateArgs, ListArgs

This is an API change - vscode-beads doesn't currently use this field, but should track the new name.

**New Field: `created_by`**

New field to track who created an issue (GH#748):
```go
CreatedBy string `json:"created_by,omitempty"` // Who created this issue
```

Added to Issue struct and CreateArgs. Useful for audit trails.

**vscode-beads Impact**:
- `BeadsDaemonClient.ts`: Use `ephemeral` not `wisp` if implementing ephemeral issue support
- Consider exposing `created_by` in issue details view

### 1. Types & Status (`internal/types/types.go`)

**New Status: `hooked`**
```go
StatusHooked Status = "hooked" // Work attached to an agent's hook (GUPP)
```
- Used for work assignment in GUPP (Get Up, Pick Pebble) workflow
- Beads with this status are assigned to an agent's "hook" slot

**New Types: `agent`, `role`**
```go
TypeAgent IssueType = "agent" // Agent identity bead
TypeRole  IssueType = "role"  // Agent role definition
```
- These represent agents-as-beads for swarm coordination
- Probably niche for now, but should be supported for completeness

**New Agent State Enum**
```go
type AgentState string
const (
  StateIdle, StateSpawning, StateRunning, StateWorking,
  StateStuck, StateDone, StateStopped, StateDead
)
```
- For tracking agent bead lifecycle

**New MolType Enum**
```go
type MolType string
const (
  MolTypeSwarm  = "swarm"  // Coordinated multi-polecat work
  MolTypePatrol = "patrol" // Recurring operational work
  MolTypeWork   = "work"   // Regular work (default)
)
```
- Classifies molecule beads for swarm coordination

**New Issue Fields**
- `HookBead string` - Current work on agent's hook
- `RoleBead string` - Role definition bead for agent
- `AgentState AgentState` - Agent lifecycle state
- `LastActivity *time.Time` - For timeout detection
- `RoleType string` - Role classification
- `Rig string` - Rig name for multi-rig setups
- `MolType MolType` - Molecule type classification

**vscode-beads Impact**:
- `src/webview/types.ts`: Add `hooked` to `BeadStatus`, add `agent`/`role` to `BeadType`
- Add STATUS_LABELS, STATUS_COLORS entries for `hooked`
- Add TYPE_LABELS, TYPE_COLORS, TYPE_TEXT_COLORS, TYPE_SORT_ORDER for `agent`, `role`
- Consider adding icons for new types in `src/webview/icons/`

### 2. Daemon RPC API (`internal/rpc/protocol.go`)

**Updated CreateArgs**
```go
MolType string `json:"mol_type,omitempty"` // swarm, patrol, or work
```

**Updated UpdateArgs**
```go
Parent       *string `json:"parent,omitempty"`       // Reparent issue
HookBead     *string `json:"hook_bead,omitempty"`    // Agent hook slot
RoleBead     *string `json:"role_bead,omitempty"`    // Agent role definition
AgentState   *string `json:"agent_state,omitempty"`  // Agent state
LastActivity *bool   `json:"last_activity,omitempty"`// Update last_activity timestamp
```

**Updated ListArgs**
```go
MolType string `json:"mol_type,omitempty"` // Filter by molecule type
```

**Updated ReadyArgs**
```go
MolType string `json:"mol_type,omitempty"` // Filter by molecule type
```

**vscode-beads Impact**:
- `BeadsDaemonClient.ts`: Add `mol_type` to CreateArgs, ListArgs, ReadyArgs
- Add `parent`, `hook_bead`, `role_bead`, `agent_state`, `last_activity` to UpdateArgs
- Update `docs/reference/beads-daemon-api.md` with new fields

### 3. Dependency Model

**New Dependency Types** (already existed, need to verify in vscode-beads):
```go
DepConditionalBlocks = "conditional-blocks" // B runs only if A fails
DepWaitsFor          = "waits-for"          // Fanout gate
DepRepliesTo         = "replies-to"         // Conversation threading
DepRelatesTo         = "relates-to"         // Loose knowledge graph
DepDuplicates        = "duplicates"
DepSupersedes        = "supersedes"
DepAuthoredBy        = "authored-by"
DepAssignedTo        = "assigned-to"
DepApprovedBy        = "approved-by"
```

**Performance Fix**: O(2^n) -> O(V+E) cycle detection (PR #775)
- Internal optimization, no API change

**vscode-beads Impact**:
- `src/webview/types.ts`: Update `DependencyType` to include new types (currently only has 4)
- May want to add UI for displaying these in dependency views

### 4. Sync Branch (`internal/syncbranch/`)

**Removed**: `fetchAndRebaseInWorktree()` - deprecated, replaced by content-merge
- Cleanup only, no external API change

**Comment Cleanup**: Removed `bd-xxx` issue references from comments
- No functional change

**vscode-beads Impact**: None. Internal refactoring only.

### 5. CLI Commands

**New Commands** (mostly not relevant to extension):
- `bd admin parent` - Parent command for cleanup/compact/reset
- `bd agent state` - Agent state reporting
- `bd agent heartbeat` - Update agent last_activity
- `bd agent show` - Show agent bead
- `bd swarm create|status|validate` - Swarm coordination
- `bd repair` - Fix orphaned foreign key refs
- `bd orphans` - Find orphaned issues
- `bd where` - Show active beads location
- `bd worktree` - Parallel development
- `bd slot` - Agent bead slot management

**New Flags**:
- `bd close --reason` / `--resolution` - Close reason (already in UpdateArgs)
- `bd close --continue` / `--no-auto` / `--suggest-next` - Workflow helpers
- `bd update --parent` - Reparent issues
- `bd delete --reason` - Audit trail
- `bd show --short` - Compact output
- `bd compact --purge-tombstones` - Dependency-aware cleanup
- `bd doctor --deep` - Full graph validation
- `bd init --from-jsonl` - Preserve manual cleanups

**vscode-beads Impact**:
- Most CLI changes don't affect the extension directly
- `--parent` flag for reparenting is exposed via daemon API (covered above)
- Could eventually expose `bd doctor --deep` for workspace health checks

### 6. Daemon Lifecycle

**New Feature**: Auto-bypass daemon for wisp operations (`bd-ta4r`)
- Ephemeral issue operations bypass daemon for performance
- No extension impact - handled internally by daemon

**Comment Cleanup**: Removed `bd-xxx` issue references
- No functional change

**vscode-beads Impact**: None. Internal optimization.

---

## Proposed Plan

### Priority 1: Breaking Changes (None)
No breaking changes detected.

### Priority 2: New Types/Status (Medium Impact)

**Task 1: Add `hooked` status**
- File: `src/webview/types.ts`
- Add to `BeadStatus` type
- Add to `STATUS_LABELS`: `hooked: "hooked"`
- Add to `STATUS_COLORS`: `hooked: "#f59e0b"` (amber - between in_progress and blocked)
- Backend already normalizes unknown statuses

**Task 2: Add `agent` and `role` types**
- File: `src/webview/types.ts`
- Add to `BeadType` union
- Add to `TYPE_LABELS`, `TYPE_COLORS`, `TYPE_TEXT_COLORS`, `TYPE_SORT_ORDER`
- Suggested colors: agent=#8b5cf6 (violet), role=#ec4899 (pink)
- File: `src/webview/icons/` - Add icons (robot for agent, badge for role)
- File: `src/webview/common/TypeIcon.tsx` - Add icon mappings

### Priority 3: API Updates (Low Impact)

**Task 3: Update daemon client types**
- File: `src/backend/BeadsDaemonClient.ts`
- Add `mol_type` to CreateArgs, ListArgs, ReadyArgs
- Add `parent` to UpdateArgs (enables reparenting via UI)
- Agent-specific fields (hook_bead, role_bead, agent_state) can wait

**Task 4: Update dependency types**
- File: `src/webview/types.ts`
- Expand `DependencyType` to include new types
- Current: `"blocks" | "parent-child" | "related" | "discovered-from"`
- Add: `"conditional-blocks" | "waits-for" | "replies-to" | "relates-to" | "duplicates" | "supersedes"`

### Priority 4: Documentation

**Task 5: Update reference docs**
- `docs/reference/beads-daemon-api.md` - Add new RPC fields
- No changes needed for `beads-protected-branch.md` (internal refactoring only)

---

## Outstanding Questions

1. **Status color for `hooked`**: What color best represents "assigned to agent hook"? Proposed amber (#f59e0b) to distinguish from in_progress (blue).

2. **Agent/role types**: Are these commonly used? May want to deprioritize icon creation if rarely seen.

3. **MolType filtering**: Should the list view expose molecule type filtering? Probably not needed for typical use.

4. **Reparenting UI**: The `--parent` flag enables reparenting via API. Should we expose this in the UI (e.g., drag-drop in tree view)?

---

## Sync Checklist

- [ ] Track `wisp` → `ephemeral` rename (if using ephemeral issues)
- [ ] Consider exposing `created_by` in issue details
- [ ] Add `hooked` status to types.ts
- [ ] Add `agent`, `role` types to types.ts
- [ ] Update BeadsDaemonClient with new fields
- [ ] Expand DependencyType union
- [ ] Add icons for new types (optional)
- [ ] Update beads-daemon-api.md
- [ ] Create beads for identified work
- [ ] Record sync point: v0.40.0 / 64d5f20b

---

## Recommended Next Steps

1. Create beads for Priority 2 tasks (status + types)
2. Implement in a single PR since changes are small and related
3. Skip agent-specific fields for now (niche use case)
4. Update documentation after code changes
