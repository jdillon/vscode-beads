/**
 * BeadsWorkbenchViewProvider - Dashboard, Issues and Details in one editor tab
 *
 * Editor-only: it is never registered as a sidebar view. Unlike the
 * single-view providers, clicking an issue is handled inside this provider
 * rather than delegated to `beads.openBeadDetails`, so navigation never leaves
 * the panel (#88).
 */

import * as vscode from "vscode";
import { BaseViewProvider, WebviewHost } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage } from "../backend/types";
import { emptySummary, loadBeadDetails, loadBeads, summarizeBeads } from "./bead-data";
import { applyBeadMutation, isBeadMutation } from "./bead-mutations";
import { Logger } from "../utils/logger";

export class BeadsWorkbenchViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsWorkbench";
  protected readonly panelViewType = "beads.workbenchEditor";
  protected readonly panelTitle = "Beads";
  private currentBeadId: string | null = null;
  private currentProjectId: string | null = null;
  private loadSequence = 0;
  private detailsSequence = 0;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("Workbench"));
  }

  protected async loadData(
    reason: "initial" | "projectChange" | "manualRefresh" | "background" = "background"
  ): Promise<void> {
    const thisRequest = ++this.loadSequence;
    const client = this.projectManager.getClient();

    // Drop the open bead when the active project changed underneath us
    const activeProjectId = this.projectManager.getActiveProject()?.id ?? null;
    if (this.currentProjectId && activeProjectId !== this.currentProjectId) {
      this.currentBeadId = null;
      this.currentProjectId = activeProjectId;
    }
    this.postMessage({ type: "setSelectedBeadId", beadId: this.currentBeadId });

    if (!client) {
      // No project/backend: clear loading so the webview shows the empty state
      // instead of spinning forever (#76)
      this.postMessage({ type: "setSummary", summary: emptySummary() });
      this.postMessage({ type: "setBeads", beads: [] });
      this.postMessage({ type: "setBead", bead: null });
      this.setLoading(false);
      return;
    }

    const showLoading = reason === "initial" || reason === "projectChange" || reason === "manualRefresh";
    if (showLoading) {
      this.postMessage({ type: "setSummary", summary: null });
      this.postMessage({ type: "setBeads", beads: [] });
      this.setLoading(true);
    }
    this.setError(null);

    try {
      // The panel shows the Issues table and the Dashboard from one list, so
      // unlike the sidebar Dashboard this sends every bead, not highlights.
      const beads = await loadBeads(client);
      if (thisRequest !== this.loadSequence) {
        return;
      }
      this.postMessage({ type: "setSummary", summary: summarizeBeads(beads) });
      this.postMessage({ type: "setBeads", beads });
    } catch (err) {
      if (thisRequest !== this.loadSequence) {
        return;
      }
      this.setError(String(err));
      this.handleBackendError("Failed to load beads", err);
    } finally {
      if (thisRequest === this.loadSequence) {
        this.setLoading(false);
      }
    }

    // Keep the Details section in step with the list
    await this.loadDetails();
  }

  /**
   * Opens a bead in this panel's Details section. No sidebar view is revealed
   * and no editor tab is opened - the click stays where the user is.
   */
  private async showBead(beadId: string): Promise<void> {
    this.currentBeadId = beadId;
    this.currentProjectId = this.projectManager.getActiveProject()?.id ?? null;
    this.postMessage({ type: "setSelectedBeadId", beadId });
    await this.loadDetails();
  }

  private async loadDetails(): Promise<void> {
    const thisRequest = ++this.detailsSequence;
    const client = this.projectManager.getClient();

    if (!client || !this.currentBeadId) {
      this.postMessage({ type: "setBead", bead: null });
      return;
    }

    try {
      const { bead, error } = await loadBeadDetails(client, this.currentBeadId, this.log);
      if (thisRequest !== this.detailsSequence) {
        this.log.debug(`Discarding stale details response (request ${thisRequest}, current ${this.detailsSequence})`);
        return;
      }
      if (error) {
        this.setError(error);
      }
      this.postMessage({ type: "setBead", bead });
    } catch (err) {
      if (thisRequest !== this.detailsSequence) {
        return;
      }
      this.setError(String(err));
      this.postMessage({ type: "setBead", bead: null });
      this.handleBackendError("Failed to load bead details", err);
    }
  }

  protected async handleMessage(
    message: WebviewToExtensionMessage,
    host?: WebviewHost
  ): Promise<void> {
    // Intercept bead selection before the base class turns it into the global
    // `beads.openBeadDetails` command, which would pull focus out of the panel.
    if (message.type === "openBeadDetails" || message.type === "selectBead") {
      await this.showBead(message.beadId);
      return;
    }

    await super.handleMessage(message, host);
  }

  protected async handleCustomMessage(
    message: WebviewToExtensionMessage
  ): Promise<void> {
    const client = this.projectManager.getClient();
    if (!client) {
      return;
    }

    if (isBeadMutation(message)) {
      if (await applyBeadMutation(client, message, this.log)) {
        // Comments do not come back through mutation events
        await this.loadDetails();
      }
      return;
    }

    if (message.type === "deleteBead") {
      vscode.window.showWarningMessage(
        "Delete functionality is not yet implemented"
      );
    }
  }
}
