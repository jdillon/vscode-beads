/**
 * KanbanBoard
 *
 * Status-based board view for issues.
 * Read-only visualization - no drag/drop.
 */

import React, { useState } from "react";
import { Bead, BeadStatus, STATUS_LABELS, STATUS_COLORS } from "../types";
import { TypeBadge } from "../common/TypeBadge";
import { PriorityBadge } from "../common/PriorityBadge";

interface KanbanBoardProps {
  beads: Bead[];
  selectedBeadId: string | null;
  onSelectBead: (beadId: string) => void;
}

const COLUMNS: BeadStatus[] = ["open", "in_progress", "blocked", "closed"];

export function KanbanBoard({ beads, selectedBeadId, onSelectBead }: KanbanBoardProps): React.ReactElement {
  const [closedExpanded, setClosedExpanded] = useState(false);

  // Group beads by status
  const grouped = COLUMNS.reduce((acc, status) => {
    acc[status] = beads.filter((b) => b.status === status);
    return acc;
  }, {} as Record<BeadStatus, Bead[]>);

  return (
    <div className="kanban-board">
      {COLUMNS.map((status) => {
        const isCollapsed = status === "closed" && !closedExpanded;
        const items = grouped[status] || [];

        return (
          <div
            key={status}
            className={`kanban-column ${isCollapsed ? "collapsed" : ""}`}
            style={{ "--column-color": STATUS_COLORS[status] } as React.CSSProperties}
          >
            <div
              className="kanban-column-header"
              onClick={status === "closed" ? () => setClosedExpanded(!closedExpanded) : undefined}
            >
              <span className="kanban-column-title">{STATUS_LABELS[status]}</span>
              <span className="kanban-column-count">{items.length}</span>
            </div>
            {!isCollapsed && (
              <div className="kanban-column-body">
                {items.map((bead) => (
                  <div
                    key={bead.id}
                    className={`kanban-card ${bead.id === selectedBeadId ? "selected" : ""}`}
                    onClick={() => onSelectBead(bead.id)}
                  >
                    <div className="kanban-card-title">{bead.title}</div>
                    <div className="kanban-card-meta">
                      {bead.type && <TypeBadge type={bead.type} size="small" />}
                      {bead.priority !== undefined && <PriorityBadge priority={bead.priority} size="small" />}
                      {bead.assignee && <span className="kanban-card-assignee">{bead.assignee}</span>}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="kanban-empty">No items</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
