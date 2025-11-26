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
import { WebviewToExtensionMessage, Bead, BeadsSummary } from "../backend/types";

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
    const backend = this.projectManager.getBackend();
    if (!backend) {
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
      // Get summary
      const summaryResult = await backend.getSummary();
      if (summaryResult.success && summaryResult.data) {
        this.postMessage({ type: "setSummary", summary: summaryResult.data });
      }

      // Get ready beads for the "What's Ready" section
      const readyResult = await backend.getReadyBeads();
      const blockedResult = await backend.getBlockedBeads();
      const allBeadsResult = await backend.listBeads();

      // Combine important beads for the dashboard
      const importantBeads: Bead[] = [];

      if (readyResult.success && readyResult.data) {
        importantBeads.push(...readyResult.data.slice(0, 5));
      }

      if (blockedResult.success && blockedResult.data) {
        importantBeads.push(...blockedResult.data.slice(0, 5));
      }

      // Add in-progress beads
      if (allBeadsResult.success && allBeadsResult.data) {
        const inProgress = allBeadsResult.data.filter(
          (b) => b.status === "in_progress"
        );
        importantBeads.push(...inProgress.slice(0, 5));
      }

      this.postMessage({ type: "setBeads", beads: importantBeads });
    } catch (err) {
      this.setError(`Error: ${err}`);
    } finally {
      this.setLoading(false);
    }
  }
}
