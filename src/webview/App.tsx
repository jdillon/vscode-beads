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
  vscode,
} from "./types";
import { BeadsPanel } from "./beads-panel/BeadsPanel";
import { Dashboard } from "./dashboard/Dashboard";
import { KanbanBoard } from "./kanban/KanbanBoard";
import { DependencyGraphView } from "./graph/DependencyGraphView";
import { BeadDetails } from "./details/BeadDetails";
import { ProjectSelector } from "./common/ProjectSelector";
import { Loading } from "./common/Loading";
import { ErrorMessage } from "./common/ErrorMessage";

interface AppState {
  viewType: string;
  project: BeadsProject | null;
  projects: BeadsProject[];
  beads: Bead[];
  selectedBead: Bead | null;
  summary: BeadsSummary | null;
  graph: DependencyGraph | null;
  loading: boolean;
  error: string | null;
}

const initialState: AppState = {
  viewType: "",
  project: null,
  projects: [],
  beads: [],
  selectedBead: null,
  summary: null,
  graph: null,
  loading: true,
  error: null,
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
      case "refresh":
        vscode.postMessage({ type: "refresh" });
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
    if (state.loading && state.beads.length === 0 && !state.summary && !state.graph) {
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

    if (!state.project && state.projects.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <h2>No Beads Projects Found</h2>
          <p>
            Initialize a Beads project in your workspace with{" "}
            <code>bd init</code> to get started.
          </p>
        </div>
      );
    }

    switch (state.viewType) {
      case "beadsPanel":
        return (
          <BeadsPanel
            beads={state.beads}
            loading={state.loading}
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
            onUpdateBead={(beadId, updates) =>
              vscode.postMessage({ type: "updateBead", beadId, updates })
            }
          />
        );

      case "beadsDashboard":
        return (
          <Dashboard
            summary={state.summary}
            beads={state.beads}
            loading={state.loading}
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
          />
        );

      case "beadsKanban":
        return (
          <KanbanBoard
            beads={state.beads}
            loading={state.loading}
            onUpdateBead={(beadId, updates) =>
              vscode.postMessage({ type: "updateBead", beadId, updates })
            }
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
          />
        );

      case "beadsGraph":
        return (
          <DependencyGraphView
            graph={state.graph}
            loading={state.loading}
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
          />
        );

      case "beadsDetails":
        return (
          <BeadDetails
            bead={state.selectedBead}
            loading={state.loading}
            onUpdateBead={(beadId, updates) =>
              vscode.postMessage({ type: "updateBead", beadId, updates })
            }
            onAddDependency={(beadId, dependsOnId) =>
              vscode.postMessage({ type: "addDependency", beadId, dependsOnId })
            }
            onRemoveDependency={(beadId, dependsOnId) =>
              vscode.postMessage({ type: "removeDependency", beadId, dependsOnId })
            }
            onViewInGraph={(beadId) =>
              vscode.postMessage({ type: "viewInGraph", beadId })
            }
          />
        );

      default:
        return (
          <div className="empty-state">
            <div className="empty-state-icon">🔧</div>
            <h2>Loading...</h2>
            <p>Waiting for view configuration.</p>
          </div>
        );
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <ProjectSelector
          projects={state.projects}
          activeProject={state.project}
          onSelectProject={(projectId) =>
            vscode.postMessage({ type: "selectProject", projectId })
          }
        />
        <button
          className="icon-button"
          onClick={() => vscode.postMessage({ type: "refresh" })}
          title="Refresh"
        >
          ↻
        </button>
      </header>
      <main className="app-content">{renderView()}</main>
    </div>
  );
}
