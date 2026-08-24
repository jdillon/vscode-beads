/**
 * WorkbenchView
 *
 * Dashboard, Issues and Details in a single panel, with a selector at the top.
 * Navigation is local: clicking an issue anywhere in here switches to the
 * Details section instead of revealing the sidebar view (#88).
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Bead,
  BeadsProject,
  BeadsSummary,
  WebviewSettings,
  vscode,
} from "../types";
import { DashboardView } from "./DashboardView";
import { IssuesView } from "./IssuesView";
import { DetailsView } from "./DetailsView";
import { Loading } from "../common/Loading";
import { NoProject } from "../common/NoProject";
import { SegmentedControl, SegmentedControlOption } from "../common/SegmentedControl";

type WorkbenchRoute = "dashboard" | "issues" | "details";

interface WorkbenchViewProps {
  summary: BeadsSummary | null;
  beads: Bead[];
  selectedBead: Bead | null;
  selectedBeadId: string | null;
  loading: boolean;
  error: string | null;
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  settings: WebviewSettings;
}

export function WorkbenchView({
  summary,
  beads,
  selectedBead,
  selectedBeadId,
  loading,
  error,
  projects,
  activeProject,
  settings,
}: WorkbenchViewProps): React.ReactElement {
  const [route, setRoute] = useState<WorkbenchRoute>("dashboard");

  // Selecting a bead moves to Details rather than opening another surface
  const selectBead = useCallback((beadId: string) => {
    setRoute("details");
    vscode.postMessage({ type: "openBeadDetails", beadId });
  }, []);

  const refresh = useCallback(() => {
    vscode.postMessage({ type: "refresh" });
  }, []);

  // Extract unique assignees from beads list
  const knownAssignees = useMemo(
    () =>
      Array.from(
        new Set(beads.map((b) => b.assignee).filter((a): a is string => !!a))
      ).sort(),
    [beads]
  );

  const options: SegmentedControlOption<WorkbenchRoute>[] = [
    { value: "dashboard", label: "Dashboard" },
    { value: "issues", label: "Issues", count: beads.length },
    { value: "details", label: "Details" },
  ];

  // Discovery finished without a project: show how to fix it, not a spinner (#76)
  if (!loading && !activeProject) {
    return <NoProject />;
  }

  return (
    <div className="workbench">
      <div className="app-header workbench-header">
        <SegmentedControl
          options={options}
          value={route}
          onChange={setRoute}
          label="Beads sections"
        />
        <button className="icon-button" title="Refresh" onClick={refresh}>
          ⟳
        </button>
      </div>

      <div className="workbench-body">
        {route === "dashboard" && (
          <DashboardView
            summary={summary}
            beads={beads}
            loading={loading}
            error={error}
            projects={projects}
            activeProject={activeProject}
            onSelectProject={(project) =>
              vscode.postMessage({
                type: "selectProject",
                projectId: project.id,
                projectRootPath: project.rootPath,
              })
            }
            onSelectBead={selectBead}
            onShowStatus={() => vscode.postMessage({ type: "showDoltStatus" })}
            onStartDolt={() => vscode.postMessage({ type: "startDoltServer" })}
            onStopDolt={() => vscode.postMessage({ type: "stopDoltServer" })}
            onOpenDoltLog={() => vscode.postMessage({ type: "openDoltLog" })}
            onOpenProjectFolder={() => vscode.postMessage({ type: "openProjectFolder" })}
            onRetry={refresh}
          />
        )}

        {route === "issues" && (
          <IssuesView
            beads={beads}
            loading={loading}
            error={error}
            selectedBeadId={selectedBeadId}
            tooltipHoverDelay={settings.tooltipHoverDelay}
            onSelectBead={selectBead}
            onUpdateBead={(beadId, updates) =>
              vscode.postMessage({ type: "updateBead", beadId, updates })
            }
            onRetry={refresh}
          />
        )}

        {route === "details" && (
          <WorkbenchDetails
            bead={selectedBead}
            selectedBeadId={selectedBeadId}
            error={error}
            settings={settings}
            knownAssignees={knownAssignees}
            onSelectBead={selectBead}
          />
        )}
      </div>
    </div>
  );
}

interface WorkbenchDetailsProps {
  bead: Bead | null;
  selectedBeadId: string | null;
  error: string | null;
  settings: WebviewSettings;
  knownAssignees: string[];
  onSelectBead: (beadId: string) => void;
}

function WorkbenchDetails({
  bead,
  selectedBeadId,
  error,
  settings,
  knownAssignees,
  onSelectBead,
}: WorkbenchDetailsProps): React.ReactElement {
  if (!selectedBeadId) {
    return (
      <div className="empty-state compact">
        <p>Select an issue to view details</p>
      </div>
    );
  }

  // The bead for the current selection has not arrived yet. An error clears
  // the wait so a failed load does not spin forever.
  if (bead?.id !== selectedBeadId) {
    if (error) {
      return (
        <div className="empty-state compact">
          <p>Could not load {selectedBeadId}</p>
        </div>
      );
    }
    return <Loading />;
  }

  return (
    <DetailsView
      bead={bead}
      loading={false}
      renderMarkdown={settings.renderMarkdown}
      userId={settings.userId}
      knownAssignees={knownAssignees}
      onUpdateBead={(beadId, updates) =>
        vscode.postMessage({ type: "updateBead", beadId, updates })
      }
      onAddDependency={(beadId, targetId, dependencyType, reverse) =>
        vscode.postMessage({ type: "addDependency", beadId, targetId, dependencyType, reverse })
      }
      onRemoveDependency={(beadId, dependsOnId) =>
        vscode.postMessage({ type: "removeDependency", beadId, dependsOnId })
      }
      onAddComment={(beadId, text) =>
        vscode.postMessage({ type: "addComment", beadId, text })
      }
      onViewInGraph={(beadId) => vscode.postMessage({ type: "viewInGraph", beadId })}
      onSelectBead={onSelectBead}
      onCopyId={(beadId) => vscode.postMessage({ type: "copyBeadId", beadId })}
    />
  );
}
