/**
 * KanbanBoard
 *
 * Status-based board view for issues.
 * Supports drag-and-drop to change status.
 */

import React, { useState, useMemo } from "react";
import { Bead, BeadStatus, BeadType, STATUS_LABELS, STATUS_COLORS } from "../types";
import { TypeIcon } from "../common/TypeIcon";
import { PriorityBadge } from "../common/PriorityBadge";
import { LabelBadge } from "../common/LabelBadge";
import { Icon } from "../common/Icon";

interface KanbanBoardProps {
  beads: Bead[];
  selectedBeadId: string | null;
  onSelectBead: (beadId: string) => void;
  onUpdateBead?: (beadId: string, updates: Partial<Bead>) => void;
  /** Whether any filters are active (affects empty state messaging) */
  hasActiveFilters?: boolean;
  /** Unfiltered counts per status (to show "0 of N" when filtering) */
  unfilteredCounts?: Record<BeadStatus, number>;
}

const COLUMNS: BeadStatus[] = ["open", "in_progress", "blocked", "closed"];

export function KanbanBoard({ beads, selectedBeadId, onSelectBead, onUpdateBead, hasActiveFilters, unfilteredCounts }: KanbanBoardProps): React.ReactElement {
  // Track which columns are collapsed (closed is collapsed by default)
  const [collapsedColumns, setCollapsedColumns] = useState<Set<BeadStatus>>(new Set(["closed"]));
  // Track which column is being dragged over
  const [dragOverColumn, setDragOverColumn] = useState<BeadStatus | null>(null);
  // Optimistic status overrides for instant visual feedback
  const [optimisticStatus, setOptimisticStatus] = useState<Map<string, BeadStatus>>(new Map());

  // Apply optimistic overrides to beads
  const effectiveBeads = useMemo(() => {
    if (optimisticStatus.size === 0) return beads;
    return beads.map((bead) => {
      const override = optimisticStatus.get(bead.id);
      if (override && bead.status !== override) {
        return { ...bead, status: override };
      }
      // Clear optimistic override once real data catches up
      if (override && bead.status === override) {
        setOptimisticStatus((prev) => {
          const next = new Map(prev);
          next.delete(bead.id);
          return next;
        });
      }
      return bead;
    });
  }, [beads, optimisticStatus]);

  const toggleColumn = (status: BeadStatus) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, beadId: string) => {
    e.dataTransfer.setData("text/plain", beadId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, status: BeadStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, newStatus: BeadStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    const beadId = e.dataTransfer.getData("text/plain");
    const bead = beads.find((b) => b.id === beadId);

    // Only update if status actually changed
    if (bead && bead.status !== newStatus && onUpdateBead) {
      // Optimistic update - move card immediately
      setOptimisticStatus((prev) => new Map(prev).set(beadId, newStatus));
      onUpdateBead(beadId, { status: newStatus });
    }
  };

  // Group beads by status (using effective beads with optimistic overrides)
  const grouped = COLUMNS.reduce((acc, status) => {
    acc[status] = effectiveBeads.filter((b) => b.status === status);
    return acc;
  }, {} as Record<BeadStatus, Bead[]>);

  return (
    <div className="kanban-board">
      {COLUMNS.map((status) => {
        const isCollapsed = collapsedColumns.has(status);
        const items = grouped[status] || [];
        const isDragOver = dragOverColumn === status;

        return (
          <div
            key={status}
            className={`kanban-column ${isCollapsed ? "collapsed" : ""} ${isDragOver ? "drag-over" : ""}`}
            style={{ "--column-color": STATUS_COLORS[status] } as React.CSSProperties}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div
              className="kanban-column-header"
              onClick={() => toggleColumn(status)}
            >
              <span className="kanban-column-title">{STATUS_LABELS[status]}</span>
              <span className="kanban-column-count">
                {hasActiveFilters && unfilteredCounts && unfilteredCounts[status] !== items.length
                  ? `${items.length}/${unfilteredCounts[status]}`
                  : items.length}
              </span>
            </div>
            {!isCollapsed && (
              <div className="kanban-column-body">
                {items.map((bead) => (
                  <div
                    key={bead.id}
                    className={`kanban-card ${bead.id === selectedBeadId ? "selected" : ""}`}
                    draggable={!!onUpdateBead}
                    onDragStart={(e) => handleDragStart(e, bead.id)}
                    onClick={() => onSelectBead(bead.id)}
                  >
                    <div className="kanban-card-header">
                      <TypeIcon type={(bead.type || "task") as BeadType} size={12} />
                      <span className="kanban-card-id">{bead.id}</span>
                    </div>
                    <div className="kanban-card-title">{bead.title}</div>
                    <div className="kanban-card-meta">
                      {bead.priority !== undefined && <PriorityBadge priority={bead.priority} size="small" />}
                      {bead.assignee && (
                        <>
                          <Icon name="user" size={10} className="kanban-card-icon" />
                          <span className="kanban-card-assignee">{bead.assignee}</span>
                        </>
                      )}
                      {bead.labels && bead.labels.length > 0 && (
                        <>
                          <span className="kanban-card-spacer" />
                          <Icon name="tag" size={10} className="kanban-card-icon" />
                          {bead.labels.slice(0, 3).map((label) => (
                            <LabelBadge key={label} label={label} />
                          ))}
                          {bead.labels.length > 3 && (
                            <span className="kanban-card-labels-more">+{bead.labels.length - 3}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="kanban-empty">
                    {hasActiveFilters && unfilteredCounts && unfilteredCounts[status] > 0
                      ? `No matches (${unfilteredCounts[status]} filtered)`
                      : "No items"}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
