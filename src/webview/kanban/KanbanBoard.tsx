/**
 * KanbanBoard Component
 *
 * Trello-style board with:
 * - Columns for each status
 * - Draggable cards
 * - Status updates via drag-and-drop
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  Bead,
  BeadStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from "../types";
import { PriorityBadge } from "../common/PriorityBadge";
import { LabelBadge } from "../common/LabelBadge";

interface KanbanBoardProps {
  beads: Bead[];
  loading: boolean;
  onUpdateBead: (beadId: string, updates: Partial<Bead>) => void;
  onSelectBead: (beadId: string) => void;
}

// Default column order
const COLUMN_ORDER: BeadStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "done",
];

export function KanbanBoard({
  beads,
  loading,
  onUpdateBead,
  onSelectBead,
}: KanbanBoardProps): React.ReactElement {
  const [draggedBead, setDraggedBead] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<BeadStatus | null>(null);

  // Group beads by status
  const columns = useMemo(() => {
    const grouped: Record<BeadStatus, Bead[]> = {
      backlog: [],
      ready: [],
      in_progress: [],
      blocked: [],
      done: [],
      closed: [],
      unknown: [],
    };

    beads.forEach((bead) => {
      if (grouped[bead.status]) {
        grouped[bead.status].push(bead);
      } else {
        grouped.unknown.push(bead);
      }
    });

    // Sort each column by priority
    Object.values(grouped).forEach((column) => {
      column.sort((a, b) => (a.priority ?? 4) - (b.priority ?? 4));
    });

    return grouped;
  }, [beads]);

  const handleDragStart = useCallback(
    (e: React.DragEvent, beadId: string) => {
      setDraggedBead(beadId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", beadId);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDraggedBead(null);
    setDragOverColumn(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, status: BeadStatus) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(status);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, newStatus: BeadStatus) => {
      e.preventDefault();
      const beadId = e.dataTransfer.getData("text/plain");

      if (beadId && draggedBead) {
        const bead = beads.find((b) => b.id === beadId);
        if (bead && bead.status !== newStatus) {
          onUpdateBead(beadId, { status: newStatus });
        }
      }

      setDraggedBead(null);
      setDragOverColumn(null);
    },
    [draggedBead, beads, onUpdateBead]
  );

  // Handle keyboard-based status change
  const handleStatusChange = useCallback(
    (beadId: string, newStatus: BeadStatus) => {
      onUpdateBead(beadId, { status: newStatus });
    },
    [onUpdateBead]
  );

  return (
    <div className="kanban-board">
      {COLUMN_ORDER.map((status) => (
        <div
          key={status}
          className={`kanban-column ${dragOverColumn === status ? "drag-over" : ""}`}
          onDragOver={(e) => handleDragOver(e, status)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, status)}
        >
          <div
            className="column-header"
            style={{ borderTopColor: STATUS_COLORS[status] }}
          >
            <span className="column-title">{STATUS_LABELS[status]}</span>
            <span className="column-count">{columns[status].length}</span>
          </div>

          <div className="column-cards">
            {columns[status].map((bead) => (
              <KanbanCard
                key={bead.id}
                bead={bead}
                isDragging={draggedBead === bead.id}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={onSelectBead}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface KanbanCardProps {
  bead: Bead;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, beadId: string) => void;
  onDragEnd: () => void;
  onClick: (beadId: string) => void;
  onStatusChange: (beadId: string, newStatus: BeadStatus) => void;
}

function KanbanCard({
  bead,
  isDragging,
  onDragStart,
  onDragEnd,
  onClick,
  onStatusChange,
}: KanbanCardProps): React.ReactElement {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={`kanban-card ${isDragging ? "dragging" : ""}`}
      draggable
      onDragStart={(e) => onDragStart(e, bead.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(bead.id)}
    >
      <div className="card-header">
        <span className="card-id">{bead.id}</span>
        {bead.priority !== undefined && (
          <PriorityBadge priority={bead.priority} size="small" />
        )}
        <button
          className="card-menu-button"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          title="Change status"
        >
          ⋮
        </button>
      </div>

      <div className="card-title">{bead.title}</div>

      {bead.labels && bead.labels.length > 0 && (
        <div className="card-labels">
          {bead.labels.slice(0, 3).map((label) => (
            <LabelBadge key={label} label={label} />
          ))}
        </div>
      )}

      {bead.assignee && (
        <div className="card-assignee">
          <span className="assignee-avatar">
            {bead.assignee.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      {showMenu && (
        <div
          className="card-status-menu"
          onClick={(e) => e.stopPropagation()}
        >
          {COLUMN_ORDER.filter((s) => s !== bead.status).map((status) => (
            <button
              key={status}
              className="status-menu-item"
              onClick={() => {
                onStatusChange(bead.id, status);
                setShowMenu(false);
              }}
            >
              Move to {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
