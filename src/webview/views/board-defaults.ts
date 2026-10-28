import { BoardColumn } from "../../shared/board-columns";
import { Bead, BeadStatus, BUILT_IN_STATUSES, STATUS_COLORS, STATUS_LABELS, UNKNOWN_STATUS_COLOR } from "../types";

const CORE_COLUMNS: BeadStatus[] = ["open", "in_progress", "blocked", "closed"];

export function defaultBoardColumns(beads: Bead[]): BoardColumn[] {
  const present = new Set(beads.map((bead) => bead.status));
  const builtIn = BUILT_IN_STATUSES.filter((status) => CORE_COLUMNS.includes(status) || present.has(status));
  const custom = [...present].filter((status) => !BUILT_IN_STATUSES.includes(status as BeadStatus)).sort();
  return [...builtIn, ...custom].map((status) => ({
    id: BUILT_IN_STATUSES.includes(status as BeadStatus) ? `status_${status}` : `custom_${custom.indexOf(status)}`,
    title: STATUS_LABELS[status] ?? status,
    color: STATUS_COLORS[status] ?? UNKNOWN_STATUS_COLOR,
    filter: { status: [status] },
    dropStatus: status,
  }));
}
