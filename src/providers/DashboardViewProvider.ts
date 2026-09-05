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
import { BaseViewProvider, WebviewHost } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { Bead, BeadsSummary, issueToWebviewBead, BeadPriority, BUILT_IN_STATUSES } from "../backend/types";
import { Logger } from "../utils/logger";

export class DashboardViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsDashboard";
  protected readonly panelViewType = "beads.dashboardEditor";
  protected readonly panelTitle = "Beads Dashboard";
  private static readonly MIN_LOADING_MS = 500;
  private static readonly SNAPSHOT_TTL_MS = 1000;
  private loadSequence = 0;
  private readonly targetLoadTokens = new WeakMap<WebviewHost, symbol>();
  private snapshot: {
    projectId: string | null;
    summary: BeadsSummary;
    beads: Bead[];
    loadedAt: number;
  } | null = null;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("Dashboard"));
  }

  protected async loadData(
    reason: "initial" | "projectChange" | "manualRefresh" | "background" = "background",
    target?: WebviewHost
  ): Promise<void> {
    const projectId = this.projectManager.getActiveProject()?.id ?? null;
    if (reason === "initial" && target && this.snapshot?.projectId === projectId) {
      this.postMessage({ type: "setSummary", summary: this.snapshot.summary }, target);
      this.postMessage({ type: "setBeads", beads: this.snapshot.beads }, target);
      this.setError(null, target);
      this.setLoading(false, target);
      if (Date.now() - this.snapshot.loadedAt > DashboardViewProvider.SNAPSHOT_TTL_MS) {
        await this.loadData("background");
      }
      return;
    }

    const targetLoadToken = target ? Symbol() : null;
    if (target && targetLoadToken) {
      this.targetLoadTokens.set(target, targetLoadToken);
    }
    const thisRequest = target ? this.loadSequence : ++this.loadSequence;
    const isCurrentRequest = () =>
      thisRequest === this.loadSequence &&
      (!target || this.targetLoadTokens.get(target) === targetLoadToken);
    const client = this.projectManager.getClient();
    if (!client) {
      const summary: BeadsSummary = {
        total: 0,
        byStatus: Object.fromEntries(BUILT_IN_STATUSES.map((s) => [s, 0])),
        byPriority: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        readyCount: 0,
        blockedCount: 0,
        inProgressCount: 0,
      };
      this.snapshot = { projectId, summary, beads: [], loadedAt: Date.now() };
      this.postMessage({
        type: "setSummary",
        summary,
      }, target);
      // No project/backend: clear loading so the webview shows the empty state
      // instead of spinning forever (#76)
      this.postMessage({ type: "setBeads", beads: [] }, target);
      this.setLoading(false, target);
      return;
    }

    const showLoading = reason === "initial" || reason === "projectChange" || reason === "manualRefresh";
    const loadingStartedAt = showLoading ? Date.now() : 0;
    if (showLoading) {
      this.postMessage({ type: "setSummary", summary: null }, target);
      this.postMessage({ type: "setBeads", beads: [] }, target);
      this.setLoading(true, target);
    }
    this.setError(null, target);

    try {
      const issues = await client.list();
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (!isCurrentRequest() ||
          (this.projectManager.getActiveProject()?.id ?? null) !== projectId) {
        return;
      }

      const beads = issues.map(issueToWebviewBead).filter((b): b is Bead => b !== null);
      // Seed the built-in statuses so they report 0 rather than undefined;
      // custom statuses are added on demand as they are encountered.
      const byStatus: Record<string, number> = Object.fromEntries(
        BUILT_IN_STATUSES.map((s) => [s, 0])
      );
      const byPriority: Record<BeadPriority, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

      for (const bead of beads) {
        byStatus[bead.status] = (byStatus[bead.status] ?? 0) + 1;
        if (bead.priority !== undefined) byPriority[bead.priority]++;
      }

      const summary: BeadsSummary = {
        total: beads.length,
        byStatus,
        byPriority,
        readyCount: byStatus.open,
        blockedCount: byStatus.blocked,
        inProgressCount: byStatus.in_progress,
      };

      const openBeads = beads.filter((b) => b.status === "open").slice(0, 5);
      const blockedBeads = beads.filter((b) => b.status === "blocked").slice(0, 5);
      const inProgressBeads = beads.filter((b) => b.status === "in_progress").slice(0, 5);
      const dashboardBeads = [...openBeads, ...blockedBeads, ...inProgressBeads];
      this.snapshot = { projectId, summary, beads: dashboardBeads, loadedAt: Date.now() };
      this.postMessage({ type: "setSummary", summary }, target);
      this.postMessage({ type: "setBeads", beads: dashboardBeads }, target);
      this.setLoading(false, target);
    } catch (err) {
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (!isCurrentRequest() ||
          (this.projectManager.getActiveProject()?.id ?? null) !== projectId) {
        return;
      }
      this.setError(String(err), target);
      this.handleBackendError("Failed to load dashboard", err);
    } finally {
      if (isCurrentRequest()) {
        this.setLoading(false, target);
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
