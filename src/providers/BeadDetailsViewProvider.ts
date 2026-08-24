/**
 * BeadDetailsViewProvider - Provides the Bead Details view
 *
 * Features:
 * - Full view/edit of a single bead
 * - Editable fields: title, description, status, priority, type, labels, assignee
 * - Dependency management
 * - View in graph button
 */

import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage } from "../backend/types";
import { loadBeadDetails } from "./bead-data";
import { applyBeadMutation, isBeadMutation } from "./bead-mutations";
import { Logger } from "../utils/logger";

export class BeadDetailsViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsDetails";
  protected readonly panelViewType = "beads.detailsEditor";
  protected readonly panelTitle = "Beads Details";
  private currentBeadId: string | null = null;
  private currentProjectId: string | null = null;
  private loadSequence = 0; // Tracks request order to prevent stale responses

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("Details"));
  }

  /**
   * Show details for a specific bead
   */
  public async showBead(beadId: string): Promise<void> {
    this.currentBeadId = beadId;
    this.currentProjectId = this.projectManager.getActiveProject()?.id || null;

    // Update context for conditional menu items
    vscode.commands.executeCommand("setContext", "beads.hasSelectedBead", true);

    // Auto-expand the details view - the editor tab if one is open, otherwise
    // the sidebar view.
    this.revealHost();
    this.setEditorPanelTitle(beadId);

    await this.loadData();
  }

  /**
   * Title the editor tab with the bead already being viewed, for tabs opened
   * (or restored) after a selection was made.
   */
  public adoptEditorPanel(panel: vscode.WebviewPanel): void {
    super.adoptEditorPanel(panel);
    if (this.currentBeadId) {
      this.setEditorPanelTitle(this.currentBeadId);
    }
  }

  /**
   * Get the currently displayed bead ID
   */
  public getCurrentBeadId(): string | null {
    return this.currentBeadId;
  }

  /**
   * Clear the current bead (e.g., when switching projects)
   */
  public clearBead(): void {
    this.currentBeadId = null;
    vscode.commands.executeCommand("setContext", "beads.hasSelectedBead", false);
    this.setEditorPanelTitle(this.panelTitle);
    this.postMessage({ type: "setBead", bead: null });
    this.setLoading(false);
  }

  protected async loadData(_reason: "initial" | "projectChange" | "manualRefresh" | "background" = "background"): Promise<void> {
    // Increment sequence to track this request - prevents stale responses from
    // overwriting newer data when multiple refreshes occur in rapid succession
    const thisRequest = ++this.loadSequence;

    const client = this.projectManager.getClient();
    const activeProjectId = this.projectManager.getActiveProject()?.id;

    // Clear selection if project changed
    if (this.currentProjectId && activeProjectId !== this.currentProjectId) {
      this.currentBeadId = null;
      this.currentProjectId = activeProjectId || null;
    }

    if (!client || !this.currentBeadId) {
      this.postMessage({ type: "setBead", bead: null });
      this.setLoading(false);
      return;
    }

    this.setLoading(true);
    this.setError(null);

    try {
      const { bead, error } = await loadBeadDetails(client, this.currentBeadId, this.log);

      // Check if a newer request has started - if so, discard this stale response
      if (thisRequest !== this.loadSequence) {
        this.log.debug(`Discarding stale response (request ${thisRequest}, current ${this.loadSequence})`);
        return;
      }

      if (error) {
        this.setError(error);
      }
      this.postMessage({ type: "setBead", bead });
    } catch (err) {
      // Only handle error if this is still the current request
      if (thisRequest !== this.loadSequence) {
        return;
      }
      this.setError(String(err));
      this.postMessage({ type: "setBead", bead: null });
      this.handleBackendError("Failed to load bead details", err);
    } finally {
      // Only update loading state if this is still the current request
      if (thisRequest === this.loadSequence) {
        this.setLoading(false);
      }
    }
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
        await this.loadData();
      }
      return;
    }

    if (message.type === "viewInGraph") {
      vscode.commands.executeCommand("beadsGraph.focus");
    }
  }
}
