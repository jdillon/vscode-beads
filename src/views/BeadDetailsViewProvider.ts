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
import { WebviewToExtensionMessage, Bead } from "../backend/types";

export class BeadDetailsViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsDetails";
  private currentBeadId: string | null = null;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    outputChannel: vscode.OutputChannel
  ) {
    super(extensionUri, projectManager, outputChannel);
  }

  /**
   * Show details for a specific bead
   */
  public async showBead(beadId: string): Promise<void> {
    this.currentBeadId = beadId;
    await this.loadData();
  }

  protected async loadData(): Promise<void> {
    const backend = this.projectManager.getBackend();
    if (!backend || !this.currentBeadId) {
      this.postMessage({ type: "setBead", bead: null });
      return;
    }

    this.setLoading(true);
    this.setError(null);

    try {
      const result = await backend.getBead(this.currentBeadId);

      if (result.success && result.data) {
        this.postMessage({ type: "setBead", bead: result.data });
      } else {
        this.setError(result.error || "Failed to load bead details");
        this.postMessage({ type: "setBead", bead: null });
      }
    } catch (err) {
      this.setError(`Error: ${err}`);
      this.postMessage({ type: "setBead", bead: null });
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
          `[Details] Updating bead ${message.beadId}: ${JSON.stringify(message.updates)}`
        );

        const updateResult = await backend.updateBead(
          message.beadId,
          message.updates
        );

        if (updateResult.success) {
          await this.loadData();
          // Refresh other views
          vscode.commands.executeCommand("beads.refresh");
        } else {
          vscode.window.showErrorMessage(
            `Failed to update bead: ${updateResult.error}`
          );
        }
        break;

      case "addDependency":
        const addResult = await backend.addDependency(
          message.beadId,
          message.dependsOnId
        );

        if (addResult.success) {
          await this.loadData();
          vscode.commands.executeCommand("beads.refresh");
        } else {
          vscode.window.showErrorMessage(
            `Failed to add dependency: ${addResult.error}`
          );
        }
        break;

      case "removeDependency":
        const removeResult = await backend.removeDependency(
          message.beadId,
          message.dependsOnId
        );

        if (removeResult.success) {
          await this.loadData();
          vscode.commands.executeCommand("beads.refresh");
        } else {
          vscode.window.showErrorMessage(
            `Failed to remove dependency: ${removeResult.error}`
          );
        }
        break;

      case "viewInGraph":
        vscode.commands.executeCommand("beadsGraph.focus");
        break;
    }
  }
}
