/**
 * Beads - TypeScript Data Models
 *
 * These types mirror the Beads issue schema as exposed by `bd list --json` and `bd show --json`.
 * The extension normalizes CLI output into these internal types.
 *
 * Status Mapping (beads canonical statuses):
 * - "open" -> "open"
 * - "in_progress" / "in-progress" / "active" -> "in_progress"
 * - "blocked" -> "blocked"
 * - "closed" / "done" / "completed" / "cancelled" -> "closed"
 * - anything else -> "unknown"
 *
 * Priority Mapping:
 * - Beads uses 0-4 where 0 is highest priority (P0/Critical)
 * - 0: Critical/P0, 1: High/P1, 2: Medium/P2, 3: Low/P3, 4: None/P4
 */

// Bead status values used in the UI
// Matches beads canonical statuses: open, in_progress, blocked, closed
export type BeadStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "closed"
  | "unknown";

// Priority levels (0 = highest/critical, 4 = lowest/none)
export type BeadPriority = 0 | 1 | 2 | 3 | 4;

// Human-readable priority labels
export const PRIORITY_LABELS: Record<BeadPriority, string> = {
  0: "Critical",
  1: "High",
  2: "Medium",
  3: "Low",
  4: "None",
};

// Status display labels for the UI
export const STATUS_LABELS: Record<BeadStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  closed: "Closed",
  unknown: "Unknown",
};

// Core Bead interface representing a single issue
export interface Bead {
  id: string; // e.g., "bd-a1b2", including dotted child IDs
  title: string;
  description?: string;
  design?: string; // Design notes
  acceptanceCriteria?: string; // Acceptance criteria
  notes?: string; // Working notes
  type?: string; // Beads issue_type: bug, feature, task, epic, chore
  priority?: BeadPriority;
  status: BeadStatus;
  assignee?: string;
  labels?: string[];
  estimatedMinutes?: number; // Time estimate
  externalRef?: string; // External reference e.g., "gh-9", "jira-ABC"
  createdAt?: string; // ISO/RFC3339 timestamps
  updatedAt?: string;
  closedAt?: string;

  // Dependency relationships
  dependsOn?: string[]; // IDs this bead depends on (blockers)
  blocks?: string[]; // IDs this bead blocks

  // Comments
  comments?: BeadComment[];

  // UI-specific fields (not from CLI)
  sortOrder?: number;
  statusColumn?: string;
}

// Comment on a bead
export interface BeadComment {
  id: number;
  author: string;
  text: string;
  createdAt: string;
}

// Represents a Beads project (database/workspace)
export interface BeadsProject {
  id: string; // Stable ID (hash of db path or root path)
  name: string; // Human-friendly label (folder name or config display name)
  rootPath: string; // Project root (VS Code workspace folder)
  beadsDir: string; // Path to .beads directory
  dbPath?: string; // Path to beads.db (if discovered)
  daemonStatus: "running" | "stopped" | "unknown";
  daemonPid?: number;
}

// Result from `bd info --json`
export interface BeadsInfo {
  version?: string;
  database?: string;
  daemon_status?: string;
  daemon_pid?: number;
  issue_count?: number;
  [key: string]: unknown;
}

// Result from `bd daemons list --json`
export interface DaemonInfo {
  pid: number;
  database: string;
  working_dir?: string;
  status?: string;
  started_at?: string;
  [key: string]: unknown;
}

// Summary statistics for dashboard
export interface BeadsSummary {
  total: number;
  byStatus: Record<BeadStatus, number>;
  byPriority: Record<BeadPriority, number>;
  readyCount: number;
  blockedCount: number;
  inProgressCount: number;
}

// Dependency graph node
export interface GraphNode {
  id: string;
  title: string;
  status: BeadStatus;
  priority?: BeadPriority;
}

// Dependency graph edge
export interface GraphEdge {
  source: string; // Bead ID
  target: string; // Bead ID this depends on
  type: "depends_on" | "blocks";
}

// Full dependency graph structure
export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Settings that can be passed to webview
export interface WebviewSettings {
  renderMarkdown: boolean;
}

// Messages sent from extension to webview
export type ExtensionToWebviewMessage =
  | { type: "setViewType"; viewType: string }
  | { type: "setProject"; project: BeadsProject | null }
  | { type: "setBeads"; beads: Bead[] }
  | { type: "setBead"; bead: Bead | null }
  | { type: "setSelectedBeadId"; beadId: string | null }
  | { type: "setSummary"; summary: BeadsSummary }
  | { type: "setGraph"; graph: DependencyGraph }
  | { type: "setProjects"; projects: BeadsProject[] }
  | { type: "setLoading"; loading: boolean }
  | { type: "setError"; error: string | null }
  | { type: "setSettings"; settings: WebviewSettings }
  | { type: "refresh" };

// Messages sent from webview to extension
export type WebviewToExtensionMessage =
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
  | { type: "stopDaemon" };

// CLI command result
export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  stderr?: string;
}

// Filter options for bead listing
export interface BeadFilters {
  status?: BeadStatus[];
  priority?: BeadPriority[];
  labels?: string[];
  type?: string[];
  assignee?: string[];
  search?: string;
}

// Sort options for bead listing
export interface BeadSort {
  field: "status" | "priority" | "updatedAt" | "createdAt" | "title";
  direction: "asc" | "desc";
}

/**
 * Normalizes a status string from Beads CLI to internal BeadStatus
 */
export function normalizeStatus(status: string | undefined): BeadStatus {
  if (!status) {
    return "unknown";
  }
  const normalized = status.toLowerCase().replace(/-/g, "_");
  switch (normalized) {
    case "open":
      return "open";
    case "in_progress":
    case "active":
      return "in_progress";
    case "blocked":
      return "blocked";
    case "closed":
    case "done":
    case "completed":
    case "cancelled":
    case "canceled":
      return "closed";
    default:
      return "unknown";
  }
}

/**
 * Normalizes a priority value from Beads CLI to internal BeadPriority
 */
export function normalizePriority(
  priority: number | string | undefined
): BeadPriority {
  if (priority === undefined || priority === null) {
    return 4; // Default to "None"
  }
  const num =
    typeof priority === "string" ? parseInt(priority, 10) : priority;
  if (isNaN(num) || num < 0) {
    return 4;
  }
  if (num > 4) {
    return 4;
  }
  return num as BeadPriority;
}

/**
 * Converts a raw bead object from CLI JSON to internal Bead type
 */
export function normalizeBead(raw: Record<string, unknown>): Bead {
  return {
    id: String(raw.id || raw.ID || ""),
    title: String(raw.title || raw.Title || raw.summary || "Untitled"),
    description: raw.description
      ? String(raw.description)
      : raw.body
        ? String(raw.body)
        : undefined,
    type: raw.type ? String(raw.type) : raw.category ? String(raw.category) : undefined,
    priority: normalizePriority(raw.priority as number | string | undefined),
    status: normalizeStatus(raw.status as string | undefined),
    assignee: raw.assignee
      ? String(raw.assignee)
      : raw.assigned_to
        ? String(raw.assigned_to)
        : undefined,
    labels: Array.isArray(raw.labels)
      ? raw.labels.map(String)
      : raw.tags
        ? (raw.tags as string[]).map(String)
        : undefined,
    createdAt: raw.created_at
      ? String(raw.created_at)
      : raw.createdAt
        ? String(raw.createdAt)
        : undefined,
    updatedAt: raw.updated_at
      ? String(raw.updated_at)
      : raw.updatedAt
        ? String(raw.updatedAt)
        : undefined,
    closedAt: raw.closed_at
      ? String(raw.closed_at)
      : raw.closedAt
        ? String(raw.closedAt)
        : undefined,
    dependsOn: Array.isArray(raw.depends_on)
      ? raw.depends_on.map(String)
      : Array.isArray(raw.dependsOn)
        ? raw.dependsOn.map(String)
        : undefined,
    blocks: Array.isArray(raw.blocks) ? raw.blocks.map(String) : undefined,
  };
}

/**
 * Converts a daemon Issue to webview Bead format
 */
export function issueToWebviewBead(issue: {
  id: string;
  title: string;
  description?: string;
  design?: string;
  acceptance_criteria?: string;
  notes?: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee?: string;
  labels?: string[];
  estimated_minutes?: number;
  external_ref?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  dependencies?: Array<{ id: string; dependency_type: string }>;
  dependents?: Array<{ id: string; dependency_type: string }>;
  comments?: Array<{ id: number; author: string; text: string; created_at: string }>;
}): Bead {
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    design: issue.design,
    acceptanceCriteria: issue.acceptance_criteria,
    notes: issue.notes,
    type: issue.issue_type,
    priority: normalizePriority(issue.priority),
    status: normalizeStatus(issue.status),
    assignee: issue.assignee,
    labels: issue.labels,
    estimatedMinutes: issue.estimated_minutes,
    externalRef: issue.external_ref,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    dependsOn: issue.dependencies
      ?.filter((d) => d.dependency_type === "blocks")
      .map((d) => d.id),
    blocks: issue.dependents
      ?.filter((d) => d.dependency_type === "blocks")
      .map((d) => d.id),
    comments: issue.comments?.map((c) => ({
      id: c.id,
      author: c.author,
      text: c.text,
      createdAt: c.created_at,
    })),
  };
}
