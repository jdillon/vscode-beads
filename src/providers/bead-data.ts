/**
 * Shared bead loading and shaping helpers.
 *
 * The single-view providers and the combined workbench panel need exactly the
 * same data, so fetching lives here rather than in one provider that the other
 * would have to duplicate - duplicated query paths are how the CLI and Dolt
 * backends drifted apart before (#79).
 */

import { BeadsBackend } from "../backend/BeadsBackend";
import {
  Bead,
  BeadPriority,
  BeadsSummary,
  BUILT_IN_STATUSES,
  issueToWebviewBead,
} from "../backend/types";
import { Logger } from "../utils/logger";

/** Number of beads the Dashboard shows per highlighted status. */
const HIGHLIGHT_LIMIT = 5;

/** Fetches the issue list, dropping beads the extension cannot represent. */
export async function loadBeads(client: BeadsBackend): Promise<Bead[]> {
  const issues = await client.list();
  return issues.map(issueToWebviewBead).filter((b): b is Bead => b !== null);
}

/** A zeroed summary, for when there is no project or backend to query. */
export function emptySummary(): BeadsSummary {
  return {
    total: 0,
    byStatus: Object.fromEntries(BUILT_IN_STATUSES.map((s) => [s, 0])),
    byPriority: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
    readyCount: 0,
    blockedCount: 0,
    inProgressCount: 0,
  };
}

/** Counts beads by status and priority for the Dashboard. */
export function summarizeBeads(beads: Bead[]): BeadsSummary {
  // Seed the built-in statuses so they report 0 rather than undefined;
  // custom statuses are added on demand as they are encountered.
  const byStatus: Record<string, number> = Object.fromEntries(
    BUILT_IN_STATUSES.map((s) => [s, 0])
  );
  const byPriority: Record<BeadPriority, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const bead of beads) {
    byStatus[bead.status] = (byStatus[bead.status] ?? 0) + 1;
    if (bead.priority !== undefined) byPriority[bead.priority]++;
  }

  return {
    total: beads.length,
    byStatus,
    byPriority,
    readyCount: byStatus.open,
    blockedCount: byStatus.blocked,
    inProgressCount: byStatus.in_progress,
  };
}

/**
 * The subset of beads the Dashboard highlights. The Dashboard view slices per
 * status itself, so this only exists to keep the sidebar's payload small.
 */
export function dashboardHighlights(beads: Bead[]): Bead[] {
  return [
    ...beads.filter((b) => b.status === "open").slice(0, HIGHLIGHT_LIMIT),
    ...beads.filter((b) => b.status === "blocked").slice(0, HIGHLIGHT_LIMIT),
    ...beads.filter((b) => b.status === "in_progress").slice(0, HIGHLIGHT_LIMIT),
  ];
}

export interface BeadDetailsResult {
  bead: Bead | null;
  /** Set when the bead could not be shown; already user-readable. */
  error: string | null;
}

/**
 * Fetches one bead with its comments. Comment failures are non-fatal - the
 * bead still renders, just without them.
 */
export async function loadBeadDetails(
  client: BeadsBackend,
  beadId: string,
  log: Logger
): Promise<BeadDetailsResult> {
  const [issue, comments] = await Promise.all([
    client.show(beadId),
    client.listComments(beadId).catch((err) => {
      log.trace(`Failed to fetch comments: ${err}`);
      return [];
    }),
  ]);

  if (!issue) {
    return { bead: null, error: "Bead not found" };
  }

  const commentsArray = comments || [];
  log.debug(`Loaded ${commentsArray.length} comments for ${beadId}`);

  const bead = issueToWebviewBead({
    ...issue,
    comments: commentsArray as Array<{ id: string; author: string; text: string; created_at: string }>,
  });

  if (!bead) {
    return { bead: null, error: "Invalid bead status" };
  }

  return { bead, error: null };
}
