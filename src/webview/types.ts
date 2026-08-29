/**
 * Webview-side type definitions
 *
 * These mirror the backend types but are used in the React webview.
 */

// Re-export types that are shared between extension and webview.
//
// These are bd's seven built-in statuses. bd also allows arbitrary user-defined
// statuses via `bd config set types.custom`/`status.custom`, which arrive as
// plain strings; the extension passes those through unstyled rather than
// dropping the bead. Treat this union as "the ones we style".
export type BeadStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "deferred"
  | "closed"
  | "pinned"
  | "hooked";

// Built-in statuses in display order (used for filter lists and board columns).
export const BUILT_IN_STATUSES: BeadStatus[] = [
  "open",
  "in_progress",
  "blocked",
  "deferred",
  "pinned",
  "hooked",
  "closed",
];

export type BeadPriority = 0 | 1 | 2 | 3 | 4;

// Dependency relationship types
export type DependencyType = "blocks" | "parent-child" | "related" | "discovered-from";

export interface BeadComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface BeadDependency {
  id: string;
  type?: string; // issue_type for coloring
  dependencyType?: DependencyType; // relationship type: blocks, parent-child, etc.
  title?: string;
  status?: BeadStatus;
  priority?: BeadPriority;
}

export interface Bead {
  id: string;
  title: string;
  description?: string;
  design?: string;
  acceptanceCriteria?: string;
  notes?: string;
  type?: string;
  priority?: BeadPriority;
  status: BeadStatus;
  assignee?: string;
  labels?: string[];
  estimatedMinutes?: number;
  externalRef?: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
  dependsOn?: BeadDependency[];
  blocks?: BeadDependency[];
  comments?: BeadComment[];
  sortOrder?: number;
}

export interface BeadsProject {
  id: string;
  name: string;
  rootPath: string;
  beadsDir: string;
  source?: "workspace" | "setting" | "env";
  dbPath?: string;
  backendStatus: "running" | "stopped" | "unknown";
  backendPid?: number;
}

export interface BeadsSummary {
  total: number;
  // Keyed by string: custom statuses are unbounded. Read with `byStatus[s] ?? 0`.
  byStatus: Record<string, number>;
  byPriority: Record<BeadPriority, number>;
  readyCount: number;
  blockedCount: number;
  inProgressCount: number;
}

export interface WebviewSettings {
  renderMarkdown: boolean;
  userId: string;
  tooltipHoverDelay: number; // 0 = disabled
}

// Messages from extension to webview
export type ExtensionMessage =
  | { type: "setViewType"; viewType: string }
  | { type: "setProject"; project: BeadsProject | null }
  | { type: "setBeads"; beads: Bead[] }
  | { type: "setBead"; bead: Bead | null }
  | { type: "setSelectedBeadId"; beadId: string | null }
  | { type: "setSummary"; summary: BeadsSummary }
  | { type: "setProjects"; projects: BeadsProject[] }
  | { type: "setLoading"; loading: boolean }
  | { type: "setError"; error: string | null }
  | { type: "setSettings"; settings: WebviewSettings }
  | { type: "refresh" }
  | { type: "showToast"; text: string };

// Messages from webview to extension
export type WebviewMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "selectProject"; projectId: string; projectRootPath?: string }
  | { type: "showProjectMenu"; projectId: string }
  | { type: "showDoltStatus" }
  | { type: "startDoltServer" }
  | { type: "stopDoltServer" }
  | { type: "openDoltLog" }
  | { type: "openProjectFolder" }
  | { type: "selectBead"; beadId: string }
  | { type: "updateBead"; beadId: string; updates: Partial<Bead> }
  | { type: "deleteBead"; beadId: string }
  | { type: "addDependency"; beadId: string; targetId: string; dependencyType: DependencyType; reverse: boolean }
  | { type: "removeDependency"; beadId: string; dependsOnId: string }
  | { type: "addComment"; beadId: string; text: string }
  | { type: "openBeadDetails"; beadId: string }
  | { type: "viewInGraph"; beadId: string }
  | { type: "copyBeadId"; beadId: string }
  | { type: "openFile"; filePath: string; line?: number };

// Human-readable labels
export const PRIORITY_LABELS: Record<BeadPriority, string> = {
  0: "critical",
  1: "high",
  2: "medium",
  3: "low",
  4: "none",
};

// Indexed by string because custom statuses are unbounded; callers fall back to
// the raw status text when a status has no label here.
export const STATUS_LABELS: Record<string, string> = {
  open: "open",
  in_progress: "in progress",
  blocked: "blocked",
  deferred: "deferred",
  closed: "closed",
  pinned: "pinned",
  hooked: "hooked",
};

export const PRIORITY_COLORS: Record<BeadPriority, string> = {
  0: "#ff4444", // Critical - red
  1: "#ff8800", // High - orange
  2: "#ffcc00", // Medium - yellow
  3: "#44aa44", // Low - green
  4: "#888888", // None - gray
};

export const PRIORITY_TEXT_COLORS: Record<BeadPriority, string> = {
  0: "#ffffff", // white on red
  1: "#ffffff", // white on orange
  2: "#1a1a1a", // dark on yellow
  3: "#ffffff", // white on green
  4: "#ffffff", // white on gray
};

// Colors for unknown/undefined priority (shown as "P?")
export const UNKNOWN_PRIORITY_COLOR = "#6b7280"; // gray
export const UNKNOWN_PRIORITY_TEXT_COLOR = "#ffffff"; // white

// Colors for the new statuses follow bd's own palette (internal/ui/styles.go,
// dark variants) so the extension reads the same as the CLI.
export const STATUS_COLORS: Record<string, string> = {
  open: "#10b981",      // green - ready to work
  in_progress: "#3b82f6", // blue
  blocked: "#ef4444",   // red
  deferred: "#6c7680",  // muted slate - on ice (bd ColorMuted)
  closed: "#6b7280",    // gray
  pinned: "#d2a6ff",    // violet (bd ColorStatusPinned)
  hooked: "#59c2ff",    // sky (bd ColorStatusHooked)
};

// Color for statuses with no entry above (user-defined via status.custom)
export const UNKNOWN_STATUS_COLOR = "#888888";

// bd's built-in issue types (internal/types/types.go), plus `merge-request`,
// which bd demoted to a custom type but which existing databases still contain.
// Custom types are unbounded, so unknown values fall back to the UNKNOWN_TYPE_*
// styling and the notdef icon rather than being a hard error.
export type BeadType =
  | "bug"
  | "feature"
  | "task"
  | "epic"
  | "chore"
  | "decision"
  | "message"
  | "molecule"
  | "gate"
  | "spike"
  | "story"
  | "milestone"
  | "event"
  | "merge-request";

export const TYPE_LABELS: Record<string, string> = {
  bug: "bug",
  feature: "feature",
  task: "task",
  epic: "epic",
  chore: "chore",
  decision: "decision",
  message: "message",
  molecule: "molecule",
  gate: "gate",
  spike: "spike",
  story: "story",
  milestone: "milestone",
  event: "event",
  "merge-request": "merge-request",
};

export const TYPE_COLORS: Record<string, string> = {
  bug: "#dc2626",           // red
  feature: "#16a34a",       // green
  task: "#eab308",          // yellow
  epic: "#9333ea",          // purple
  chore: "#2563eb",         // blue
  decision: "#ea580c",      // orange
  message: "#0891b2",       // cyan
  molecule: "#14b8a6",      // teal
  gate: "#78716c",          // stone - coordination infra
  spike: "#c026d3",         // fuchsia - investigation
  story: "#65a30d",         // lime
  milestone: "#db2777",     // pink
  event: "#64748b",         // slate - internal audit trail
  "merge-request": "#0ea5e9", // sky blue
};

export const TYPE_TEXT_COLORS: Record<string, string> = {
  bug: "#ffffff",
  feature: "#ffffff",
  task: "#1a1a1a",          // dark on yellow
  epic: "#ffffff",
  chore: "#ffffff",
  decision: "#ffffff",
  message: "#ffffff",
  molecule: "#ffffff",
  gate: "#ffffff",
  spike: "#ffffff",
  story: "#ffffff",
  milestone: "#ffffff",
  event: "#ffffff",
  "merge-request": "#ffffff",
};

// Colors for unknown/undefined type (shown with question mark icon)
export const UNKNOWN_TYPE_COLOR = "#888888"; // gray
export const UNKNOWN_TYPE_TEXT_COLOR = "#ffffff"; // white

// Sort order for type display (lower = first)
// Planning scope first (epic/milestone/story), then work items, then the
// coordination/infrastructure types bd uses internally.
export const TYPE_SORT_ORDER: Record<string, number> = {
  epic: 0,
  milestone: 1,
  story: 2,
  feature: 3,
  bug: 4,
  task: 5,
  spike: 6,
  chore: 7,
  decision: 8,
  "merge-request": 9,
  molecule: 10,
  gate: 11,
  message: 12,
  event: 13,
};

// Default sort order for unknown types (sorts after known types)
export const UNKNOWN_TYPE_SORT_ORDER = 99;

/** Get sort order for a type (handles unknown types) */
export function getTypeSortOrder(type: string | undefined): number {
  if (!type) return UNKNOWN_TYPE_SORT_ORDER;
  return TYPE_SORT_ORDER[type] ?? UNKNOWN_TYPE_SORT_ORDER;
}

/** Sort labels alphabetically (case-insensitive) */
export function sortLabels(labels: string[] | undefined): string[] {
  if (!labels) return [];
  return [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// VS Code API interface for webview
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: WebviewMessage) => void;
      getState: () => unknown;
      setState: (state: unknown) => void;
    };
  }
}

export const vscode = window.acquireVsCodeApi();

/**
 * Merges a patch into the webview's persisted state. `setState` replaces the
 * whole blob, so independent writers have to merge or they erase each other.
 */
export function patchState(patch: Record<string, unknown>): void {
  const current = (vscode.getState() as Record<string, unknown> | undefined) ?? {};
  vscode.setState({ ...current, ...patch });
}
