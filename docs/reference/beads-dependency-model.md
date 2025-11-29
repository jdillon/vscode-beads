# Beads Dependency Model Reference

This document explains the Beads dependency model for developers working on UI representations, particularly the vscode-beads extension.

## The Problem We're Solving

The current UI only shows "Depends On" and "Blocks" which conflates fundamentally different relationship types:

- An epic showing "BLOCKS" its child tasks is **semantically wrong** - the epic *contains* them, it doesn't block them
- A task showing "DEPENDS ON" its parent epic is **misleading** - it's expressing containment, not a workflow blocker
- The direction of relationships is unclear without proper labeling

## Core Concept: Directed Edges in a Graph

Every dependency in Beads is a **directed edge** between two issues:

```
from_id ──[type]──> to_id
```

The CLI command `bd dep add <from_id> <to_id> --type <type>` creates an edge where `from_id` has a relationship to `to_id`.

**Critical insight**: When displaying issue X's details, we need to show:
1. **Outgoing edges**: Where X is the `from_id` (X points to something)
2. **Incoming edges**: Where X is the `to_id` (something points to X)

The **same edge type** requires **different labels** depending on which side of the edge the displayed issue sits.

---

## The Four Dependency Types

### 1. `blocks` — Workflow Dependencies

**Semantics**: Hard blocker - work cannot proceed until the blocker is resolved. This is the only type that affects `bd ready` detection.

**Edge direction**: `blocked_issue ──[blocks]──> blocking_issue`

The CLI reads naturally: `bd dep add bd-task bd-blocker` means "bd-task is blocked by bd-blocker"

**UI Display for Issue X**:

| X's Position | Edge Direction | UI Section Header | Meaning |
|--------------|----------------|-------------------|---------|
| X is `from_id` | X → Y | **Blocked By** | X cannot start until Y completes |
| X is `to_id` | Y → X | **Blocks** | X is preventing Y from starting |

**Icon suggestions**:
- Blocked By: `⛔` or `🚫` or `←` (incoming blocker)
- Blocks: `▶` or `→` (outgoing impact)

**Example**: If viewing `vsbeads-n64`:
- "Blocked By: vsbeads-abc" = n64 can't start until abc is done
- "Blocks: vsbeads-xyz" = xyz is waiting on n64

---

### 2. `parent-child` — Hierarchical Containment

**Semantics**: Organizational grouping. Epics contain stories, stories contain tasks. This is NOT a workflow blocker.

**Edge direction**: `child_issue ──[parent-child]──> parent_issue`

The child references its parent. CLI: `bd dep add bd-task bd-epic --type parent-child`

**UI Display for Issue X**:

| X's Position | Edge Direction | UI Section Header | Meaning |
|--------------|----------------|-------------------|---------|
| X is `from_id` | X → Y | **Parent** | X belongs to Y |
| X is `to_id` | Y → X | **Children** | Y belongs to X |

**Icon suggestions**:
- Parent: `↑` or `📁` or folder icon
- Children: `↓` or `📄` or document icon (consider indentation or tree view)

**Example**: If viewing epic `vsbeads-3cn`:
- Current UI wrongly shows "BLOCKS" with 9 issues
- Should show "Children" section with those 9 issues
- Makes clear this is containment, not workflow blocking

**Display enhancement**: Children could show as an indented list or tree to reinforce hierarchy:
```
CHILDREN (9)
  ├─ vsbeads-5c0  Sub-agent browser automation...     Open   P2
  ├─ vsbeads-n64  Build optimized agent automation... Open   P2
  └─ vsbeads-uak  Research: macOS window screenshot   Open   P3
```

---

### 3. `related` — Informational Links

**Semantics**: Soft relationship - issues are connected conceptually but neither blocks the other. Similar to JIRA's "relates to" link.

**Edge direction**: `issue_a ──[related]──> issue_b`

Note: This is arguably bidirectional in meaning, but stored as a directed edge.

**UI Display for Issue X**:

| X's Position | Edge Direction | UI Section Header | Meaning |
|--------------|----------------|-------------------|---------|
| X is `from_id` | X → Y | **Related To** | X references Y |
| X is `to_id` | Y → X | **Related From** | Y references X |

**Alternative (simpler)**: If bidirectionality is preferred, combine into single "Related" section, but use subtle directional indicators:

```
RELATED
  → vsbeads-abc  (this issue links to abc)
  ← vsbeads-xyz  (xyz links to this issue)
```

**Icon suggestions**:
- Related To: `→` or `🔗→`  
- Related From: `←` or `←🔗`
- Combined: `↔` or `🔗`

---

### 4. `discovered-from` — Provenance Tracking

**Semantics**: Issue X was discovered while working on issue Y. This creates an audit trail showing where work originated. Not a blocker.

**Edge direction**: `discovered_issue ──[discovered-from]──> source_issue`

CLI: `bd dep add bd-new-bug bd-original-task --type discovered-from`

**UI Display for Issue X**:

| X's Position | Edge Direction | UI Section Header | Meaning |
|--------------|----------------|-------------------|---------|
| X is `from_id` | X → Y | **Discovered While Working On** | X was found during work on Y |
| X is `to_id` | Y → X | **Led To Discovery Of** | Work on X uncovered Y |

**Shorter alternatives**:
- "Discovered While Working On" → **Discovered From** or **Origin**
- "Led To Discovery Of" → **Discovered** or **Spawned**

**Icon suggestions**:
- Discovered From: `🔍←` or `◀` (points back to origin)
- Led To Discovery Of: `🔍→` or `▶` (points to what was found)

**Example**: Bug `bd-bug1` discovered while working on feature `bd-feat1`:
- Viewing `bd-bug1`: "Discovered From: bd-feat1"
- Viewing `bd-feat1`: "Discovered: bd-bug1"

---

## Recommended UI Section Order

When displaying an issue's details, group relationships logically:

```
HIERARCHY
  Parent:    [epic link if applicable]
  Children:  [child issues if applicable]

WORKFLOW  
  Blocked By:  [issues preventing this from starting]
  Blocks:      [issues waiting on this]

PROVENANCE
  Discovered From:  [origin issue]
  Discovered:       [issues found during this work]

RELATED
  Related To:    [outgoing related links]
  Related From:  [incoming related links]
```

Or simplified with icons:

```
DEPENDENCIES
  ↑ Parent        vsbeads-3cn  Agent-Driven VS Code Extension...
  
  ⛔ Blocked By   vsbeads-abc  Some blocking issue...
  → Blocks        vsbeads-xyz  Issue waiting on this...
  
  ◀ Origin        vsbeads-feat Original feature work
  ▶ Spawned       vsbeads-bug2 Bug found during this
  
  🔗 Related      vsbeads-ref  Related reference issue
```

---

## Implementation Notes

### Querying Dependencies

When loading issue X's details, you need TWO queries:

1. **Outgoing**: `SELECT * FROM dependencies WHERE from_id = X`
2. **Incoming**: `SELECT * FROM dependencies WHERE to_id = X`

Then categorize by type and direction for display.

### JSON Structure from `bd show --json`

The `bd show` command returns dependencies. Verify the exact structure, but expect something like:

```json
{
  "id": "vsbeads-n64",
  "dependencies": [
    { "to_id": "vsbeads-3cn", "type": "parent-child" },
    { "to_id": "vsbeads-abc", "type": "blocks" }
  ],
  "dependents": [
    { "from_id": "vsbeads-5c0", "type": "blocks" }
  ]
}
```

Map these to UI sections:
- `dependencies` (outgoing from this issue) with `type: "blocks"` → "Blocked By"
- `dependents` (incoming to this issue) with `type: "blocks"` → "Blocks"
- `dependencies` with `type: "parent-child"` → "Parent"
- `dependents` with `type: "parent-child"` → "Children"

### Handling Missing Types

If the dependency type isn't available (legacy data), fall back to current behavior but consider adding a visual indicator that the relationship type is unknown.

---

## Quick Reference Card

| Type | Outgoing (X → Y) | Incoming (Y → X) | Affects Ready? |
|------|------------------|------------------|----------------|
| `blocks` | **Blocked By** Y | **Blocks** Y | ✅ Yes |
| `parent-child` | **Parent:** Y | **Child:** Y | ❌ No |
| `discovered-from` | **Discovered From** Y | **Discovered:** Y | ❌ No |
| `related` | **Related To** Y | **Related From** Y | ❌ No |

---

## Visual Mockup: Before vs After

### BEFORE (Current - Confusing)
```
DEPENDS ON
  vsbeads-3cn  Agent-Driven VS Code Extension...  In Progress  P2

BLOCKS  
  vsbeads-5c0  Sub-agent browser automation...    Open         P2
```

### AFTER (Proposed - Clear)
```
PARENT
  📁 vsbeads-3cn  Agent-Driven VS Code Extension...  In Progress  P2

BLOCKS
  → vsbeads-5c0  Sub-agent browser automation...     Open         P2
```

The epic view (`vsbeads-3cn`) would change from showing "BLOCKS" with 9 items to:

```
CHILDREN (9)
  📄 vsbeads-5c0  Sub-agent browser automation...     Open    P2
  📄 vsbeads-n64  Build optimized agent automation... Open    P2
  📄 vsbeads-uak  Research: macOS window screenshot   Open    P3
  ...
```