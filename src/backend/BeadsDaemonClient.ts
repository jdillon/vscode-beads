/**
 * BeadsDaemonClient - Direct Unix socket RPC client for the Beads daemon
 *
 * Connects to .beads/bd.sock and communicates via line-delimited JSON-RPC.
 * Supports real-time mutation tracking via get_mutations.
 */

import * as net from "net";
import * as path from "path";
import * as fs from "fs";
import { EventEmitter } from "events";

// RPC Operations
const Op = {
  Ping: "ping",
  Status: "status",
  Health: "health",
  Create: "create",
  Update: "update",
  Close: "close",
  List: "list",
  Count: "count",
  Show: "show",
  Ready: "ready",
  Stats: "stats",
  DepAdd: "dep_add",
  DepRemove: "dep_remove",
  DepTree: "dep_tree",
  LabelAdd: "label_add",
  LabelRemove: "label_remove",
  CommentList: "comment_list",
  CommentAdd: "comment_add",
  GetMutations: "get_mutations",
  Shutdown: "shutdown",
} as const;

// Request/Response types matching the daemon protocol
export interface RpcRequest {
  operation: string;
  args: unknown;
  actor?: string;
  request_id?: string;
  cwd?: string;
  client_version?: string;
  expected_db?: string;
}

export interface RpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Issue type matching daemon output
export interface Issue {
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
  dependencies?: IssueDependency[];
  dependents?: IssueDependency[];
  comments?: IssueComment[];
}

export interface IssueComment {
  id: number;
  author: string;
  text: string;
  created_at: string;
}

export interface IssueDependency {
  id: string;
  title: string;
  status: string;
  priority: number;
  issue_type: string;
  dependency_type: string;
}

// Argument types for operations
export interface CreateArgs {
  id?: string;
  title: string;
  description?: string;
  issue_type?: string;
  priority?: number;
  design?: string;
  acceptance_criteria?: string;
  assignee?: string;
  labels?: string[];
  dependencies?: string[];
}

export interface UpdateArgs {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  design?: string;
  acceptance_criteria?: string;
  notes?: string;
  assignee?: string;
  add_labels?: string[];
  remove_labels?: string[];
  set_labels?: string[];
}

export interface CloseArgs {
  id: string;
  reason?: string;
}

export interface ListArgs {
  query?: string;
  status?: string;
  priority?: number;
  issue_type?: string;
  assignee?: string;
  labels?: string[];
  labels_any?: string[];
  ids?: string[];
  limit?: number;
  title_contains?: string;
  description_contains?: string;
}

export interface ShowArgs {
  id: string;
}

export interface ReadyArgs {
  assignee?: string;
  priority?: number;
  limit?: number;
  labels?: string[];
}

export interface DepAddArgs {
  from_id: string;
  to_id: string;
  dep_type: string;
}

export interface DepRemoveArgs {
  from_id: string;
  to_id: string;
  dep_type?: string;
}

export interface LabelArgs {
  id: string;
  label: string;
}

export interface CommentAddArgs {
  id: string;
  author: string;
  text: string;
}

export interface GetMutationsArgs {
  since: number; // Unix timestamp in milliseconds
}

// Response types
export interface HealthResponse {
  status: string;
  version: string;
  client_version?: string;
  compatible: boolean;
  uptime_seconds: number;
  db_response_ms: number;
  active_connections: number;
  max_connections: number;
  memory_alloc_mb: number;
  error?: string;
}

export interface StatusResponse {
  version: string;
  workspace_path: string;
  database_path: string;
  socket_path: string;
  pid: number;
  uptime_seconds: number;
  last_activity_time: string;
  exclusive_lock_active: boolean;
  exclusive_lock_holder?: string;
}

export interface StatsResponse {
  total: number;
  open: number;
  in_progress: number;
  blocked: number;
  closed: number;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
  by_assignee: Record<string, number>;
}

export interface MutationEvent {
  Type: string; // "create", "update", "delete", "comment"
  IssueID: string;
  Timestamp: string;
}

// Client options
export interface ClientOptions {
  timeout?: number;
  cwd?: string;
  expectedDb?: string;
}

const CLIENT_VERSION = "0.1.0";
const DEFAULT_TIMEOUT = 30000;

/**
 * BeadsDaemonClient connects directly to the daemon Unix socket
 */
export class BeadsDaemonClient extends EventEmitter {
  private socketPath: string;
  private cwd: string;
  private expectedDb?: string;
  private timeout: number;
  private mutationInterval?: NodeJS.Timeout;
  private lastMutationTime: number = 0;
  private connected: boolean = false;

  constructor(beadsDir: string, options: ClientOptions = {}) {
    super();
    this.socketPath = path.join(beadsDir, "bd.sock");
    this.cwd = options.cwd || path.dirname(beadsDir);
    this.expectedDb = options.expectedDb;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
  }

  /**
   * Find the .beads directory starting from a given path
   */
  static findBeadsDir(startPath: string): string | null {
    let current = startPath;
    const root = path.parse(current).root;

    while (current !== root) {
      const beadsDir = path.join(current, ".beads");
      if (fs.existsSync(beadsDir) && fs.statSync(beadsDir).isDirectory()) {
        return beadsDir;
      }
      current = path.dirname(current);
    }
    return null;
  }

  /**
   * Check if daemon socket exists
   */
  socketExists(): boolean {
    try {
      fs.accessSync(this.socketPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute an RPC request
   */
  private async execute<T>(operation: string, args: unknown = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let responseData = "";
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
        }
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Request timed out after ${this.timeout}ms`));
      }, this.timeout);

      socket.on("connect", () => {
        this.connected = true;
        const request: RpcRequest = {
          operation,
          args,
          cwd: this.cwd,
          client_version: CLIENT_VERSION,
          expected_db: this.expectedDb,
        };

        const requestLine = JSON.stringify(request) + "\n";
        socket.write(requestLine);
      });

      socket.on("data", (data) => {
        responseData += data.toString();

        // Check for complete response (newline-delimited)
        const newlineIndex = responseData.indexOf("\n");
        if (newlineIndex !== -1) {
          clearTimeout(timeoutId);
          const responseLine = responseData.substring(0, newlineIndex);
          cleanup();

          try {
            const response: RpcResponse<T> = JSON.parse(responseLine);
            if (response.success) {
              resolve(response.data as T);
            } else {
              reject(new Error(response.error || "Unknown error"));
            }
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err}`));
          }
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timeoutId);
        cleanup();
        this.connected = false;
        reject(new Error(`Socket error: ${err.message}`));
      });

      socket.on("close", () => {
        clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          reject(new Error("Socket closed unexpectedly"));
        }
      });

      // Connect to Unix socket
      socket.connect(this.socketPath);
    });
  }

  /**
   * Check if daemon is healthy
   */
  async health(): Promise<HealthResponse> {
    return this.execute<HealthResponse>(Op.Health);
  }

  /**
   * Get daemon status
   */
  async status(): Promise<StatusResponse> {
    return this.execute<StatusResponse>(Op.Status);
  }

  /**
   * Ping the daemon
   */
  async ping(): Promise<{ message: string; version: string }> {
    return this.execute(Op.Ping);
  }

  /**
   * List issues with optional filters
   */
  async list(args: ListArgs = {}): Promise<Issue[]> {
    const result = await this.execute<Issue[]>(Op.List, args);
    return result ?? [];
  }

  /**
   * Get a single issue by ID
   */
  async show(id: string): Promise<Issue | null> {
    return this.execute<Issue | null>(Op.Show, { id });
  }

  /**
   * Get ready (unblocked) issues
   */
  async ready(args: ReadyArgs = {}): Promise<Issue[]> {
    const result = await this.execute<Issue[]>(Op.Ready, args);
    return result ?? [];
  }

  /**
   * Get project statistics
   */
  async stats(): Promise<StatsResponse> {
    return this.execute<StatsResponse>(Op.Stats);
  }

  /**
   * Create a new issue
   */
  async create(args: CreateArgs): Promise<Issue> {
    return this.execute<Issue>(Op.Create, args);
  }

  /**
   * Update an existing issue
   */
  async update(args: UpdateArgs): Promise<Issue> {
    return this.execute<Issue>(Op.Update, args);
  }

  /**
   * Close an issue
   */
  async close(args: CloseArgs): Promise<Issue> {
    return this.execute<Issue>(Op.Close, args);
  }

  /**
   * Add a dependency between issues
   */
  async addDependency(args: DepAddArgs): Promise<void> {
    await this.execute(Op.DepAdd, args);
  }

  /**
   * Remove a dependency between issues
   */
  async removeDependency(args: DepRemoveArgs): Promise<void> {
    await this.execute(Op.DepRemove, args);
  }

  /**
   * Add a label to an issue
   */
  async addLabel(args: LabelArgs): Promise<void> {
    await this.execute(Op.LabelAdd, args);
  }

  /**
   * Remove a label from an issue
   */
  async removeLabel(args: LabelArgs): Promise<void> {
    await this.execute(Op.LabelRemove, args);
  }

  /**
   * Add a comment to an issue
   */
  async addComment(args: CommentAddArgs): Promise<void> {
    await this.execute(Op.CommentAdd, args);
  }

  /**
   * Get comments for an issue
   */
  async listComments(id: string): Promise<unknown[]> {
    const result = await this.execute<unknown[]>(Op.CommentList, { id });
    return result ?? [];
  }

  /**
   * Get recent mutations since a timestamp
   */
  async getMutations(since: number = 0): Promise<MutationEvent[]> {
    const result = await this.execute<MutationEvent[]>(Op.GetMutations, { since });
    return result ?? [];
  }

  /**
   * Start watching for mutations
   * Emits 'mutation' events when changes are detected
   */
  startMutationWatch(intervalMs: number = 1000): void {
    if (this.mutationInterval) {
      return; // Already watching
    }

    // Store as Unix timestamp (ms) for reliable comparison across timezones
    this.lastMutationTime = Date.now();

    this.mutationInterval = setInterval(async () => {
      try {
        const mutations = await this.getMutations(0);
        if (!mutations) {
          return; // Guard against null/undefined response
        }
        // Filter to only new mutations since last check
        // Convert ISO timestamps to Date for proper comparison
        const newMutations = mutations.filter((m) => {
          const mutationTime = new Date(m.Timestamp).getTime();
          return mutationTime > this.lastMutationTime;
        });
        if (newMutations.length > 0) {
          // Update timestamp to the latest mutation
          const latestMutation = newMutations[newMutations.length - 1];
          this.lastMutationTime = new Date(latestMutation.Timestamp).getTime();
          for (const mutation of newMutations) {
            this.emit("mutation", mutation);
          }
        }
      } catch (err) {
        this.emit("error", err);
      }
    }, intervalMs);
  }

  /**
   * Stop watching for mutations
   */
  stopMutationWatch(): void {
    if (this.mutationInterval) {
      clearInterval(this.mutationInterval);
      this.mutationInterval = undefined;
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopMutationWatch();
  }
}
