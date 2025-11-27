/**
 * DashboardViewProvider - Provides the Dashboard summary view
 *
 * Features:
 * - Summary cards with counts by status
 * - Priority breakdown
 * - Ready/blocked/in-progress sections
 * - Quick access to important beads
 */

import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { Bead, BeadsSummary, issueToWebviewBead, BeadStatus, BeadPriority } from "../backend/types";

export class DashboardViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsDashboard";

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
      this.postMessage({
        type: "setSummary",
        summary: {
          total: 0,
          byStatus: {
            backlog: 0,
            ready: 0,
            in_progress: 0,
            blocked: 0,
            done: 0,
            closed: 0,
            unknown: 0,
          },
          byPriority: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
          readyCount: 0,
          blockedCount: 0,
          inProgressCount: 0,
        },
      });
      this.postMessage({ type: "setBeads", beads: [] });
      return;
    }

    this.setLoading(true);
    this.setError(null);

    try {
      // Get all issues and compute summary
      const issues = await client.list();
      const beads = issues.map(issueToWebviewBead);

      // Compute summary
      const byStatus: Record<BeadStatus, number> = {
        backlog: 0,
        ready: 0,
        in_progress: 0,
        blocked: 0,
        done: 0,
        closed: 0,
        unknown: 0,
      };

      const byPriority: Record<BeadPriority, number> = {
        0: 0,
        1: 0,
        2: 0,
        3: 0,
        4: 0,
      };

      for (const bead of beads) {
        byStatus[bead.status]++;
        if (bead.priority !== undefined) {
          byPriority[bead.priority]++;
        }
      }

      const summary: BeadsSummary = {
        total: beads.length,
        byStatus,
        byPriority,
        readyCount: byStatus.ready,
        blockedCount: byStatus.blocked,
        inProgressCount: byStatus.in_progress,
      };

      this.postMessage({ type: "setSummary", summary });

      // Get open and blocked beads for quick access
      const openBeads = beads.filter((b) => b.status === "open").slice(0, 5);
      const blockedBeads = beads.filter((b) => b.status === "blocked").slice(0, 5);
      const inProgressBeads = beads.filter((b) => b.status === "in_progress").slice(0, 5);

      const importantBeads = [...openBeads, ...blockedBeads, ...inProgressBeads];
      this.postMessage({ type: "setBeads", beads: importantBeads });
    } catch (err) {
      this.setError(`Error: ${err}`);
    } finally {
      this.setLoading(false);
    }
  }
}
