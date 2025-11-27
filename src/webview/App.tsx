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
  DependencyGraph,
  ExtensionMessage,
  WebviewSettings,
  vscode,
} from "./types";
import { DashboardView } from "./views/DashboardView";
import { IssuesView } from "./views/IssuesView";
import { DetailsView } from "./views/DetailsView";
import { Loading } from "./common/Loading";
import { ErrorMessage } from "./common/ErrorMessage";
import { ToastProvider, triggerToast } from "./common/Toast";

interface AppState {
  viewType: string;
  project: BeadsProject | null;
  projects: BeadsProject[];
  beads: Bead[];
  selectedBead: Bead | null;
  selectedBeadId: string | null;
  summary: BeadsSummary | null;
  graph: DependencyGraph | null;
  loading: boolean;
  error: string | null;
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
  graph: null,
  loading: true,
  error: null,
  settings: { renderMarkdown: true },
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
      case "setGraph":
        setState((prev) => ({ ...prev, graph: message.graph }));
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
  }, []);

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
    if (state.viewType === "beadsPanel" && state.loading && state.beads.length === 0) {
      return <Loading />;
    }

    if (state.error && !state.loading) {
      return (
        <ErrorMessage
          message={state.error}
          onRetry={() => vscode.postMessage({ type: "refresh" })}
        />
      );
    }

    switch (state.viewType) {
      case "beadsDashboard":
        return (
          <DashboardView
            summary={state.summary}
            beads={state.beads}
            loading={state.loading}
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
          />
        );

      case "beadsPanel":
        return (
          <IssuesView
            beads={state.beads}
            loading={state.loading}
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
          />
        );

      case "beadsDetails":
        if (!state.selectedBead && !state.loading) {
          return (
            <div className="empty-state compact">
              <p>Select an issue from the list</p>
            </div>
          );
        }
        if (!state.selectedBead) {
          return <Loading />;
        }
        return (
          <DetailsView
            bead={state.selectedBead}
            loading={state.loading}
            renderMarkdown={state.settings.renderMarkdown}
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
          />
        );

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
