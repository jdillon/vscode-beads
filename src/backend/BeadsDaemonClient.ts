/**
 * BeadsDaemonClient - RPC client for the Beads daemon
 *
 * Connects to .beads/bd.sock and communicates via line-delimited JSON-RPC.
 * Supports Unix domain sockets (Linux/macOS) and TCP sockets (Windows).
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
  external_ref?: string;
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
  external_ref?: string;
  estimated_minutes?: number;
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
// Workaround for daemon race condition - remove after upstream fix
// See: https://github.com/steveyegge/beads/issues/607
const DEFAULT_RETRIES = 2;
const RETRY_DELAY_MS = 100;
const TRANSIENT_ERROR_PATTERNS = ["database is closed", "database is locked", "connection reset"];

function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => message.includes(pattern.toLowerCase()));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * BeadsDaemonClient connects directly to the daemon Unix socket
 */
export class BeadsDaemonClient extends EventEmitter {
  private socketPath: string;
  private cwd: string;
  private expectedDb?: string;
  private timeout: number;
  private mutationTimeout?: NodeJS.Timeout;
  private lastMutationTime: number = 0;
  private connected: boolean = false;
  private watchingMutations: boolean = false;
  private currentBackoff: number = 1000;
  private readonly baseInterval: number = 1000;
  private readonly maxBackoff: number = 30000;

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
   * Determine socket connection parameters from bd.sock
   * Returns TCP connection info if Windows-style, otherwise Unix socket path
   */
  private getSocketConnection(): { type: "unix"; path: string } | { type: "tcp"; host: string; port: number } {
    try {
      const sockContent = fs.readFileSync(this.socketPath, "utf-8").trim();
      const sockInfo = JSON.parse(sockContent);

      // Windows daemon writes TCP connection info to bd.sock
      if (sockInfo.network === "tcp" && sockInfo.address) {
        const [host, portStr] = sockInfo.address.split(":");
        const port = parseInt(portStr, 10);

        // Security: only allow localhost connections
        if (host !== "127.0.0.1" && host !== "localhost") {
          console.error(`[BeadsDaemonClient] Security: refusing non-localhost daemon address: ${host}`);
          return { type: "unix", path: "" }; // Empty path will fail to connect
        }

        return { type: "tcp", host, port };
      }
    } catch {
      // Not JSON or file read error - assume Unix socket (normal on Linux/macOS)
    }

    return { type: "unix", path: this.socketPath };
  }

  /**
   * Execute an RPC request with retry for transient errors.
   *
   * HACK: Ugly bandaid - retries mask a daemon race condition where concurrent
   * requests can fail with "database is closed" during FreshnessChecker reconnection.
   * Remove after upstream fix: https://github.com/steveyegge/beads/issues/607
   */
  private async execute<T>(operation: string, args: unknown = {}): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
      try {
        return await this.executeOnce<T>(operation, args);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Only retry on transient errors
        if (attempt < DEFAULT_RETRIES && isTransientError(lastError)) {
          await delay(RETRY_DELAY_MS * (attempt + 1)); // Increasing delay
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error("Execute failed");
  }

  /**
   * Execute a single RPC request (no retry)
   */
  private async executeOnce<T>(operation: string, args: unknown = {}): Promise<T> {
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
        // Note: Don't set this.connected here - it's managed by pollMutations()
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
        // Note: Don't set this.connected here - it's managed by pollMutations()
        reject(new Error(`Socket error: ${err.message}`));
      });

      socket.on("close", () => {
        clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          reject(new Error("Socket closed unexpectedly"));
        }
      });

      const connection = this.getSocketConnection();
      if (connection.type === "tcp") {
        socket.connect(connection.port, connection.host);
      } else {
        socket.connect(connection.path);
      }
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
   * Uses exponential backoff on errors (up to 30s)
   */
  startMutationWatch(intervalMs: number = 1000): void {
    if (this.watchingMutations) {
      return; // Already watching
    }

    this.watchingMutations = true;
    this.connected = true; // Assume connected since caller verified daemon is up
    this.currentBackoff = intervalMs;
    this.lastMutationTime = Date.now();

    this.scheduleMutationPoll();
  }

  /**
   * Schedule the next mutation poll with current backoff
   */
  private scheduleMutationPoll(): void {
    if (!this.watchingMutations) {
      return;
    }

    this.mutationTimeout = setTimeout(async () => {
      await this.pollMutations();
      this.scheduleMutationPoll();
    }, this.currentBackoff);
  }

  /**
   * Poll for mutations once
   */
  private async pollMutations(): Promise<void> {
    try {
      const mutations = await this.getMutations(0);
      if (!mutations) {
        return;
      }

      // Success - reset backoff and mark connected
      const wasDisconnected = !this.connected;
      this.connected = true;
      this.currentBackoff = this.baseInterval;

      if (wasDisconnected) {
        this.emit("reconnected");
      }

      // Filter to only new mutations since last check
      const newMutations = mutations.filter((m) => {
        const mutationTime = new Date(m.Timestamp).getTime();
        return mutationTime > this.lastMutationTime;
      });

      if (newMutations.length > 0) {
        const latestMutation = newMutations[newMutations.length - 1];
        this.lastMutationTime = new Date(latestMutation.Timestamp).getTime();
        for (const mutation of newMutations) {
          this.emit("mutation", mutation);
        }
      }
    } catch (err) {
      // Error - increase backoff and mark disconnected
      const wasConnected = this.connected;
      this.connected = false;

      if (wasConnected) {
        this.emit("disconnected", err);
      }

      // Exponential backoff: double interval up to max
      this.currentBackoff = Math.min(this.currentBackoff * 2, this.maxBackoff);
    }
  }

  /**
   * Stop watching for mutations
   */
  stopMutationWatch(): void {
    this.watchingMutations = false;
    if (this.mutationTimeout) {
      clearTimeout(this.mutationTimeout);
      this.mutationTimeout = undefined;
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
