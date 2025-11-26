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
import { WebviewToExtensionMessage, Bead } from "../backend/types";

export class BeadsPanelViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsPanel";

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
      this.postMessage({ type: "setBeads", beads: [] });
      return;
    }

    this.setLoading(true);
    this.setError(null);

    try {
      const result = await backend.listBeads();

      if (result.success && result.data) {
        this.postMessage({ type: "setBeads", beads: result.data });
      } else {
        this.setError(result.error || "Failed to load beads");
        this.postMessage({ type: "setBeads", beads: [] });
      }
    } catch (err) {
      this.setError(`Error: ${err}`);
      this.postMessage({ type: "setBeads", beads: [] });
    } finally {
      this.setLoading(false);
    }
  }

  protected async handleCustomMessage(
    message: WebviewToExtensionMessage
  ): Promise<void> {
    const backend = this.projectManager.getBackend();
    if (!backend) {
      return;
    }

    switch (message.type) {
      case "updateBead":
        const updateResult = await backend.updateBead(
          message.beadId,
          message.updates
        );
        if (updateResult.success) {
          await this.loadData();
        } else {
          vscode.window.showErrorMessage(
            `Failed to update bead: ${updateResult.error}`
          );
        }
        break;

      case "deleteBead":
        // Note: Beads CLI might not have a delete command
        vscode.window.showWarningMessage(
          "Delete functionality is not available via CLI"
        );
        break;
    }
  }
}
