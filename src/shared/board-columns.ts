/** Serializable filters shared by the issue table and board. */
export interface FilterableBead {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: number;
  type?: string;
  assignee?: string;
  labels?: string[];
  isReady?: boolean;
  blockedBy?: string[];
}

export interface BeadFilter {
  status?: string[];
  priority?: number[];
  type?: string[];
  assignee?: string[];
  labels?: string[];
  isReady?: boolean;
  hasBlockers?: boolean;
  query?: string;
}

export interface BoardColumn {
  id: string;
  title: string;
  color: string;
  filter: BeadFilter;
  /** Only an explicit stored-status action makes this column a drop target. */
  dropStatus?: string;
}

export interface BoardColumnsConfig {
  version: 1;
  columns: BoardColumn[];
}

export function matchesBead(bead: FilterableBead, filter: BeadFilter): boolean {
  if (filter.status?.length && !filter.status.includes(bead.status)) return false;
  if (filter.priority?.length && (bead.priority === undefined || !filter.priority.includes(bead.priority))) return false;
  if (filter.type?.length && (!bead.type || !filter.type.includes(bead.type))) return false;
  if (filter.assignee?.length && !filter.assignee.some((value) =>
    value === "__unassigned__" ? !bead.assignee : value === bead.assignee)) return false;
  if (filter.labels?.length && !filter.labels.some((value) =>
    value === "__unlabeled__" ? !bead.labels?.length : bead.labels?.includes(value))) return false;
  if (filter.isReady !== undefined && bead.isReady !== filter.isReady) return false;
  if (filter.hasBlockers !== undefined &&
      (bead.blockedBy === undefined || (bead.blockedBy.length > 0) !== filter.hasBlockers)) return false;
  if (filter.query) {
    const search = filter.query.toLowerCase();
    if (![bead.id, bead.title, bead.description ?? "", ...(bead.labels ?? [])]
      .some((value) => value.toLowerCase().includes(search))) return false;
  }
  return true;
}

export function placeBead(bead: FilterableBead, columns: BoardColumn[]): string {
  return columns.find((column) => matchesBead(bead, column.filter))?.id ?? "__other__";
}

/** A drop is offered only when its status action would put the card there. */
export function canDropBead(bead: FilterableBead, column: BoardColumn, columns: BoardColumn[]): boolean {
  return !!column.dropStatus && bead.status !== column.dropStatus &&
    placeBead({ ...bead, status: column.dropStatus }, columns) === column.id;
}

/** Validate messages and persisted data at the extension boundary. */
export function parseBoardColumns(value: unknown): BoardColumnsConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Record<string, unknown>;
  if (config.version !== 1 || !Array.isArray(config.columns) || config.columns.length < 1 || config.columns.length > 24) return null;
  const seen = new Set<string>();
  for (const raw of config.columns) {
    if (!raw || typeof raw !== "object") return null;
    const column = raw as Record<string, unknown>;
    if (typeof column.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(column.id) ||
        column.id === "__other__" || seen.has(column.id) ||
        typeof column.title !== "string" || !column.title.trim() || column.title.length > 80 ||
        typeof column.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(column.color) ||
        (column.dropStatus !== undefined && (typeof column.dropStatus !== "string" || !column.dropStatus || column.dropStatus.length > 80))) return null;
    seen.add(column.id);
    if (!column.filter || typeof column.filter !== "object" || Array.isArray(column.filter)) return null;
    const filter = column.filter as Record<string, unknown>;
    if (Object.keys(filter).some((key) => !["status", "priority", "type", "assignee", "labels", "isReady", "hasBlockers", "query"].includes(key))) return null;
    for (const key of ["status", "type", "assignee", "labels"]) {
      if (filter[key] !== undefined && (!Array.isArray(filter[key]) ||
        (filter[key] as unknown[]).length > 50 ||
        !(filter[key] as unknown[]).every((item) => typeof item === "string" && item.length > 0 && item.length <= 120))) return null;
    }
    if (filter.priority !== undefined && (!Array.isArray(filter.priority) ||
      filter.priority.length > 5 || !filter.priority.every((item: unknown) => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 4))) return null;
    if (filter.isReady !== undefined && typeof filter.isReady !== "boolean") return null;
    if (filter.hasBlockers !== undefined && typeof filter.hasBlockers !== "boolean") return null;
    if (filter.query !== undefined && (typeof filter.query !== "string" || filter.query.length > 200)) return null;
  }
  return value as BoardColumnsConfig;
}
