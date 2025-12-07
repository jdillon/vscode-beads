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
import { WebviewToExtensionMessage, issueToWebviewBead } from "../backend/types";
import { Logger } from "../utils/logger";

export class BeadDetailsViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsDetails";
  private currentBeadId: string | null = null;
  private currentProjectId: string | null = null;

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

    // Auto-expand the details panel
    if (this._view) {
      this._view.show(true); // true = preserve focus
    }

    await this.loadData();
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
    this.postMessage({ type: "setBead", bead: null });
    this.setLoading(false);
  }

  protected async loadData(): Promise<void> {
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
      // Fetch issue and comments in parallel
      const [issue, comments] = await Promise.all([
        client.show(this.currentBeadId),
        client.listComments(this.currentBeadId).catch((err) => {
          this.log.warn(`Failed to fetch comments: ${err}`);
          return [];
        }),
      ]);
      const commentsArray = comments || [];
      this.log.debug(`Loaded ${commentsArray.length} comments for ${this.currentBeadId}`);
      if (issue) {
        // Merge comments into issue data
        const issueWithComments = {
          ...issue,
          comments: commentsArray as Array<{ id: number; author: string; text: string; created_at: string }>,
        };
        const bead = issueToWebviewBead(issueWithComments);
        if (bead) {
          this.postMessage({ type: "setBead", bead });
        } else {
          this.setError("Invalid bead status");
          this.postMessage({ type: "setBead", bead: null });
        }
      } else {
        this.setError("Bead not found");
        this.postMessage({ type: "setBead", bead: null });
      }
    } catch (err) {
      this.setError(String(err));
      this.postMessage({ type: "setBead", bead: null });
      this.handleDaemonError("Failed to load bead details", err);
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
        this.log.debug(`Updating bead ${message.beadId}: ${JSON.stringify(message.updates)}`);

        try {
          // Map webview field names to daemon API field names
          const { labels, ...rest } = message.updates;
          const updateArgs: Record<string, unknown> = {
            id: message.beadId,
            ...rest,
          };
          // Daemon uses set_labels instead of labels
          if (labels !== undefined) {
            updateArgs.set_labels = labels;
          }
          await client.update(updateArgs as Parameters<typeof client.update>[0]);
          // Data will refresh via mutation events
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to update bead: ${err}`);
        }
        break;

      case "addDependency":
        try {
          await client.addDependency({
            from_id: message.beadId,
            to_id: message.dependsOnId,
            dep_type: "blocks",
          });
          // Data will refresh via mutation events
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to add dependency: ${err}`);
        }
        break;

      case "removeDependency":
        try {
          await client.removeDependency({
            from_id: message.beadId,
            to_id: message.dependsOnId,
          });
          // Data will refresh via mutation events
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to remove dependency: ${err}`);
        }
        break;

      case "addComment":
        try {
          // Get username from environment or default
          const author = process.env.USER || process.env.USERNAME || "vscode";
          await client.addComment({
            id: message.beadId,
            author,
            text: message.text,
          });
          // Refresh to show new comment
          await this.loadData();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to add comment: ${err}`);
        }
        break;

      case "viewInGraph":
        vscode.commands.executeCommand("beadsGraph.focus");
        break;
    }
  }
}
