/**
 * DashboardView
 *
 * High-level overview with:
 * - Summary cards (total, by status, by priority)
 * - Ready/blocked/in-progress sections
 * - Quick access to important beads
 */

import React from "react";
import {
  Bead,
  BeadsProject,
  BeadsSummary,
  BeadStatus,
  STATUS_COLORS,
} from "../types";
import { ErrorMessage } from "../common/ErrorMessage";
import { Loading } from "../common/Loading";
import { ProjectDropdown } from "../common/ProjectDropdown";
import { Dropdown, DropdownItem } from "../common/Dropdown";
import { StatusBadge } from "../common/StatusBadge";
import { PriorityBadge } from "../common/PriorityBadge";
import { LabelBadge } from "../common/LabelBadge";
import { getLabelColorStyle } from "../utils/label-colors";

interface DashboardViewProps {
  summary: BeadsSummary | null;
  beads: Bead[];
  loading: boolean;
  error: string | null;
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  onSelectProject: (project: BeadsProject) => void;
  onShowStatus: () => void;
  onStartDolt: () => void;
  onStopDolt: () => void;
  onOpenDoltLog: () => void;
  onOpenProjectFolder: () => void;
  onRetry: () => void;
}

export function DashboardView({
  summary,
  beads,
  loading,
  error,
  projects,
  activeProject,
  onSelectProject,
  onShowStatus,
  onStartDolt,
  onStopDolt,
  onOpenDoltLog,
  onOpenProjectFolder,
  onRetry,
}: DashboardViewProps): React.ReactElement {
  const openBeads = beads.filter((b) => b.status === "open").slice(0, 5);
  const blockedBeads = beads.filter((b) => b.status === "blocked").slice(0, 5);
  const inProgressBeads = beads.filter((b) => b.status === "in_progress").slice(0, 5);
  const topLabels = Array.from(
    beads.reduce((acc, bead) => {
      for (const label of bead.labels ?? []) {
        acc.set(label, (acc.get(label) ?? 0) + 1);
      }
      return acc;
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);

  return (
    <div className="dashboard dashboard-compact">
      <div className="dashboard-toolbar">
        <ProjectDropdown
          projects={projects}
          activeProject={activeProject}
          onSelectProject={onSelectProject}
        />
        {activeProject && (
          <Dropdown
            trigger={<span className="dashboard-menu-trigger">⋮</span>}
            className="dashboard-actions-dropdown"
            triggerClassName="dashboard-menu-btn"
            menuClassName="dashboard-actions-menu"
            title="Project actions"
            showChevron={false}
            menuPlacement="bottom-end"
          >
            <DropdownItem onClick={onRetry}>
              <span className="dashboard-menu-item"><span className="dashboard-menu-item-icon">↻</span><span>Refresh</span></span>
            </DropdownItem>
            <DropdownItem onClick={onShowStatus}>
              <span className="dashboard-menu-item"><span className="dashboard-menu-item-icon">i</span><span>Show Dolt Status</span></span>
            </DropdownItem>
            <DropdownItem onClick={onStartDolt}>
              <span className="dashboard-menu-item"><span className="dashboard-menu-item-icon">▶</span><span>Start Dolt</span></span>
            </DropdownItem>
            <DropdownItem onClick={onStopDolt}>
              <span className="dashboard-menu-item"><span className="dashboard-menu-item-icon">■</span><span>Stop Dolt</span></span>
            </DropdownItem>
            <DropdownItem onClick={onOpenDoltLog}>
              <span className="dashboard-menu-item"><span className="dashboard-menu-item-icon">≡</span><span>Open Dolt Log</span></span>
            </DropdownItem>
          </Dropdown>
        )}
      </div>

      {error && !loading && <ErrorMessage message={error} onRetry={onRetry} />}

      {loading && !error && <Loading />}

      {activeProject && !error && (
        <div className="dashboard-project-dir">
          <span className="dashboard-project-dir-label">Project Dir</span>
          <button
            className="dashboard-project-dir-link"
            title={activeProject.rootPath}
            onClick={onOpenProjectFolder}
          >
            <span className="dashboard-project-dir-value">{activeProject.rootPath}</span>
          </button>
        </div>
      )}

      {summary && !error && (
        <>
          <div className="summary-section compact">
            <div className="summary-card total">
              <div className="card-value">{summary.total || 0}</div>
              <div className="card-label">Total</div>
            </div>
            <div className="summary-card ready">
              <div className="card-value">{summary.readyCount || 0}</div>
              <div className="card-label">Open</div>
            </div>
            <div className="summary-card in-progress">
              <div className="card-value">{summary.inProgressCount || 0}</div>
              <div className="card-label">Doing</div>
            </div>
            <div className="summary-card blocked">
              <div className="card-value">{summary.blockedCount || 0}</div>
              <div className="card-label">Blocked</div>
            </div>
          </div>

          <div className="breakdown-section compact">
            <h3>By Status</h3>
            <div className="breakdown-bars compact">
              {(Object.keys(summary.byStatus) as BeadStatus[]).map((status) => {
                const count = summary.byStatus[status];
                const percentage = summary.total > 0 ? (count / summary.total) * 100 : 0;
                if (count === 0) return null;
                return (
                  <div key={status} className="breakdown-bar compact">
                    <div className="bar-label compact">
                      <StatusBadge status={status} size="small" />
                      <span className="bar-count">{count}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${percentage}%`, backgroundColor: STATUS_COLORS[status] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {topLabels.length > 0 && (
            <div className="breakdown-section compact">
              <h3>By Label</h3>
              <div className="breakdown-bars compact">
                {topLabels.map(([label, count]) => {
                  const percentage = summary.total > 0 ? (count / summary.total) * 100 : 0;
                  return (
                    <div key={label} className="breakdown-bar compact">
                      <div className="bar-label compact label">
                        <LabelBadge label={label} />
                        <span className="bar-count">{count}</span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill label"
                          style={{ width: `${percentage}%`, backgroundColor: getLabelColorStyle(label).backgroundColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="work-sections compact">
            {openBeads.length > 0 && (
              <div className="work-section open compact">
                <h3>Open</h3>
                <ul className="bead-list">
                  {openBeads.map((bead) => <BeadListItem key={bead.id} bead={bead} />)}
                </ul>
              </div>
            )}
            {inProgressBeads.length > 0 && (
              <div className="work-section in-progress compact">
                <h3>In Progress</h3>
                <ul className="bead-list">
                  {inProgressBeads.map((bead) => <BeadListItem key={bead.id} bead={bead} />)}
                </ul>
              </div>
            )}
            {blockedBeads.length > 0 && (
              <div className="work-section blocked compact">
                <h3>Blocked</h3>
                <ul className="bead-list">
                  {blockedBeads.map((bead) => <BeadListItem key={bead.id} bead={bead} />)}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BeadListItem({ bead }: { bead: Bead }): React.ReactElement {
  return (
    <li className="bead-list-item compact">
      <div className="bead-info">
        <span className="bead-id">{bead.id}</span>
        <span className="bead-title">{bead.title}</span>
      </div>
      <div className="bead-badges">
        {bead.priority !== undefined && <PriorityBadge priority={bead.priority} size="small" />}
      </div>
    </li>
  );
}
