/**
 * BeadsPanel Component
 *
 * Main table/list view for beads with:
 * - Sortable columns
 * - Filtering toolbar
 * - Text search
 * - Row interactions
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  Bead,
  BeadStatus,
  BeadPriority,
  STATUS_LABELS,
  PRIORITY_LABELS,
} from "../types";
import { StatusBadge } from "../common/StatusBadge";
import { PriorityBadge } from "../common/PriorityBadge";
import { LabelBadge } from "../common/LabelBadge";

interface BeadsPanelProps {
  beads: Bead[];
  loading: boolean;
  onSelectBead: (beadId: string) => void;
  onUpdateBead: (beadId: string, updates: Partial<Bead>) => void;
}

type SortField = "title" | "status" | "priority" | "type" | "updatedAt";
type SortDirection = "asc" | "desc";

interface Filters {
  status: BeadStatus[];
  priority: BeadPriority[];
  search: string;
}

export function BeadsPanel({
  beads,
  loading,
  onSelectBead,
  onUpdateBead,
}: BeadsPanelProps): React.ReactElement {
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filters, setFilters] = useState<Filters>({
    status: [],
    priority: [],
    search: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  // Get unique values for filters
  const allLabels = useMemo(() => {
    const labels = new Set<string>();
    beads.forEach((b) => b.labels?.forEach((l) => labels.add(l)));
    return Array.from(labels).sort();
  }, [beads]);

  // Filter and sort beads
  const filteredBeads = useMemo(() => {
    let result = [...beads];

    // Apply status filter
    if (filters.status.length > 0) {
      result = result.filter((b) => filters.status.includes(b.status));
    }

    // Apply priority filter
    if (filters.priority.length > 0) {
      result = result.filter(
        (b) => b.priority !== undefined && filters.priority.includes(b.priority)
      );
    }

    // Apply search filter
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

    // Sort
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

  const toggleStatusFilter = useCallback((status: BeadStatus) => {
    setFilters((prev) => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter((s) => s !== status)
        : [...prev.status, status],
    }));
  }, []);

  const togglePriorityFilter = useCallback((priority: BeadPriority) => {
    setFilters((prev) => ({
      ...prev,
      priority: prev.priority.includes(priority)
        ? prev.priority.filter((p) => p !== priority)
        : [...prev.priority, priority],
    }));
  }, []);

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return <span className="sort-indicator">{sortDirection === "asc" ? "▲" : "▼"}</span>;
  };

  return (
    <div className="beads-panel">
      <div className="panel-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search beads..."
          value={filters.search}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, search: e.target.value }))
          }
        />
        <button
          className={`filter-toggle ${showFilters ? "active" : ""}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          Filters {filters.status.length + filters.priority.length > 0 && `(${filters.status.length + filters.priority.length})`}
        </button>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <div className="filter-section">
            <h4>Status</h4>
            <div className="filter-options">
              {(Object.keys(STATUS_LABELS) as BeadStatus[]).map((status) => (
                <label key={status} className="filter-option">
                  <input
                    type="checkbox"
                    checked={filters.status.includes(status)}
                    onChange={() => toggleStatusFilter(status)}
                  />
                  {STATUS_LABELS[status]}
                </label>
              ))}
            </div>
          </div>
          <div className="filter-section">
            <h4>Priority</h4>
            <div className="filter-options">
              {([0, 1, 2, 3, 4] as BeadPriority[]).map((priority) => (
                <label key={priority} className="filter-option">
                  <input
                    type="checkbox"
                    checked={filters.priority.includes(priority)}
                    onChange={() => togglePriorityFilter(priority)}
                  />
                  {PRIORITY_LABELS[priority]}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="beads-table-container">
        <table className="beads-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("title")} className="sortable">
                Title <SortIndicator field="title" />
              </th>
              <th onClick={() => handleSort("status")} className="sortable">
                Status <SortIndicator field="status" />
              </th>
              <th onClick={() => handleSort("priority")} className="sortable">
                Priority <SortIndicator field="priority" />
              </th>
              <th onClick={() => handleSort("type")} className="sortable">
                Type <SortIndicator field="type" />
              </th>
              <th>Labels</th>
              <th onClick={() => handleSort("updatedAt")} className="sortable">
                Updated <SortIndicator field="updatedAt" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredBeads.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-row">
                  {loading ? "Loading..." : "No beads found"}
                </td>
              </tr>
            ) : (
              filteredBeads.map((bead) => (
                <tr
                  key={bead.id}
                  onClick={() => onSelectBead(bead.id)}
                  className="bead-row"
                  title={bead.description || bead.title}
                >
                  <td className="title-cell">
                    <span className="bead-id">{bead.id}</span>
                    <span className="bead-title">{bead.title}</span>
                  </td>
                  <td>
                    <StatusBadge status={bead.status} size="small" />
                  </td>
                  <td>
                    {bead.priority !== undefined && (
                      <PriorityBadge priority={bead.priority} size="small" />
                    )}
                  </td>
                  <td className="type-cell">{bead.type || "-"}</td>
                  <td className="labels-cell">
                    {bead.labels?.slice(0, 2).map((label) => (
                      <LabelBadge key={label} label={label} />
                    ))}
                    {bead.labels && bead.labels.length > 2 && (
                      <span className="more-labels">+{bead.labels.length - 2}</span>
                    )}
                  </td>
                  <td className="date-cell">
                    {bead.updatedAt
                      ? new Date(bead.updatedAt).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="panel-footer">
        <span className="count">
          Showing {filteredBeads.length} of {beads.length} beads
        </span>
      </div>
    </div>
  );
}
