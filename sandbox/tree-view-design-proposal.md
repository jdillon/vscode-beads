# Tree View Design Proposal

**Bead:** vsbeads-bxnb
**Goal:** Add optional tree/hierarchy view to Issues list

## Context

Currently, the Issues panel shows a flat list with filtering/sorting. Beads support parent-child relationships via `dependency_type: "parent-child"` (e.g., epics with child tasks). The IDEA-style toggle between list/tree views would let users see hierarchy when useful.

**Current data model supports this:**
- `Bead.dependsOn` and `Bead.blocks` arrays contain `BeadDependency` with `dependencyType: "parent-child"`
- Epics naturally have children via this mechanism (see `vsbeads-4e7` with 9 children)

**TanStack Table supports this:**
- `getSubRows()` option defines child relationships
- `getExpandedRowModel()` provides row expansion
- APIs: `row.getCanExpand()`, `row.getIsExpanded()`, `row.getToggleExpandedHandler()`

---

## Design Options

### Option A: View Mode Toggle (Recommended)

**Approach:** IDEA-style toggle in toolbar switches between "List" and "Tree" modes.

```
┌─────────────────────────────────────────────────────────────┐
│ [Project ▼] [Search...       ] [Filter] [📋 List | 🌲 Tree] │
├─────────────────────────────────────────────────────────────┤
│ Tree mode:                                                  │
│ ▼ 🟣 vsbeads-4e7 E2E Testing Infrastructure    open    P1  │
│   ├ 🟡 vsbeads-ur9 Set up Playwright...        open    P2  │
│   ├ 🟡 vsbeads-dxo Create code-server fixture  open    P2  │
│   └ 🟡 vsbeads-w2x Write first E2E test        open    P2  │
│ ▼ 🟣 vsbeads-xyz Another Epic                  open    P2  │
│   ├ 🟡 vsbeads-abc Child task 1                open    P3  │
│   └ 🟡 vsbeads-def Child task 2                blocked P2  │
│ 🔴 vsbeads-u5xh Details panel bug (no parent)  open    P0  │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Same table component, just different data shape
- TanStack Table handles expand/collapse natively
- Minimal UI changes (add toggle + expand column)
- State persistence (remember user preference)

**Cons:**
- Need to pre-process flat bead list into tree structure
- Filtering in tree mode needs thought (show parent if child matches?)
- Sorting within tree is tricky (preserve hierarchy?)

**Implementation:**
1. Add view mode toggle (`list | tree`) to toolbar
2. Build tree structure from flat beads using parent-child deps
3. In tree mode, use `getSubRows()` and `getExpandedRowModel()`
4. Add expand/collapse chevron column (first column)
5. Indent child rows via CSS

---

### Option B: Expand Column in Existing Table

**Approach:** Add expand/collapse as first column, always visible. Parent rows show chevron.

```
┌────────────────────────────────────────────────────────────┐
│ ⊞│ Type  │ Title                           │ Status │ Pri │
├────────────────────────────────────────────────────────────┤
│ ▼│ 🟣 epic│ E2E Testing Infrastructure      │ open   │ P1  │
│  │ 🟡 task│   Set up Playwright...          │ open   │ P2  │
│  │ 🟡 task│   Create code-server fixture    │ open   │ P2  │
│ ▶│ 🟣 epic│ Another Epic (3 children)       │ open   │ P2  │
│  │ 🔴 bug │ Details panel bug               │ open   │ P0  │
└────────────────────────────────────────────────────────────┘
```

**Pros:**
- Always shows hierarchy context
- No mode toggle needed
- Discover-able (see the chevrons)

**Cons:**
- Always tree-structured, no flat option
- Clutters UI when hierarchy isn't relevant
- Harder to scan quickly

---

### Option C: Dedicated Tree Panel

**Approach:** Separate webview panel with tree-only navigation (like IDEA Project view).

**Pros:**
- Complete separation of concerns
- Could show different data (e.g., only epics and their children)
- More room for tree-specific features (drag-drop reordering, etc.)

**Cons:**
- Major new feature, not just enhancement
- Duplicate selection state management
- Overkill for current needs

---

## Recommendation

**Option A (View Mode Toggle)** balances power and simplicity:

- Matches IDEA pattern Jason mentioned
- Leverages existing TanStack Table investment
- Minimal UI footprint (single toggle)
- Clean separation: list for quick scanning, tree for hierarchy work

---

## Questions to Clarify

1. **Tree structure basis:** Use only `parent-child` deps, or also include `blocks`?
   - Recommendation: Only `parent-child` for tree hierarchy

2. **Orphan handling:** Items with no parent shown at root? At end?
   - Recommendation: Root level, sorted normally

3. **Filtering behavior in tree mode:**
   - A) Show matching items + their ancestors (keep context)
   - B) Show only matching items (loses hierarchy)
   - C) Show matching + ancestors + all siblings (full subtree)
   - Recommendation: (A) for clarity

4. **Sorting in tree mode:**
   - A) Sort root items, children sorted within parent
   - B) Flatten and sort globally (defeats hierarchy)
   - Recommendation: (A)

5. **Default state:** All collapsed? All expanded? Remember last state?
   - Recommendation: Collapsed by default, remember expand state per session

---

## Data Transformation

To build tree from flat list:

```typescript
interface TreeBead extends Bead {
  subRows?: TreeBead[];
}

function buildTree(beads: Bead[]): TreeBead[] {
  const beadMap = new Map(beads.map(b => [b.id, { ...b, subRows: [] }]));
  const roots: TreeBead[] = [];

  for (const bead of beads) {
    const treeBead = beadMap.get(bead.id)!;
    const parent = bead.dependsOn?.find(d => d.dependencyType === 'parent-child');
    if (parent && beadMap.has(parent.id)) {
      beadMap.get(parent.id)!.subRows!.push(treeBead);
    } else {
      roots.push(treeBead);
    }
  }

  return roots;
}
```

Then in table config:

```typescript
const table = useReactTable({
  data: viewMode === 'tree' ? buildTree(beads) : beads,
  getSubRows: viewMode === 'tree' ? (row) => row.subRows : undefined,
  getExpandedRowModel: viewMode === 'tree' ? getExpandedRowModel() : undefined,
  // ... existing config
});
```

---

## Implementation Steps (if approved)

1. Add `ViewModeToggle` component (List | Tree buttons)
2. Add `viewMode` state to IssuesView
3. Create `buildTree()` utility function
4. Add expand column with chevron icons
5. Wire up TanStack expand APIs
6. Add row indentation CSS for nested levels
7. Handle filtering (show ancestors of matches)
8. Persist view mode preference
