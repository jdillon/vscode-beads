/**
 * Main App Component
 *
 * Routes to the appropriate view based on viewType.
 * Manages global state and message passing with the extension.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Bead,
  BeadsProject,
  BeadsSummary,
  ExtensionMessage,
  WebviewSettings,
  postToExtension,
} from "./types";
import { DashboardView } from "./views/DashboardView";
import { IssuesView } from "./views/IssuesView";
import { DetailsView } from "./views/DetailsView";
import { WorkbenchView } from "./views/WorkbenchView";
import { Loading } from "./common/Loading";
import { NoProject } from "./common/NoProject";
import { ToastProvider, triggerToast } from "./common/Toast";

interface AppState {
  viewType: string;
  project: BeadsProject | null;
  projects: BeadsProject[];
  beads: Bead[];
  selectedBead: Bead | null;
  selectedBeadId: string | null;
  summary: BeadsSummary | null;
  loading: boolean;
  error: string | null;
  /** Scoped to the workbench Details section, so it cannot blank its siblings */
  detailsError: string | null;
  settings: WebviewSettings;
}

const initialState: AppState = {
  viewType: "",
  project: null,
  projects: [],
  beads: [],
  selectedBead: null,
  selectedBeadId: null,
  summary: null,
  loading: true,
  error: null,
  detailsError: null,
  settings: { renderMarkdown: true, userId: "", tooltipHoverDelay: 1000 },
};

export function App(): React.ReactElement {
  const [state, setState] = useState<AppState>(initialState);

  // Handle messages from the extension
  const handleMessage = useCallback((event: MessageEvent<ExtensionMessage>) => {
    const message = event.data;

    switch (message.type) {
      case "setViewType":
        setState((prev) => ({ ...prev, viewType: message.viewType }));
        break;
      case "setProject":
        setState((prev) => ({ ...prev, project: message.project }));
        break;
      case "setProjects":
        setState((prev) => ({ ...prev, projects: message.projects }));
        break;
      case "setBeads":
        setState((prev) => ({ ...prev, beads: message.beads }));
        break;
      case "setBead":
        setState((prev) => ({ ...prev, selectedBead: message.bead }));
        break;
      case "setSelectedBeadId":
        setState((prev) => ({ ...prev, selectedBeadId: (message as { type: "setSelectedBeadId"; beadId: string | null }).beadId }));
        break;
      case "setSummary":
        setState((prev) => ({ ...prev, summary: message.summary }));
        break;
      case "setLoading":
        setState((prev) => ({ ...prev, loading: message.loading }));
        break;
      case "setError":
        setState((prev) => ({ ...prev, error: message.error }));
        break;
      case "setDetailsError":
        setState((prev) => ({ ...prev, detailsError: message.error }));
        break;
      case "setSettings":
        setState((prev) => ({ ...prev, settings: message.settings }));
        break;
      case "refresh":
        postToExtension({ type: "refresh" });
        break;
      case "showToast":
        triggerToast(message.text, "top-right");
        break;
    }
  }, []);

  useEffect(() => {
    // Listen for messages from the extension
    window.addEventListener("message", handleMessage);

    // Notify extension that webview is ready
    postToExtension({ type: "ready" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);

  // Render the appropriate view
  const renderView = () => {
      // Discovery finished without a project: show how to fix it, not a spinner (#76)
      if (
        !state.loading &&
        !state.project &&
        (state.viewType === "beadsPanel" || state.viewType === "beadsDashboard")
      ) {
        return <NoProject />;
      }

      if (state.viewType === "beadsPanel" && state.loading && state.beads.length === 0) {
        return <Loading />;
      }

      switch (state.viewType) {
      case "beadsWorkbench":
        return (
          <WorkbenchView
            summary={state.summary}
            beads={state.beads}
            selectedBead={state.selectedBead}
            selectedBeadId={state.selectedBeadId}
            loading={state.loading}
            error={state.error}
            detailsError={state.detailsError}
            projects={state.projects}
            activeProject={state.project}
            settings={state.settings}
          />
        );

      case "beadsDashboard":
        return (
          <DashboardView
            summary={state.summary}
            beads={state.beads}
            loading={state.loading}
            error={state.error}
            projects={state.projects}
            activeProject={state.project}
            onSelectProject={(project) =>
              postToExtension({
                type: "selectProject",
                projectId: project.id,
                projectRootPath: project.rootPath,
              })
            }
            onSelectBead={(beadId) =>
              postToExtension({ type: "openBeadDetails", beadId })
            }
            onShowStatus={() => postToExtension({ type: "showDoltStatus" })}
            onStartDolt={() => postToExtension({ type: "startDoltServer" })}
            onStopDolt={() => postToExtension({ type: "stopDoltServer" })}
            onOpenDoltLog={() => postToExtension({ type: "openDoltLog" })}
            onOpenProjectFolder={() => postToExtension({ type: "openProjectFolder" })}
            onRetry={() =>
              postToExtension({ type: "refresh" })
            }
          />
        );

      case "beadsPanel":
        return (
          <IssuesView
            beads={state.beads}
            loading={state.loading}
            error={state.error}
            selectedBeadId={state.selectedBeadId}
            tooltipHoverDelay={state.settings.tooltipHoverDelay}
            onSelectBead={(beadId) =>
              postToExtension({ type: "openBeadDetails", beadId })
            }
            onUpdateBead={(beadId, updates) =>
              postToExtension({ type: "updateBead", beadId, updates })
            }
            onRetry={() =>
              postToExtension({ type: "refresh" })
            }
          />
        );

      case "beadsDetails": {
        if (!state.selectedBead && !state.loading) {
          return (
            <div className="empty-state compact">
              <p>Select an issue to view details</p>
            </div>
          );
        }
        if (!state.selectedBead) {
          return <Loading />;
        }
        // Extract unique assignees from beads list
        const knownAssignees = Array.from(
          new Set(state.beads.map((b) => b.assignee).filter((a): a is string => !!a))
        ).sort();
        return (
          <DetailsView
            bead={state.selectedBead}
            loading={state.loading}
            renderMarkdown={state.settings.renderMarkdown}
            userId={state.settings.userId}
            knownAssignees={knownAssignees}
            onUpdateBead={(beadId, updates) =>
              postToExtension({ type: "updateBead", beadId, updates })
            }
            onAddDependency={(beadId, targetId, dependencyType, reverse) =>
              postToExtension({ type: "addDependency", beadId, targetId, dependencyType, reverse })
            }
            onRemoveDependency={(beadId, dependsOnId) =>
              postToExtension({ type: "removeDependency", beadId, dependsOnId })
            }
            onAddComment={(beadId, text) =>
              postToExtension({ type: "addComment", beadId, text })
            }
            onViewInGraph={(beadId) =>
              postToExtension({ type: "viewInGraph", beadId })
            }
            onSelectBead={(beadId) =>
              postToExtension({ type: "openBeadDetails", beadId })
            }
            onCopyId={(beadId) =>
              postToExtension({ type: "copyBeadId", beadId })
            }
          />
        );
      }

      default:
        return (
          <div className="empty-state">
            <p>Loading...</p>
          </div>
        );
    }
  };

  return (
    <ToastProvider>
      <div className="app">
        <main className="app-content">{renderView()}</main>
      </div>
    </ToastProvider>
  );
}
