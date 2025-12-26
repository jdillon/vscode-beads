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
  vscode,
} from "./types";
import { DashboardView } from "./views/DashboardView";
import { IssuesView } from "./views/IssuesView";
import { DetailsView } from "./views/DetailsView";
import { Loading } from "./common/Loading";
import { ToastProvider, triggerToast } from "./common/Toast";
import { useBeadsStore, useBeadsList } from "./store/beads-query";

interface AppState {
  viewType: string;
  project: BeadsProject | null;
  projects: BeadsProject[];
  // beads now managed by TanStack Query via useBeadsList
  selectedBead: Bead | null;
  selectedBeadId: string | null;
  summary: BeadsSummary | null;
  loading: boolean;
  error: string | null;
  settings: WebviewSettings;
}

const initialState: AppState = {
  viewType: "",
  project: null,
  projects: [],
  selectedBead: null,
  selectedBeadId: null,
  summary: null,
  loading: true,
  error: null,
  settings: { renderMarkdown: true, userId: "" },
};

export function App(): React.ReactElement {
  const [state, setState] = useState<AppState>(initialState);
  const { setBeads } = useBeadsStore();
  const beads = useBeadsList();

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
        // Populate TanStack Query cache
        setBeads(message.beads);
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
      case "setSettings":
        setState((prev) => ({ ...prev, settings: message.settings }));
        break;
      case "refresh":
        vscode.postMessage({ type: "refresh" });
        break;
      case "showToast":
        triggerToast(message.text, "top-right");
        break;
    }
  }, [setBeads]);

  useEffect(() => {
    // Listen for messages from the extension
    window.addEventListener("message", handleMessage);

    // Notify extension that webview is ready
    vscode.postMessage({ type: "ready" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);

  // Render the appropriate view
  const renderView = () => {
    // Only show loading for beadsPanel when loading initial data
    if (state.viewType === "beadsPanel" && state.loading && beads.length === 0) {
      return <Loading />;
    }

    switch (state.viewType) {
      case "beadsDashboard":
        return (
          <DashboardView
            summary={state.summary}
            beads={beads}
            loading={state.loading}
            error={state.error}
            projects={state.projects}
            activeProject={state.project}
            onSelectProject={(projectId) =>
              vscode.postMessage({ type: "selectProject", projectId })
            }
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
            onStartDaemon={() =>
              vscode.postMessage({ type: "startDaemon" })
            }
            onRetry={() =>
              vscode.postMessage({ type: "refresh" })
            }
          />
        );

      case "beadsPanel":
        return (
          <IssuesView
            beads={beads}
            loading={state.loading}
            error={state.error}
            selectedBeadId={state.selectedBeadId}
            projects={state.projects}
            activeProject={state.project}
            onSelectProject={(projectId) =>
              vscode.postMessage({ type: "selectProject", projectId })
            }
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
            onUpdateBead={(beadId, updates) =>
              vscode.postMessage({ type: "updateBead", beadId, updates })
            }
            onStartDaemon={() =>
              vscode.postMessage({ type: "startDaemon" })
            }
            onRetry={() =>
              vscode.postMessage({ type: "refresh" })
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
          new Set(beads.map((b) => b.assignee).filter((a): a is string => !!a))
        ).sort();
        return (
          <DetailsView
            bead={state.selectedBead}
            loading={state.loading}
            renderMarkdown={state.settings.renderMarkdown}
            userId={state.settings.userId}
            knownAssignees={knownAssignees}
            onUpdateBead={(beadId, updates) =>
              vscode.postMessage({ type: "updateBead", beadId, updates })
            }
            onAddDependency={(beadId, dependsOnId) =>
              vscode.postMessage({ type: "addDependency", beadId, dependsOnId })
            }
            onRemoveDependency={(beadId, dependsOnId) =>
              vscode.postMessage({ type: "removeDependency", beadId, dependsOnId })
            }
            onAddComment={(beadId, text) =>
              vscode.postMessage({ type: "addComment", beadId, text })
            }
            onViewInGraph={(beadId) =>
              vscode.postMessage({ type: "viewInGraph", beadId })
            }
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
            onCopyId={(beadId) =>
              vscode.postMessage({ type: "copyBeadId", beadId })
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
