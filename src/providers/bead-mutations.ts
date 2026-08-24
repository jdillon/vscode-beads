/**
 * Shared bead mutation handling.
 *
 * Edits arrive from the Issues table, the Details panel and the combined
 * workbench panel. Routing them all through one place keeps field mapping
 * consistent no matter which surface the edit came from.
 */

import * as vscode from "vscode";
import { BeadsBackend } from "../backend/BeadsBackend";
import { Bead, WebviewToExtensionMessage } from "../backend/types";
import { Logger } from "../utils/logger";

const MUTATION_TYPES = ["updateBead", "addDependency", "removeDependency", "addComment"] as const;

export type BeadMutationMessage = Extract<
  WebviewToExtensionMessage,
  { type: (typeof MUTATION_TYPES)[number] }
>;

export function isBeadMutation(
  message: WebviewToExtensionMessage
): message is BeadMutationMessage {
  return (MUTATION_TYPES as readonly string[]).includes(message.type);
}

/**
 * Applies one mutation, reporting failures to the user.
 *
 * Returns true when the caller should reload the open bead: most edits come
 * back through the backend's mutation events, but comments do not.
 */
export async function applyBeadMutation(
  client: BeadsBackend,
  message: BeadMutationMessage,
  log: Logger
): Promise<boolean> {
  switch (message.type) {
    case "updateBead":
      log.debug(`Updating bead ${message.beadId}: ${JSON.stringify(message.updates)}`);
      try {
        await client.update(toUpdateArgs(message.beadId, message.updates));
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to update bead: ${err}`);
      }
      return false;

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
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to add dependency: ${err}`);
      }
      return false;

    case "removeDependency":
      try {
        await client.removeDependency({
          from_id: message.beadId,
          to_id: message.dependsOnId,
        });
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to remove dependency: ${err}`);
      }
      return false;

    case "addComment":
      try {
        // Get username from environment or default
        const author = process.env.USER || process.env.USERNAME || "vscode";
        await client.addComment({
          id: message.beadId,
          author,
          text: message.text,
        });
        return true;
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to add comment: ${err}`);
        return false;
      }
  }
}

/**
 * Maps webview field names (camelCase) to CLI/backend field names (snake_case).
 */
function toUpdateArgs(
  beadId: string,
  updates: Partial<Bead>
): Parameters<BeadsBackend["update"]>[0] {
  const { labels, externalRef, acceptanceCriteria, estimatedMinutes, ...rest } = updates;
  const updateArgs: Record<string, unknown> = { id: beadId, ...rest };

  // CLI uses set_labels instead of labels
  if (labels !== undefined) {
    updateArgs.set_labels = labels;
  }
  if (externalRef !== undefined) {
    updateArgs.external_ref = externalRef;
  }
  if (acceptanceCriteria !== undefined) {
    updateArgs.acceptance_criteria = acceptanceCriteria;
  }
  if (estimatedMinutes !== undefined) {
    updateArgs.estimated_minutes = estimatedMinutes;
  }

  return updateArgs as unknown as Parameters<BeadsBackend["update"]>[0];
}
