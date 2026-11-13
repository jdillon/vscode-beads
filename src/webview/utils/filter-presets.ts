import type { Bead, BeadStatus } from "../types";

export interface FilterPreset {
  id: string;
  label: string;
  statuses: BeadStatus[];
  /** Also match beads with active dependency blockers, whatever their stored status. */
  includeBlockedBy?: boolean;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "all", label: "All", statuses: [] },
  { id: "not-closed", label: "Not Closed", statuses: ["open", "in_progress", "blocked", "deferred", "pinned", "hooked"] },
  { id: "active", label: "Active", statuses: ["in_progress", "blocked", "hooked"] },
  // No status filter: the blockedBy filter already matches status "blocked" (an OR across columns).
  { id: "blocked", label: "Blocked", statuses: [], includeBlockedBy: true },
  { id: "closed", label: "Closed", statuses: ["closed"] },
];

export const DEFAULT_PRESET_ID = "not-closed";

export const presetStatuses = (id: string): BeadStatus[] =>
  FILTER_PRESETS.find((p) => p.id === id)?.statuses ?? [];

/** Blocked preset: stored status is blocked, or `bd blocked` reported active blockers. */
export const isBlockedPresetMatch = (bead: Pick<Bead, "status" | "blockedBy">): boolean =>
  bead.status === "blocked" || (bead.blockedBy?.length ?? 0) > 0;
