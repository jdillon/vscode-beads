/**
 * Webview-side type definitions
 *
 * These mirror the backend types but are used in the React webview.
 */

// Re-export types that are shared between extension and webview
export type BeadStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "blocked"
  | "done"
  | "closed"
  | "unknown";

export type BeadPriority = 0 | 1 | 2 | 3 | 4;

export interface Bead {
  id: string;
  title: string;
  description?: string;
  type?: string;
  priority?: BeadPriority;
  status: BeadStatus;
  assignee?: string;
  labels?: string[];
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
  dependsOn?: string[];
  blocks?: string[];
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

export interface GraphNode {
  id: string;
  title: string;
  status: BeadStatus;
  priority?: BeadPriority;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "depends_on" | "blocks";
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Messages from extension to webview
export type ExtensionMessage =
  | { type: "setViewType"; viewType: string }
  | { type: "setProject"; project: BeadsProject | null }
  | { type: "setBeads"; beads: Bead[] }
  | { type: "setBead"; bead: Bead | null }
  | { type: "setSummary"; summary: BeadsSummary }
  | { type: "setGraph"; graph: DependencyGraph }
  | { type: "setProjects"; projects: BeadsProject[] }
  | { type: "setLoading"; loading: boolean }
  | { type: "setError"; error: string | null }
  | { type: "refresh" };

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
  | { type: "openBeadDetails"; beadId: string }
  | { type: "viewInGraph"; beadId: string }
  | { type: "startDaemon" }
  | { type: "stopDaemon" };

// Human-readable labels
export const PRIORITY_LABELS: Record<BeadPriority, string> = {
  0: "Critical",
  1: "High",
  2: "Medium",
  3: "Low",
  4: "None",
};

export const STATUS_LABELS: Record<BeadStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  closed: "Closed",
  unknown: "Unknown",
};

export const PRIORITY_COLORS: Record<BeadPriority, string> = {
  0: "#ff4444", // Critical - red
  1: "#ff8800", // High - orange
  2: "#ffcc00", // Medium - yellow
  3: "#44aa44", // Low - green
  4: "#888888", // None - gray
};

export const STATUS_COLORS: Record<BeadStatus, string> = {
  backlog: "#6b7280",
  ready: "#10b981",
  in_progress: "#3b82f6",
  blocked: "#ef4444",
  done: "#22c55e",
  closed: "#6b7280",
  unknown: "#9ca3af",
};

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
