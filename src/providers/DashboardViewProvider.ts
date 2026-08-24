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
import { dashboardHighlights, emptySummary, loadBeads, summarizeBeads } from "./bead-data";
import { Logger } from "../utils/logger";

export class DashboardViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsDashboard";
  protected readonly panelViewType = "beads.dashboardEditor";
  protected readonly panelTitle = "Beads Dashboard";
  private static readonly MIN_LOADING_MS = 500;
  private loadSequence = 0;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("Dashboard"));
  }

  protected async loadData(reason: "initial" | "projectChange" | "manualRefresh" | "background" = "background"): Promise<void> {
    const thisRequest = ++this.loadSequence;
    const client = this.projectManager.getClient();
    if (!client) {
      this.postMessage({ type: "setSummary", summary: emptySummary() });
      // No project/backend: clear loading so the webview shows the empty state
      // instead of spinning forever (#76)
      this.postMessage({ type: "setBeads", beads: [] });
      this.setLoading(false);
      return;
    }

    const showLoading = reason === "initial" || reason === "projectChange" || reason === "manualRefresh";
    const loadingStartedAt = showLoading ? Date.now() : 0;
    if (showLoading) {
      this.postMessage({ type: "setSummary", summary: null });
      this.postMessage({ type: "setBeads", beads: [] });
      this.setLoading(true);
    }
    this.setError(null);

    try {
      const beads = await loadBeads(client);
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (thisRequest !== this.loadSequence) {
        return;
      }

      this.postMessage({ type: "setSummary", summary: summarizeBeads(beads) });
      this.postMessage({ type: "setBeads", beads: dashboardHighlights(beads) });
      this.setLoading(false);
    } catch (err) {
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (thisRequest !== this.loadSequence) {
        return;
      }
      this.setError(String(err));
      this.handleBackendError("Failed to load dashboard", err);
    } finally {
      if (thisRequest === this.loadSequence) {
        this.setLoading(false);
      }
    }
  }

  private async waitForMinimumLoading(startedAt: number): Promise<void> {
    const remaining = DashboardViewProvider.MIN_LOADING_MS - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
}
