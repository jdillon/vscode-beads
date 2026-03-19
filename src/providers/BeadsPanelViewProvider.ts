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
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage, Bead, issueToWebviewBead } from "../backend/types";
import { Logger } from "../utils/logger";

export class BeadsPanelViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsPanel";
  private selectedBeadId: string | null = null;
  private loadSequence = 0;

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

  protected async loadData(reason: "initial" | "projectChange" | "manualRefresh" | "background" = "background"): Promise<void> {
    const thisRequest = ++this.loadSequence;
    const client = this.projectManager.getClient();
    if (!client) {
      this.postMessage({ type: "setBeads", beads: [] });
      return;
    }

    const showLoading = reason === "initial" || reason === "projectChange";
    if (showLoading) {
      this.setLoading(true);
    }
    this.setError(null);

    try {
      const issues = await client.list();
      if (thisRequest !== this.loadSequence) {
        return;
      }
      const beads = issues.map(issueToWebviewBead).filter((b): b is Bead => b !== null);
      this.postMessage({ type: "setBeads", beads });
    } catch (err) {
      if (thisRequest !== this.loadSequence) {
        return;
      }
      this.setError(String(err));
      if (showLoading) {
        this.postMessage({ type: "setBeads", beads: [] });
      }
      this.handleBackendError("Failed to load beads", err);
    } finally {
      if (showLoading && thisRequest === this.loadSequence) {
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

    switch (message.type) {
      case "updateBead":
        try {
          await client.update({
            id: message.beadId,
            ...message.updates,
          });
          // Data will refresh via mutation events
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to update bead: ${err}`);
        }
        break;

      case "deleteBead":
        vscode.window.showWarningMessage(
          "Delete functionality is not yet implemented"
        );
        break;
    }
  }
}
