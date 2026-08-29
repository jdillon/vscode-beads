/**
 * BeadsPanelViewProvider - Provides the main Beads Panel view
 *
 * Features:
 * - Table/list view of all beads
 * - Column sorting
 * - Filtering by status, priority, labels, type
 * - Text search
 * - Click to open details
 */

import * as vscode from "vscode";
import { BaseViewProvider, WebviewHost } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage, Bead, issueToWebviewBead } from "../backend/types";
import { Logger } from "../utils/logger";
import { buildUpdateArgs } from "./bead-updates";

export class BeadsPanelViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsPanel";
  protected readonly panelViewType = "beads.issuesEditor";
  protected readonly panelTitle = "Beads Issues";
  private static readonly MIN_LOADING_MS = 500;
  private static readonly SNAPSHOT_TTL_MS = 1000;
  private selectedBeadId: string | null = null;
  private loadSequence = 0;
  private snapshot: { projectId: string | null; beads: Bead[]; loadedAt: number } | null = null;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("Panel"));
  }

  /**
   * Set the selected bead ID and notify webview
   */
  public setSelectedBead(beadId: string | null): void {
    this.selectedBeadId = beadId;
    this.postMessage({ type: "setSelectedBeadId", beadId });
  }

  protected seedView(target?: WebviewHost): void {
    this.postMessage({ type: "setSelectedBeadId", beadId: this.selectedBeadId }, target);
  }

  protected async loadData(
    reason: "initial" | "projectChange" | "manualRefresh" | "background" = "background",
    target?: WebviewHost
  ): Promise<void> {
    const projectId = this.projectManager.getActiveProject()?.id ?? null;
    if (reason === "initial" && target && this.snapshot?.projectId === projectId) {
      this.postMessage({ type: "setBeads", beads: this.snapshot.beads }, target);
      this.setError(null, target);
      this.setLoading(false, target);
      if (Date.now() - this.snapshot.loadedAt > BeadsPanelViewProvider.SNAPSHOT_TTL_MS) {
        await this.loadData("background");
      }
      return;
    }

    const thisRequest = target ? this.loadSequence : ++this.loadSequence;
    const client = this.projectManager.getClient();
    if (!client) {
      this.snapshot = { projectId, beads: [], loadedAt: Date.now() };
      // No project/backend: clear loading so the webview shows the empty state
      // instead of spinning forever (#76)
      this.postMessage({ type: "setBeads", beads: [] }, target);
      this.setLoading(false, target);
      return;
    }

    const showLoading = reason === "initial" || reason === "projectChange" || reason === "manualRefresh";
    const loadingStartedAt = showLoading ? Date.now() : 0;
    if (showLoading) {
      this.postMessage({ type: "setBeads", beads: [] }, target);
      this.setLoading(true, target);
    }
    this.setError(null, target);

    try {
      const issues = await client.list();
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (thisRequest !== this.loadSequence ||
          (this.projectManager.getActiveProject()?.id ?? null) !== projectId) {
        return;
      }
      const beads = issues.map(issueToWebviewBead).filter((b): b is Bead => b !== null);
      this.snapshot = { projectId, beads, loadedAt: Date.now() };
      this.postMessage({ type: "setBeads", beads }, target);
      this.setLoading(false, target);
    } catch (err) {
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (thisRequest !== this.loadSequence ||
          (this.projectManager.getActiveProject()?.id ?? null) !== projectId) {
        return;
      }
      this.setError(String(err), target);
      if (showLoading) {
        this.postMessage({ type: "setBeads", beads: [] }, target);
      }
      this.handleBackendError("Failed to load beads", err);
    } finally {
      if (thisRequest === this.loadSequence) {
        this.setLoading(false, target);
      }
    }
  }

  private async waitForMinimumLoading(startedAt: number): Promise<void> {
    const remaining = BeadsPanelViewProvider.MIN_LOADING_MS - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  protected async handleCustomMessage(
    message: WebviewToExtensionMessage
  ): Promise<void> {
    const client = this.projectManager.getClient();
    if (!client) {
      return;
    }

    switch (message.type) {
      case "updateBead": {
        const result = buildUpdateArgs(message.beadId, message.updates);
        if ("error" in result) {
          this.log.warn(`Ignoring malformed bead update: ${result.error}`);
          return;
        }
        if (result.dropped.length > 0) {
          this.log.warn(`Ignoring unsupported update fields: ${result.dropped.join(", ")}`);
        }

        try {
          await client.update(result.args);
          // Data will refresh via mutation events
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to update bead: ${err}`);
        }
        break;
      }

      case "deleteBead":
        vscode.window.showWarningMessage(
          "Delete functionality is not yet implemented"
        );
        break;
    }
  }
}
