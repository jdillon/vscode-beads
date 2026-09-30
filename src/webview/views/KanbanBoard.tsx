/**
 * KanbanBoard
 *
 * Ordered, filter-based board view for issues.
 */

import React, { useState, useMemo } from "react";
import {
  Bead,
  BeadType,
} from "../types";
import { BoardColumnsConfig, BoardColumn, placeBead, canDropBead } from "../../shared/board-columns";
import { defaultBoardColumns } from "./board-defaults";
import { TypeIcon } from "../common/TypeIcon";
import { PriorityBadge } from "../common/PriorityBadge";
import { LabelBadge } from "../common/LabelBadge";
import { Icon } from "../common/Icon";

interface KanbanBoardProps {
  beads: Bead[];
  allBeads: Bead[];
  config: BoardColumnsConfig | null;
  selectedBeadId: string | null;
  onSelectBead: (beadId: string) => void;
  onUpdateBead?: (beadId: string, updates: Partial<Bead>) => void;
  /** Whether any filters are active (affects empty state messaging) */
  hasActiveFilters?: boolean;
}
export function KanbanBoard({ beads, allBeads, config, selectedBeadId, onSelectBead, onUpdateBead, hasActiveFilters }: KanbanBoardProps): React.ReactElement {
  // Track which columns are collapsed (closed is collapsed by default)
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set(["status_closed"]));
  // Track which column is being dragged over
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggedBeadId, setDraggedBeadId] = useState<string | null>(null);
  // Optimistic status overrides for instant visual feedback
  const [optimisticStatus, setOptimisticStatus] = useState<Map<string, string>>(new Map());

  // Apply optimistic overrides to beads
  const effectiveBeads = useMemo(() => {
    if (optimisticStatus.size === 0) return beads;
    return beads.map((bead) => {
      const override = optimisticStatus.get(bead.id);
      if (override && bead.status !== override) {
        return { ...bead, status: override as Bead["status"] };
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

  const toggleColumn = (id: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, beadId: string) => {
    e.dataTransfer.setData("text/plain", beadId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedBeadId(beadId);
  };

  const handleDragOver = (e: React.DragEvent, column: BoardColumn) => {
    if (!column.dropStatus || !onUpdateBead) return;
    const bead = effectiveBeads.find((item) => item.id === draggedBeadId);
    if (!bead || !canDropBead(bead, column, columns)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(column.id);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, column: BoardColumn) => {
    if (!column.dropStatus || !onUpdateBead) return;
    e.preventDefault();
    setDragOverColumn(null);
    setDraggedBeadId(null);

    const beadId = e.dataTransfer.getData("text/plain");
    const bead = beads.find((b) => b.id === beadId);

    // Only update if status actually changed
    if (bead && canDropBead(bead, column, columns)) {
      // Optimistic update - move card immediately
      setOptimisticStatus((prev) => new Map(prev).set(beadId, column.dropStatus!));
      onUpdateBead(beadId, { status: column.dropStatus as Bead["status"] });
    }
  };

  const columns = useMemo(() => config?.columns ?? defaultBoardColumns(allBeads), [config, allBeads]);
  const displayedColumns = useMemo(() => [...columns, { id: "__other__", title: "Other", color: "#888888", filter: {} }], [columns]);

  // Group beads by status (using effective beads with optimistic overrides)
  const grouped = useMemo(() => {
    const result: Record<string, Bead[]> = {};
    for (const bead of effectiveBeads) {
      const id = placeBead(bead, columns);
      (result[id] ??= []).push(bead);
    }
    return result;
  }, [effectiveBeads, columns]);
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const bead of allBeads) {
      const id = placeBead(bead, columns);
      result[id] = (result[id] ?? 0) + 1;
    }
    return result;
  }, [allBeads, columns]);
  const visibleColumns = config || (grouped.__other__?.length || counts.__other__) ? displayedColumns : displayedColumns.filter((column) => column.id !== "__other__");

  return (
    <div className="kanban-board">
      {visibleColumns.map((column) => {
        const isCollapsed = collapsedColumns.has(column.id);
        const items = grouped[column.id] || [];
        const isDragOver = dragOverColumn === column.id;

        return (
          <div
            key={column.id}
            className={`kanban-column ${isCollapsed ? "collapsed" : ""} ${isDragOver ? "drag-over" : ""} ${column.dropStatus ? "drop-enabled" : ""}`}
            style={{ "--column-color": column.color } as React.CSSProperties}
            onDragOver={(e) => handleDragOver(e, column)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column)}
          >
            <div
              className="kanban-column-header"
              onClick={() => toggleColumn(column.id)}
            >
              <span className="kanban-column-title">{column.title}</span>
              <span className="kanban-column-count">
                {hasActiveFilters && counts[column.id] !== items.length
                  ? `${items.length}/${counts[column.id] ?? 0}`
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
                    onDragEnd={() => { setDraggedBeadId(null); setDragOverColumn(null); }}
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
                    {hasActiveFilters && (counts[column.id] ?? 0) > 0
                      ? `No matches (${counts[column.id]} filtered)`
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
