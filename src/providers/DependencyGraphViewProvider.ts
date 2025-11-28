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
import { DependencyGraph, GraphNode, GraphEdge, issueToWebviewBead } from "../backend/types";

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
    const client = this.projectManager.getClient();
    if (!client) {
      this.postMessage({ type: "setGraph", graph: { nodes: [], edges: [] } });
      return;
    }

    this.setLoading(true);
    this.setError(null);

    try {
      const issues = await client.list();
      const beads = issues.map(issueToWebviewBead).filter((b): b is NonNullable<typeof b> => b !== null);

      // Build dependency graph from beads
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      for (const bead of beads) {
        nodes.push({
          id: bead.id,
          title: bead.title,
          status: bead.status,
          priority: bead.priority,
        });

        if (bead.dependsOn) {
          for (const depId of bead.dependsOn) {
            edges.push({
              source: bead.id,
              target: depId,
              type: "depends_on",
            });
          }
        }

        if (bead.blocks) {
          for (const blockedId of bead.blocks) {
            edges.push({
              source: bead.id,
              target: blockedId,
              type: "blocks",
            });
          }
        }
      }

      let graph: DependencyGraph = { nodes, edges };

      // Apply max nodes limit
      const config = vscode.workspace.getConfiguration("beads");
      const maxNodes = config.get<number>("maxGraphNodes", 100);

      if (graph.nodes.length > maxNodes) {
        const limitedNodeIds = new Set(graph.nodes.slice(0, maxNodes).map((n) => n.id));
        graph = {
          nodes: graph.nodes.slice(0, maxNodes),
          edges: graph.edges.filter(
            (e) => limitedNodeIds.has(e.source) && limitedNodeIds.has(e.target)
          ),
        };

        vscode.window.showWarningMessage(
          `Graph truncated to ${maxNodes} nodes. Increase beads.maxGraphNodes to see more.`
        );
      }

      this.postMessage({ type: "setGraph", graph });
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
