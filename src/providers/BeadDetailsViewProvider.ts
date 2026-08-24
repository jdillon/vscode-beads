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
      // Fetch issue and comments in parallel
      const [issue, comments] = await Promise.all([
        client.show(this.currentBeadId),
        client.listComments(this.currentBeadId).catch((err) => {
          this.log.trace(`Failed to fetch comments: ${err}`);
          return [];
        }),
      ]);

      // Check if a newer request has started - if so, discard this stale response
      if (thisRequest !== this.loadSequence) {
        this.log.debug(`Discarding stale response (request ${thisRequest}, current ${this.loadSequence})`);
        return;
      }

      const commentsArray = comments || [];
      this.log.debug(`Loaded ${commentsArray.length} comments for ${this.currentBeadId}`);
      if (issue) {
        // Merge comments into issue data
        const issueWithComments = {
          ...issue,
          comments: commentsArray as Array<{ id: string; author: string; text: string; created_at: string }>,
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

    switch (message.type) {
      case "updateBead":
        this.log.debug(`Updating bead ${message.beadId}: ${JSON.stringify(message.updates)}`);

        try {
          // Map webview field names (camelCase) to CLI/backend field names (snake_case)
          const {
            labels,
            externalRef,
            acceptanceCriteria,
            estimatedMinutes,
            ...rest
          } = message.updates;
          const updateArgs: Record<string, unknown> = {
            id: message.beadId,
            ...rest,
          };
          // CLI uses set_labels instead of labels
          if (labels !== undefined) {
            updateArgs.set_labels = labels;
          }
          // Map camelCase to snake_case
          if (externalRef !== undefined) {
            updateArgs.external_ref = externalRef;
          }
          if (acceptanceCriteria !== undefined) {
            updateArgs.acceptance_criteria = acceptanceCriteria;
          }
          if (estimatedMinutes !== undefined) {
            updateArgs.estimated_minutes = estimatedMinutes;
          }
          await client.update(updateArgs as unknown as Parameters<typeof client.update>[0]);
          // Data will refresh via mutation events
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to update bead: ${err}`);
        }
        break;

      case "addDependency":
        try {
          // When reverse=true, swap direction: target depends on current bead
          const fromId = message.reverse ? message.targetId : message.beadId;
          const toId = message.reverse ? message.beadId : message.targetId;
          await client.addDependency({
            from_id: fromId,
            to_id: toId,
            dep_type: message.dependencyType,
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
