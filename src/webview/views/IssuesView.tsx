/**
 * IssuesView
 *
 * Main table/list view for issues with:
 * - Sortable columns
 * - Modern chip-based filtering
 * - Text search
 * - Row interactions
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Bead,
  BeadsProject,
  BeadStatus,
  BeadPriority,
  BeadType,
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  TYPE_LABELS,
  TYPE_COLORS,
  vscode,
} from "../types";
import { StatusBadge } from "../common/StatusBadge";
import { PriorityBadge } from "../common/PriorityBadge";
import { TypeBadge } from "../common/TypeBadge";
import { LabelBadge } from "../common/LabelBadge";
import { FilterChip } from "../common/FilterChip";

interface IssuesViewProps {
  beads: Bead[];
  loading: boolean;
  selectedBeadId: string | null;
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  onSelectProject: (projectId: string) => void;
  onSelectBead: (beadId: string) => void;
  onUpdateBead: (beadId: string, updates: Partial<Bead>) => void;
}

type SortField = "title" | "status" | "priority" | "type" | "labels" | "assignee" | "estimate" | "createdAt" | "updatedAt";
type SortDirection = "asc" | "desc";

interface Filters {
  status: BeadStatus[];
  priority: BeadPriority[];
  type: string[];
  search: string;
}

interface ColumnConfig {
  id: SortField;
  label: string;
  visible: boolean;
  width: number;
  minWidth: number;
  sortable: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "type", label: "Type", visible: true, width: 70, minWidth: 50, sortable: true },
  { id: "title", label: "Title", visible: true, width: 200, minWidth: 50, sortable: true },
  { id: "status", label: "Status", visible: true, width: 80, minWidth: 60, sortable: true },
  { id: "priority", label: "Priority", visible: true, width: 70, minWidth: 50, sortable: true },
  { id: "labels", label: "Labels", visible: false, width: 100, minWidth: 60, sortable: false },
  { id: "assignee", label: "Assignee", visible: false, width: 80, minWidth: 50, sortable: true },
  { id: "estimate", label: "Estimate", visible: false, width: 70, minWidth: 50, sortable: true },
  { id: "updatedAt", label: "Updated", visible: true, width: 80, minWidth: 60, sortable: true },
  { id: "createdAt", label: "Created", visible: true, width: 80, minWidth: 60, sortable: true },
];

const ISSUE_TYPES = ["bug", "feature", "task", "epic", "chore"];

// Filter presets for quick filtering
interface FilterPreset {
  id: string;
  label: string;
  filters: Omit<Filters, "search">;
}

const FILTER_PRESETS: FilterPreset[] = [
  { id: "all", label: "All", filters: { status: [], priority: [], type: [] } },
  { id: "not-closed", label: "Not Closed", filters: { status: ["open", "in_progress", "blocked"], priority: [], type: [] } },
  { id: "active", label: "Active", filters: { status: ["in_progress", "blocked"], priority: [], type: [] } },
  { id: "blocked", label: "Blocked", filters: { status: ["blocked"], priority: [], type: [] } },
  { id: "closed", label: "Closed", filters: { status: ["closed"], priority: [], type: [] } },
  { id: "epics", label: "Epics", filters: { status: [], priority: [], type: ["epic"] } },
];

export function IssuesView({
  beads,
  loading,
  selectedBeadId,
  projects,
  activeProject,
  onSelectProject,
  onSelectBead,
  onUpdateBead,
}: IssuesViewProps): React.ReactElement {
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  // Initialize with "Not Closed" preset
  const defaultPreset = FILTER_PRESETS.find((p) => p.id === "not-closed")!;
  const [filters, setFilters] = useState<Filters>({
    ...defaultPreset.filters,
    search: "",
  });
  const [activePreset, setActivePreset] = useState<string | null>("not-closed");
  const [filterBarOpen, setFilterBarOpen] = useState(true); // Start open to show default filter
  const [filterMenuOpen, setFilterMenuOpen] = useState<string | null>(null);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [resizing, setResizing] = useState<{ id: SortField; startX: number; startWidth: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load column settings from webview state, merging with defaults for new columns
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    try {
      const saved = vscode.getState() as { columns?: ColumnConfig[] } | null;
      if (saved?.columns) {
        // Merge: keep saved settings but update minWidth from defaults, add new columns
        const defaultsMap = new Map(DEFAULT_COLUMNS.map((c) => [c.id, c]));
        const merged = saved.columns.map((col) => {
          const def = defaultsMap.get(col.id);
          return def ? { ...col, minWidth: def.minWidth } : col;
        });
        const savedIds = new Set(saved.columns.map((c) => c.id));
        const newColumns = DEFAULT_COLUMNS.filter((c) => !savedIds.has(c.id));
        return [...merged, ...newColumns];
      }
    } catch (e) {
      console.error('Failed to restore column state:', e);
    }
    return DEFAULT_COLUMNS;
  });

  // Save column settings when they change
  useEffect(() => {
    try {
      const current = vscode.getState() as Record<string, unknown> | null;
      vscode.setState({ ...current, columns });
    } catch (e) {
      console.error('Failed to save column state:', e);
    }
  }, [columns]);

  const hasActiveFilters = filters.status.length > 0 || filters.priority.length > 0 || filters.type.length > 0;
  const showFilterRow = filterBarOpen || hasActiveFilters;
  const visibleColumns = columns.filter((c) => c.visible);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const columnMenuRef = useRef<HTMLTableCellElement>(null);
  const presetMenuRef = useRef<HTMLDivElement>(null);

  // Click outside to close filter menu
  useEffect(() => {
    if (!filterMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setFilterMenuOpen(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterMenuOpen]);

  // Click outside to close column menu
  useEffect(() => {
    if (!columnMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setColumnMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [columnMenuOpen]);

  // Click outside to close preset menu
  useEffect(() => {
    if (!presetMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [presetMenuOpen]);

  // Close menus when webview loses focus (click outside VS Code webview)
  useEffect(() => {
    const handleBlur = () => {
      setColumnMenuOpen(false);
      setFilterMenuOpen(null);
      setPresetMenuOpen(false);
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  // Handle column resize
  const handleResizeStart = useCallback((e: React.MouseEvent, col: ColumnConfig) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ id: col.id, startX: e.clientX, startWidth: col.width });
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      setColumns((prev) =>
        prev.map((col) =>
          col.id === resizing.id
            ? { ...col, width: Math.max(col.minWidth, resizing.startWidth + delta) }
            : col
        )
      );
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing]);

  const toggleColumnVisibility = useCallback((id: SortField) => {
    setColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, visible: !col.visible } : col))
    );
  }, []);

  // Filter and sort beads
  const filteredBeads = useMemo(() => {
    let result = [...beads];

    if (filters.status.length > 0) {
      result = result.filter((b) => filters.status.includes(b.status));
    }

    if (filters.priority.length > 0) {
      result = result.filter(
        (b) => b.priority !== undefined && filters.priority.includes(b.priority)
      );
    }

    if (filters.type.length > 0) {
      result = result.filter((b) => b.type && filters.type.includes(b.type));
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(search) ||
          b.id.toLowerCase().includes(search) ||
          (b.description && b.description.toLowerCase().includes(search)) ||
          (b.labels && b.labels.some((l) => l.toLowerCase().includes(search)))
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        case "priority":
          comparison = (a.priority ?? 4) - (b.priority ?? 4);
          break;
        case "type":
          comparison = (a.type || "").localeCompare(b.type || "");
          break;
        case "assignee":
          comparison = (a.assignee || "").localeCompare(b.assignee || "");
          break;
        case "estimate":
          comparison = (a.estimatedMinutes ?? 0) - (b.estimatedMinutes ?? 0);
          break;
        case "createdAt":
          comparison = (a.createdAt || "").localeCompare(b.createdAt || "");
          break;
        case "updatedAt":
          comparison = (a.updatedAt || "").localeCompare(b.updatedAt || "");
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [beads, filters, sortField, sortDirection]);

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDirection("asc");
      return field;
    });
  }, []);

  // Apply a filter preset
  const applyPreset = (presetId: string) => {
    const preset = FILTER_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setFilters((prev) => ({ ...preset.filters, search: prev.search }));
      setActivePreset(presetId);
      setFilterMenuOpen(null);
    }
  };

  const addStatusFilter = (status: BeadStatus) => {
    if (!filters.status.includes(status)) {
      setFilters((prev) => ({ ...prev, status: [...prev.status, status] }));
      setActivePreset(null); // Manual change clears preset
    }
    setFilterMenuOpen(null);
  };

  const addPriorityFilter = (priority: BeadPriority) => {
    if (!filters.priority.includes(priority)) {
      setFilters((prev) => ({ ...prev, priority: [...prev.priority, priority] }));
      setActivePreset(null);
    }
    setFilterMenuOpen(null);
  };

  const addTypeFilter = (type: string) => {
    if (!filters.type.includes(type)) {
      setFilters((prev) => ({ ...prev, type: [...prev.type, type] }));
      setActivePreset(null);
    }
    setFilterMenuOpen(null);
  };

  const removeStatusFilter = (status: BeadStatus) => {
    setFilters((prev) => ({
      ...prev,
      status: prev.status.filter((s) => s !== status),
    }));
    setActivePreset(null);
  };

  const removePriorityFilter = (priority: BeadPriority) => {
    setFilters((prev) => ({
      ...prev,
      priority: prev.priority.filter((p) => p !== priority),
    }));
    setActivePreset(null);
  };

  const removeTypeFilter = (type: string) => {
    setFilters((prev) => ({
      ...prev,
      type: prev.type.filter((t) => t !== type),
    }));
    setActivePreset(null);
  };

  const clearAllFilters = () => {
    setFilters({ status: [], priority: [], type: [], search: "" });
    setActivePreset("all");
  };

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return <span className="sort-indicator">{sortDirection === "asc" ? "▲" : "▼"}</span>;
  };

  const handleCopyId = useCallback((beadId: string) => {
    // Post to extension for clipboard + status bar message
    vscode.postMessage({ type: "copyBeadId", beadId });
    // Local visual feedback
    setCopiedId(beadId);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  return (
    <div className="beads-panel">
      {/* Row 1: status + project + search + filter toggle */}
      <div className="panel-toolbar-compact">
        <span
          className={`daemon-dot ${activeProject?.daemonStatus === "running" ? "running" : "stopped"}`}
          title={`Daemon: ${activeProject?.daemonStatus || "unknown"}`}
        />
        <select
          className="project-select-compact"
          value={activeProject?.id || ""}
          onChange={(e) => onSelectProject(e.target.value)}
          title={activeProject?.rootPath}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input-compact"
            placeholder="Search..."
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
          />
          {filters.search && (
            <button
              className="search-clear-btn"
              onClick={() => setFilters((prev) => ({ ...prev, search: "" }))}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <button
          className={`filter-toggle ${showFilterRow ? "active" : ""}`}
          onClick={() => {
            setFilterBarOpen(!filterBarOpen);
            if (filterBarOpen) setFilterMenuOpen(null); // Close menu when closing bar
          }}
          title="Filter"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 10.5v-1h4v1H6zm-2-3v-1h8v1H4zm-2-3v-1h12v1H2z"/>
          </svg>
        </button>
      </div>

      {/* Row 2: Filter bar (shown when filters active or menu open) */}
      {showFilterRow && (
        <div className="filter-bar">
          {/* Preset dropdown */}
          <div className="preset-dropdown" ref={presetMenuRef}>
            <button
              className="preset-dropdown-btn"
              onClick={() => setPresetMenuOpen(!presetMenuOpen)}
            >
              {activePreset
                ? FILTER_PRESETS.find((p) => p.id === activePreset)?.label
                : "Custom"}
              <span className="dropdown-chevron">▾</span>
            </button>
            {presetMenuOpen && (
              <div className="preset-dropdown-menu">
                {FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`preset-option ${activePreset === preset.id ? "active" : ""}`}
                    onClick={() => {
                      applyPreset(preset.id);
                      setPresetMenuOpen(false);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active filter chips */}
          {filters.status.map((status) => (
            <FilterChip
              key={`status-${status}`}
              label={STATUS_LABELS[status]}
              accentColor={STATUS_COLORS[status]}
              onRemove={() => removeStatusFilter(status)}
            />
          ))}
          {filters.priority.map((priority) => (
            <FilterChip
              key={`priority-${priority}`}
              label={`p${priority}`}
              accentColor={PRIORITY_COLORS[priority]}
              onRemove={() => removePriorityFilter(priority)}
            />
          ))}
          {filters.type.map((type) => (
            <FilterChip
              key={`type-${type}`}
              label={TYPE_LABELS[type as BeadType] || type}
              accentColor={TYPE_COLORS[type as BeadType]}
              onRemove={() => removeTypeFilter(type)}
            />
          ))}

          {/* Add filter dropdown */}
          <div className="filter-add-wrapper" ref={filterMenuRef}>
            <button
              className="filter-add-btn"
              onClick={() => setFilterMenuOpen(filterMenuOpen === "main" ? null : "main")}
            >
              + Filter
            </button>

            {filterMenuOpen === "main" && (
              <div className="filter-menu">
                <button onClick={() => setFilterMenuOpen("status")}>Status <span className="menu-chevron">›</span></button>
                <button onClick={() => setFilterMenuOpen("priority")}>Priority <span className="menu-chevron">›</span></button>
                <button onClick={() => setFilterMenuOpen("type")}>Type <span className="menu-chevron">›</span></button>
              </div>
            )}

            {filterMenuOpen === "status" && (
              <div className="filter-menu">
                {(Object.keys(STATUS_LABELS) as BeadStatus[])
                  .filter((s) => s !== "unknown" && !filters.status.includes(s))
                  .map((status) => (
                    <button key={status} onClick={() => addStatusFilter(status)}>
                      <StatusBadge status={status} size="small" />
                    </button>
                  ))}
                <button className="back-btn" onClick={() => setFilterMenuOpen("main")}>← Back</button>
              </div>
            )}

            {filterMenuOpen === "priority" && (
              <div className="filter-menu">
                {([0, 1, 2, 3, 4] as BeadPriority[])
                  .filter((p) => !filters.priority.includes(p))
                  .map((priority) => (
                    <button key={priority} onClick={() => addPriorityFilter(priority)}>
                      <PriorityBadge priority={priority} size="small" />
                    </button>
                  ))}
                <button className="back-btn" onClick={() => setFilterMenuOpen("main")}>← Back</button>
              </div>
            )}

            {filterMenuOpen === "type" && (
              <div className="filter-menu">
                {ISSUE_TYPES
                  .filter((t) => !filters.type.includes(t))
                  .map((type) => (
                    <button key={type} onClick={() => addTypeFilter(type)}>
                      <TypeBadge type={type as BeadType} size="small" />
                    </button>
                  ))}
                <button className="back-btn" onClick={() => setFilterMenuOpen("main")}>← Back</button>
              </div>
            )}
          </div>

          {/* Reset all filters */}
          {hasActiveFilters && (
            <button className="filter-reset" onClick={clearAllFilters}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="beads-table-wrapper">
        <div className={`beads-table-container ${resizing ? "resizing" : ""}`}>
          <table
            className="beads-table"
            style={{ minWidth: `${visibleColumns.reduce((sum, c) => sum + c.width, 0) + 24}px` }}
          >
          <colgroup>
            {visibleColumns.map((col) => (
              <col key={col.id} style={{ width: `${col.width}px` }} />
            ))}
            <col style={{ width: '24px' }} />
          </colgroup>
          <thead>
            <tr>
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  className={col.sortable ? "sortable" : ""}
                  onClick={() => col.sortable && handleSort(col.id)}
                >
                  {col.label}
                  {col.sortable && <SortIndicator field={col.id} />}
                  <span
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart(e, col)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              ))}
              <th className="col-menu-th" ref={columnMenuRef}>
                <button
                  className="col-menu-btn"
                  onClick={() => setColumnMenuOpen(!columnMenuOpen)}
                  title="Show/hide columns"
                >
                  ⋮
                </button>
                {columnMenuOpen && (
                  <div className="col-menu">
                    {columns.map((col) => (
                      <label key={col.id}>
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={() => toggleColumnVisibility(col.id)}
                        />
                        {col.label}
                      </label>
                    ))}
                    <hr className="col-menu-divider" />
                    <button
                      className="col-menu-reset"
                      onClick={() => {
                        setColumns(DEFAULT_COLUMNS);
                        setColumnMenuOpen(false);
                      }}
                    >
                      Reset to defaults
                    </button>
                  </div>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredBeads.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="empty-row">
                  {loading ? "Loading..." : "No issues matching filter"}
                </td>
              </tr>
            ) : (
              filteredBeads.map((bead) => (
                <tr
                  key={bead.id}
                  onClick={() => onSelectBead(bead.id)}
                  className={`bead-row ${bead.id === selectedBeadId ? "selected" : ""}`}
                  title={bead.description || bead.title}
                >
                  {visibleColumns.map((col) => (
                    <td key={col.id} className={`${col.id}-cell`}>
                      {col.id === "title" && (
                        <>
                          <span
                            className={`bead-id ${copiedId === bead.id ? "copied" : ""}`}
                            onClick={() => handleCopyId(bead.id)}
                            title={copiedId === bead.id ? "Copied!" : "Click to copy"}
                          >
                            {bead.id}
                          </span>
                          <span className="bead-title">{bead.title}</span>
                        </>
                      )}
                      {col.id === "status" && (
                        <StatusBadge status={bead.status} size="small" />
                      )}
                      {col.id === "priority" && bead.priority !== undefined && (
                        <PriorityBadge priority={bead.priority} size="small" />
                      )}
                      {col.id === "type" && bead.type && (
                        <TypeBadge type={bead.type as BeadType} size="small" />
                      )}
                      {col.id === "labels" && (
                        <>
                          {bead.labels?.map((label) => (
                            <LabelBadge key={label} label={label} />
                          ))}
                        </>
                      )}
                      {col.id === "assignee" && (bead.assignee || "-")}
                      {col.id === "estimate" && (
                        bead.estimatedMinutes
                          ? `${bead.estimatedMinutes}m`
                          : "-"
                      )}
                      {col.id === "createdAt" && (
                        bead.createdAt
                          ? new Date(bead.createdAt).toLocaleDateString()
                          : "-"
                      )}
                      {col.id === "updatedAt" && (
                        bead.updatedAt
                          ? new Date(bead.updatedAt).toLocaleDateString()
                          : "-"
                      )}
                    </td>
                  ))}
                  <td className="row-spacer" />
                </tr>
              ))
            )}
          </tbody>
          </table>
        </div>
        {/* Filtered count overlay - outside scrollable container */}
        {(hasActiveFilters || filters.search) && filteredBeads.length !== beads.length && (
          <div className="filter-count-overlay">
            {filteredBeads.length} of {beads.length}
          </div>
        )}
      </div>
    </div>
  );
}
