/**
 * KanbanViewProvider - Provides the Kanban Board view
 *
 * Features:
 * - Columns for each status
 * - Drag-and-drop cards between columns
 * - Status updates via daemon RPC
 * - Priority and label badges
 */

import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage, issueToWebviewBead } from "../backend/types";

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
    const client = this.projectManager.getClient();
    if (!client) {
      this.postMessage({ type: "setBeads", beads: [] });
      return;
    }

    this.setLoading(true);
    this.setError(null);

    try {
      const issues = await client.list();
      const beads = issues.map(issueToWebviewBead);
      this.postMessage({ type: "setBeads", beads });
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
    const client = this.projectManager.getClient();
    if (!client) {
      return;
    }

    switch (message.type) {
      case "updateBead":
        this.outputChannel.appendLine(
          `[Kanban] Updating bead ${message.beadId}: ${JSON.stringify(message.updates)}`
        );

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
    }
  }
}
