/**
 * DependencyGraphViewProvider - Provides the Dependency Graph view
 *
 * Features:
 * - Visual graph of bead dependencies
 * - Node coloring by status/priority
 * - Pan and zoom
 * - Click to view details
 * - Focus mode for specific beads
 */

import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage, DependencyGraph } from "../backend/types";

export class DependencyGraphViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsGraph";
  private focusedBeadId: string | null = null;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    outputChannel: vscode.OutputChannel
  ) {
    super(extensionUri, projectManager, outputChannel);
  }

  protected async loadData(): Promise<void> {
    const backend = this.projectManager.getBackend();
    if (!backend) {
      this.postMessage({ type: "setGraph", graph: { nodes: [], edges: [] } });
      return;
    }

    this.setLoading(true);
    this.setError(null);

    try {
      const result = await backend.getDependencyGraph();

      if (result.success && result.data) {
        // Apply max nodes limit
        const config = vscode.workspace.getConfiguration("beads");
        const maxNodes = config.get<number>("maxGraphNodes", 100);

        let graph = result.data;

        if (graph.nodes.length > maxNodes) {
          // Truncate and warn
          graph = {
            nodes: graph.nodes.slice(0, maxNodes),
            edges: graph.edges.filter(
              (e) =>
                graph.nodes.slice(0, maxNodes).some((n) => n.id === e.source) &&
                graph.nodes.slice(0, maxNodes).some((n) => n.id === e.target)
            ),
          };

          vscode.window.showWarningMessage(
            `Graph truncated to ${maxNodes} nodes. Increase beads.maxGraphNodes to see more.`
          );
        }

        this.postMessage({ type: "setGraph", graph });
      } else {
        this.setError(result.error || "Failed to load dependency graph");
        this.postMessage({ type: "setGraph", graph: { nodes: [], edges: [] } });
      }
    } catch (err) {
      this.setError(`Error: ${err}`);
      this.postMessage({ type: "setGraph", graph: { nodes: [], edges: [] } });
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Focus the graph on a specific bead
   */
  public focusBead(beadId: string): void {
    this.focusedBeadId = beadId;
    // Send message to webview to focus on this bead
    this.postMessage({ type: "setBead", bead: { id: beadId } as any });
  }
}
