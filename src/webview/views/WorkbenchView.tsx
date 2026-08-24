/**
 * WorkbenchView
 *
 * Dashboard, Issues and Details in a single panel, with a selector at the top.
 * Navigation is local: clicking an issue anywhere in here switches to the
 * Details section instead of revealing the sidebar view.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Bead,
  BeadsProject,
  BeadsSummary,
  DependencyType,
  WebviewSettings,
  postToExtension,
} from "../types";
import { DashboardView } from "./DashboardView";
import { IssuesView } from "./IssuesView";
import { DetailsView } from "./DetailsView";
import { ErrorMessage } from "../common/ErrorMessage";
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
  detailsError: string | null;
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
  detailsError,
  projects,
  activeProject,
  settings,
}: WorkbenchViewProps): React.ReactElement {
  const [route, setRoute] = useState<WorkbenchRoute>("dashboard");

  // Selecting a bead moves to Details rather than opening another surface
  const selectBead = useCallback((beadId: string) => {
    setRoute("details");
    postToExtension({ type: "openBeadDetails", beadId });
  }, []);

  const refresh = useCallback(() => postToExtension({ type: "refresh" }), []);

  const selectProject = useCallback((project: BeadsProject) => {
    postToExtension({
      type: "selectProject",
      projectId: project.id,
      projectRootPath: project.rootPath,
    });
  }, []);

  const updateBead = useCallback((beadId: string, updates: Partial<Bead>) => {
    postToExtension({ type: "updateBead", beadId, updates });
  }, []);

  const addDependency = useCallback(
    (beadId: string, targetId: string, dependencyType: DependencyType, reverse: boolean) => {
      postToExtension({ type: "addDependency", beadId, targetId, dependencyType, reverse });
    },
    []
  );

  const removeDependency = useCallback((beadId: string, dependsOnId: string) => {
    postToExtension({ type: "removeDependency", beadId, dependsOnId });
  }, []);

  const addComment = useCallback((beadId: string, text: string) => {
    postToExtension({ type: "addComment", beadId, text });
  }, []);

  const viewInGraph = useCallback((beadId: string) => {
    postToExtension({ type: "viewInGraph", beadId });
  }, []);

  const copyId = useCallback((beadId: string) => {
    postToExtension({ type: "copyBeadId", beadId });
  }, []);

  const showDoltStatus = useCallback(() => postToExtension({ type: "showDoltStatus" }), []);
  const startDolt = useCallback(() => postToExtension({ type: "startDoltServer" }), []);
  const stopDolt = useCallback(() => postToExtension({ type: "stopDoltServer" }), []);
  const openDoltLog = useCallback(() => postToExtension({ type: "openDoltLog" }), []);
  const openProjectFolder = useCallback(() => postToExtension({ type: "openProjectFolder" }), []);

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

  // Discovery finished without a project: show how to fix it, not a spinner
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
            onSelectProject={selectProject}
            onSelectBead={selectBead}
            onShowStatus={showDoltStatus}
            onStartDolt={startDolt}
            onStopDolt={stopDolt}
            onOpenDoltLog={openDoltLog}
            onOpenProjectFolder={openProjectFolder}
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
            onUpdateBead={updateBead}
            onRetry={refresh}
          />
        )}

        {route === "details" && (
          <WorkbenchDetails
            bead={selectedBead}
            selectedBeadId={selectedBeadId}
            detailsError={detailsError}
            settings={settings}
            knownAssignees={knownAssignees}
            onSelectBead={selectBead}
            onUpdateBead={updateBead}
            onAddDependency={addDependency}
            onRemoveDependency={removeDependency}
            onAddComment={addComment}
            onViewInGraph={viewInGraph}
            onCopyId={copyId}
          />
        )}
      </div>
    </div>
  );
}

interface WorkbenchDetailsProps {
  bead: Bead | null;
  selectedBeadId: string | null;
  detailsError: string | null;
  settings: WebviewSettings;
  knownAssignees: string[];
  onSelectBead: (beadId: string) => void;
  onUpdateBead: (beadId: string, updates: Partial<Bead>) => void;
  onAddDependency: (beadId: string, targetId: string, dependencyType: DependencyType, reverse: boolean) => void;
  onRemoveDependency: (beadId: string, dependsOnId: string) => void;
  onAddComment: (beadId: string, text: string) => void;
  onViewInGraph: (beadId: string) => void;
  onCopyId: (beadId: string) => void;
}

function WorkbenchDetails({
  bead,
  selectedBeadId,
  detailsError,
  settings,
  knownAssignees,
  onSelectBead,
  onUpdateBead,
  onAddDependency,
  onRemoveDependency,
  onAddComment,
  onViewInGraph,
  onCopyId,
}: WorkbenchDetailsProps): React.ReactElement {
  if (!selectedBeadId) {
    return (
      <div className="empty-state compact">
        <p>Select an issue to view details</p>
      </div>
    );
  }

  // The bead for the current selection has not arrived yet. A Details-scoped
  // error ends the wait so a failed load does not spin forever.
  if (bead?.id !== selectedBeadId) {
    if (detailsError) {
      return (
        <ErrorMessage
          message={detailsError}
          onRetry={() => onSelectBead(selectedBeadId)}
        />
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
      onUpdateBead={onUpdateBead}
      onAddDependency={onAddDependency}
      onRemoveDependency={onRemoveDependency}
      onAddComment={onAddComment}
      onViewInGraph={onViewInGraph}
      onSelectBead={onSelectBead}
      onCopyId={onCopyId}
    />
  );
}
