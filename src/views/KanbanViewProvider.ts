/**
 * KanbanViewProvider - Provides the Kanban Board view
 *
 * Features:
 * - Columns for each status
 * - Drag-and-drop cards between columns
 * - Status updates via bd CLI
 * - Priority and label badges
 */

import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage, Bead } from "../backend/types";

export class KanbanViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsKanban";

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
        this.outputChannel.appendLine(
          `[Kanban] Updating bead ${message.beadId}: ${JSON.stringify(message.updates)}`
        );

        const result = await backend.updateBead(
          message.beadId,
          message.updates
        );

        if (result.success) {
          await this.loadData();
          // Also refresh other views
          vscode.commands.executeCommand("beads.refresh");
        } else {
          vscode.window.showErrorMessage(
            `Failed to update bead: ${result.error}`
          );
        }
        break;
    }
  }
}
