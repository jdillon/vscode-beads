/**
 * Dashboard Component
 *
 * High-level overview with:
 * - Summary cards (total, by status, by priority)
 * - Ready/blocked/in-progress sections
 * - Quick access to important beads
 */

import React from "react";
import {
  Bead,
  BeadsSummary,
  BeadStatus,
  BeadPriority,
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from "../types";
import { StatusBadge } from "../common/StatusBadge";
import { PriorityBadge } from "../common/PriorityBadge";

interface DashboardProps {
  summary: BeadsSummary | null;
  beads: Bead[];
  loading: boolean;
  onSelectBead: (beadId: string) => void;
}

export function Dashboard({
  summary,
  beads,
  loading,
  onSelectBead,
}: DashboardProps): React.ReactElement {
  if (!summary && loading) {
    return <div className="dashboard loading">Loading dashboard...</div>;
  }

  const readyBeads = beads.filter((b) => b.status === "ready").slice(0, 5);
  const blockedBeads = beads.filter((b) => b.status === "blocked").slice(0, 5);
  const inProgressBeads = beads.filter((b) => b.status === "in_progress").slice(0, 5);

  return (
    <div className="dashboard">
      {/* Summary Cards */}
      <div className="summary-section">
        <div className="summary-card total">
          <div className="card-value">{summary?.total || 0}</div>
          <div className="card-label">Total Beads</div>
        </div>

        <div className="summary-card ready">
          <div className="card-value">{summary?.readyCount || 0}</div>
          <div className="card-label">Ready</div>
        </div>

        <div className="summary-card in-progress">
          <div className="card-value">{summary?.inProgressCount || 0}</div>
          <div className="card-label">In Progress</div>
        </div>

        <div className="summary-card blocked">
          <div className="card-value">{summary?.blockedCount || 0}</div>
          <div className="card-label">Blocked</div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="breakdown-section">
        <h3>By Status</h3>
        <div className="breakdown-bars">
          {summary &&
            (Object.keys(summary.byStatus) as BeadStatus[]).map((status) => {
              const count = summary.byStatus[status];
              const percentage =
                summary.total > 0 ? (count / summary.total) * 100 : 0;
              if (count === 0) return null;
              return (
                <div key={status} className="breakdown-bar">
                  <div className="bar-label">
                    <StatusBadge status={status} size="small" />
                    <span className="bar-count">{count}</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: STATUS_COLORS[status],
                      }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Priority Breakdown */}
      <div className="breakdown-section">
        <h3>By Priority</h3>
        <div className="breakdown-bars">
          {summary &&
            ([0, 1, 2, 3, 4] as BeadPriority[]).map((priority) => {
              const count = summary.byPriority[priority];
              const percentage =
                summary.total > 0 ? (count / summary.total) * 100 : 0;
              if (count === 0) return null;
              return (
                <div key={priority} className="breakdown-bar">
                  <div className="bar-label">
                    <PriorityBadge priority={priority} size="small" />
                    <span className="bar-count">{count}</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: PRIORITY_COLORS[priority],
                      }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Work Sections */}
      <div className="work-sections">
        {readyBeads.length > 0 && (
          <div className="work-section ready">
            <h3>Ready to Start</h3>
            <ul className="bead-list">
              {readyBeads.map((bead) => (
                <BeadListItem key={bead.id} bead={bead} onClick={onSelectBead} />
              ))}
            </ul>
          </div>
        )}

        {inProgressBeads.length > 0 && (
          <div className="work-section in-progress">
            <h3>In Progress</h3>
            <ul className="bead-list">
              {inProgressBeads.map((bead) => (
                <BeadListItem key={bead.id} bead={bead} onClick={onSelectBead} />
              ))}
            </ul>
          </div>
        )}

        {blockedBeads.length > 0 && (
          <div className="work-section blocked">
            <h3>Blocked</h3>
            <ul className="bead-list">
              {blockedBeads.map((bead) => (
                <BeadListItem key={bead.id} bead={bead} onClick={onSelectBead} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

interface BeadListItemProps {
  bead: Bead;
  onClick: (beadId: string) => void;
}

function BeadListItem({ bead, onClick }: BeadListItemProps): React.ReactElement {
  return (
    <li className="bead-list-item" onClick={() => onClick(bead.id)}>
      <div className="bead-info">
        <span className="bead-id">{bead.id}</span>
        <span className="bead-title">{bead.title}</span>
      </div>
      <div className="bead-badges">
        {bead.priority !== undefined && (
          <PriorityBadge priority={bead.priority} size="small" />
        )}
      </div>
    </li>
  );
}
