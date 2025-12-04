# Component Architecture Proposal

Analysis of vscode-beads webview component architecture with recommendations for TanStack adoption and component refactoring.

## Current State

### Architecture Overview

```
src/webview/
├── index.tsx          # React DOM mount
├── App.tsx            # View router + global state (11 fields)
├── types.ts           # Shared types + message definitions
├── styles.css         # All styles (1000+ lines)
├── common/            # 15 reusable components
│   ├── StatusBadge, PriorityBadge, TypeBadge, LabelBadge
│   ├── Dropdown, DropdownItem, ColoredSelect
│   ├── FilterChip, ProjectDropdown
│   ├── Toast, Loading, ErrorMessage, Markdown
│   └── ChevronIcon
└── views/             # 3 main views
    ├── DashboardView.tsx    (~230 LOC)
    ├── IssuesView.tsx       (~710 LOC)
    ├── IssuesViewTanStack.tsx (~700 LOC) ← spike
    └── DetailsView.tsx      (~660 LOC)
```

### Data Flow

```
Extension (backend)
    ↓ postMessage({ type: "setBeads", beads })
App.tsx (handleMessage → setState)
    ↓ props
Views (DashboardView, IssuesView, DetailsView)
    ↓ user action
postMessage({ type: "updateBead", beadId, updates })
    ↓
Extension (executes bd CLI)
```

- Extension owns all data mutations (CLI spawning)
- Webview is purely view layer + transient UI state
- No Redux/Zustand - simple useState in App.tsx

## Strengths

1. **Clean separation**: Common components are composable, type-safe
2. **View isolation**: Each view is self-contained
3. **Badge library**: StatusBadge, PriorityBadge, TypeBadge are polished
4. **Dropdown abstraction**: Reusable toggle + menu + click-outside
5. **Type safety**: Comprehensive types for beads, messages

## Weaknesses

| Issue | Impact | Location |
|-------|--------|----------|
| Filter menu duplicated | 150+ LOC x2 | IssuesView, IssuesViewTanStack |
| Menu state machines repeated | Boilerplate | 3+ places |
| No form abstraction | Scattered field logic | DetailsView |
| Monolithic styles.css | Hard to maintain | 1000+ lines |
| No custom hooks | Logic not reusable | Inline in views |

## TanStack Ecosystem Assessment

### Table (Current Spike) - **ADOPT**

Already evaluated in `IssuesViewTanStack.tsx`. Provides:
- Multi-column sorting (shift+click)
- Column resizing (native handlers)
- Column reordering (drag & drop)
- Faceted filtering with counts
- Column visibility toggle

**Verdict**: Commit to TanStack Table. Remove original IssuesView after PR merge.

### Virtual - **DEFER**

Virtualizes long lists for performance (>500 rows).

- **When to add**: If table performance degrades with large issue counts
- **Bundle**: ~15KB
- **Integration**: ~10 LOC change to table body rendering

**Verdict**: Not needed now. Add when performance issues arise.

### Query - **NOT APPLICABLE**

For API-driven apps with caching, optimistic updates, polling.

- **Current state**: Extension drives all data; webview is passive
- **Would require**: Extension to support request/response patterns

**Verdict**: Not a fit for current architecture. Reconsider if webview needs to drive mutations.

## Refactoring Recommendations

### Priority 1: Commit TanStack Table

After PR #27 merges:
1. Remove `IssuesView.tsx` (original)
2. Rename `IssuesViewTanStack.tsx` → `IssuesView.tsx`
3. Update App.tsx import
4. Delete multi-sort bead (vsbeads-4fw) as complete

### Priority 2: Extract FilterBar Component

Current: 150+ LOC of filter menu logic duplicated.

```tsx
// Proposed: src/webview/common/FilterBar.tsx
interface FilterBarProps {
  filters: {
    status: BeadStatus[];
    priority: BeadPriority[];
    type: string[];
  };
  presets: FilterPreset[];
  activePreset: string | null;
  facets?: {
    status: Map<string, number>;
    priority: Map<number, number>;
    type: Map<string, number>;
  };
  onFilterChange: (filters) => void;
  onPresetChange: (presetId: string) => void;
  onClear: () => void;
}
```

Benefits:
- Single source of truth for filter UI
- Faceted counts optional (pass from TanStack or compute manually)
- Reusable in Dashboard if we add filtering there

### Priority 3: Extract Custom Hooks

**useClickOutside**
```tsx
function useClickOutside(ref: RefObject<HTMLElement>, handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [ref, handler]);
}
```

Currently duplicated in: Dropdown, IssuesView (filter menu, column menu)

**useColumnState**
```tsx
function useColumnState(defaultColumns: ColumnConfig[]) {
  const [columns, setColumns] = useState(() => {
    const saved = vscode.getState()?.columns;
    return saved ? mergeWithDefaults(saved, defaultColumns) : defaultColumns;
  });

  useEffect(() => {
    vscode.setState({ ...vscode.getState(), columns });
  }, [columns]);

  return [columns, setColumns];
}
```

Extracts column persistence logic from IssuesView.

### Priority 4: Extract DependencySection

DetailsView has ~200 LOC for dependency rendering + sorting.

```tsx
// Proposed: src/webview/common/DependencySection.tsx
interface DependencySectionProps {
  dependsOn: BeadDependency[];
  blocks: BeadDependency[];
  editMode: boolean;
  onSelect: (beadId: string) => void;
  onAdd: (beadId: string) => void;
  onRemove: (beadId: string) => void;
}
```

### Priority 5: Form Components (Later)

If DetailsView complexity grows:
- `EditableField` - View/edit toggle with save/cancel
- `LabelInput` - Add/remove with chips
- `DependencyInput` - Add with autocomplete

## Component Hierarchy (Proposed)

```
src/webview/
├── common/
│   ├── badges/
│   │   ├── StatusBadge.tsx
│   │   ├── PriorityBadge.tsx
│   │   ├── TypeBadge.tsx
│   │   └── LabelBadge.tsx
│   ├── dropdowns/
│   │   ├── Dropdown.tsx
│   │   ├── ColoredSelect.tsx
│   │   └── ProjectDropdown.tsx
│   ├── filters/
│   │   ├── FilterBar.tsx      ← new
│   │   └── FilterChip.tsx
│   ├── feedback/
│   │   ├── Toast.tsx
│   │   ├── Loading.tsx
│   │   └── ErrorMessage.tsx
│   └── icons/
│       └── ChevronIcon.tsx
├── hooks/
│   ├── useClickOutside.ts     ← new
│   ├── useColumnState.ts      ← new
│   └── useFilterState.ts      ← new (optional)
└── views/
    ├── IssuesView/
    │   ├── index.tsx
    │   └── columns.ts         ← column definitions
    ├── DetailsView/
    │   ├── index.tsx
    │   └── DependencySection.tsx  ← extracted
    └── DashboardView/
        └── index.tsx
```

## Bundle Impact

| Addition | Size (minified) | When |
|----------|-----------------|------|
| @tanstack/react-table | ~40KB | Now (PR #27) |
| @tanstack/react-virtual | ~15KB | When needed |
| Custom hooks | ~1KB | Next iteration |

Current bundle: ~180KB (react + react-dom + marked + app code)
After TanStack Table: ~220KB

## Questions for Jason

1. **Commit TanStack Table?** PR #27 is ready. If approved, I'll clean up the original IssuesView.

2. **Directory reorganization?** The proposed hierarchy groups by function (badges/, dropdowns/, etc). Worth the churn?

3. **CSS modules?** Currently all styles in one file. Split into component-scoped files? (e.g., `StatusBadge.module.css`)

4. **FilterBar extraction now or later?** Can do in TanStack PR or separate follow-up.

## Related Beads

- vsbeads-4uw: Evaluate TanStack Table (in progress, PR #27)
- vsbeads-4fw: Persist sort order across plugin restarts (multi-sort now works with TanStack)
