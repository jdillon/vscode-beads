/**
 * Webview-side type definitions
 *
 * These mirror the backend types but are used in the React webview.
 */

// Re-export types that are shared between extension and webview
// These match beads canonical statuses: open, in_progress, blocked, closed
export type BeadStatus = "open" | "in_progress" | "blocked" | "closed";

export type BeadPriority = 0 | 1 | 2 | 3 | 4;

// Dependency relationship types
export type DependencyType = "blocks" | "parent-child" | "related" | "discovered-from";

export interface BeadComment {
  id: number;
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
  dbPath?: string;
  daemonStatus: "running" | "stopped" | "unknown";
  daemonPid?: number;
}

export interface BeadsSummary {
  total: number;
  byStatus: Record<BeadStatus, number>;
  byPriority: Record<BeadPriority, number>;
  readyCount: number;
  blockedCount: number;
  inProgressCount: number;
}

export interface WebviewSettings {
  renderMarkdown: boolean;
  userId: string;
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
  | { type: "selectProject"; projectId: string }
  | { type: "selectBead"; beadId: string }
  | { type: "updateBead"; beadId: string; updates: Partial<Bead> }
  | { type: "createBead"; data: Partial<Bead> }
  | { type: "deleteBead"; beadId: string }
  | { type: "addDependency"; beadId: string; dependsOnId: string }
  | { type: "removeDependency"; beadId: string; dependsOnId: string }
  | { type: "addComment"; beadId: string; text: string }
  | { type: "openBeadDetails"; beadId: string }
  | { type: "viewInGraph"; beadId: string }
  | { type: "startDaemon" }
  | { type: "stopDaemon" }
  | { type: "copyBeadId"; beadId: string };

// Human-readable labels
export const PRIORITY_LABELS: Record<BeadPriority, string> = {
  0: "critical",
  1: "high",
  2: "medium",
  3: "low",
  4: "none",
};

export const STATUS_LABELS: Record<BeadStatus, string> = {
  open: "open",
  in_progress: "in progress",
  blocked: "blocked",
  closed: "closed",
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

export const STATUS_COLORS: Record<BeadStatus, string> = {
  open: "#10b981",      // green - ready to work
  in_progress: "#3b82f6", // blue
  blocked: "#ef4444",   // red
  closed: "#6b7280",    // gray
};

export type BeadType = "bug" | "feature" | "task" | "epic" | "chore";

export const TYPE_LABELS: Record<BeadType, string> = {
  bug: "bug",
  feature: "feature",
  task: "task",
  epic: "epic",
  chore: "chore",
};

export const TYPE_COLORS: Record<BeadType, string> = {
  bug: "#dc2626",      // red
  feature: "#16a34a",  // green
  task: "#eab308",     // yellow
  epic: "#9333ea",     // purple
  chore: "#2563eb",    // blue
};

export const TYPE_TEXT_COLORS: Record<BeadType, string> = {
  bug: "#ffffff",
  feature: "#ffffff",
  task: "#1a1a1a",     // dark on yellow
  epic: "#ffffff",
  chore: "#ffffff",
};

// Colors for unknown/undefined type (shown with question mark icon)
export const UNKNOWN_TYPE_COLOR = "#888888"; // gray
export const UNKNOWN_TYPE_TEXT_COLOR = "#ffffff"; // white

// Sort order for type display (lower = first)
// Epic first, then feature (story), bug, task, chore, then newer workflow types
export const TYPE_SORT_ORDER: Record<string, number> = {
  epic: 0,
  feature: 1,
  bug: 2,
  task: 3,
  chore: 4,
  "merge-request": 5,
  molecule: 6,
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
