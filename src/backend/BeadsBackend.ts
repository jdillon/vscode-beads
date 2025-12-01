/**
 * BeadsBackend - CLI/Daemon wrapper for the Beads `bd` command
 *
 * This class handles all interactions with the Beads CLI, including:
 * - Running `bd` commands with --json output
 * - Parsing JSON responses
 * - Managing daemon lifecycle
 * - Handling errors gracefully
 *
 * All operations are performed via child_process to spawn `bd` commands.
 * The extension never directly accesses .beads files.
 */

import { spawn, SpawnOptions } from "child_process";
import * as vscode from "vscode";
import {
  Bead,
  BeadsInfo,
  BeadsSummary,
  BeadStatus,
  BeadPriority,
  CommandResult,
  DaemonInfo,
  normalizeBead,
  normalizeStatus,
  BeadFilters,
} from "./types";

export class BeadsBackend {
  private bdPath: string;
  private projectRoot: string;
  private outputChannel: vscode.OutputChannel;

  constructor(projectRoot: string, outputChannel: vscode.OutputChannel) {
    this.projectRoot = projectRoot;
    this.outputChannel = outputChannel;
    this.bdPath = this.getBdPath();
  }

  /**
   * Gets the path to the bd CLI from settings or uses default
   */
  private getBdPath(): string {
    const config = vscode.workspace.getConfiguration("beads");
    return config.get<string>("pathToBd") || "bd";
  }

  /**
   * Updates the project root for this backend instance
   */
  setProjectRoot(projectRoot: string): void {
    this.projectRoot = projectRoot;
  }

  /**
   * Executes a bd command and returns the result
   */
  private async runCommand(
    args: string[],
    options: { timeout?: number; cwd?: string } = {}
  ): Promise<CommandResult<string>> {
    const cwd = options.cwd || this.projectRoot;
    const timeout = options.timeout || 30000;

    return new Promise((resolve) => {
      const spawnOptions: SpawnOptions = {
        cwd,
        shell: true,
        env: { ...process.env },
      };

      this.outputChannel.appendLine(`[BeadsBackend] Running: ${this.bdPath} ${args.join(" ")} (cwd: ${cwd})`);

      const proc = spawn(this.bdPath, args, spawnOptions);

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          error: `Command timed out after ${timeout}ms`,
          stderr,
        });
      }, timeout);

      proc.on("close", (code) => {
        clearTimeout(timeoutId);
        if (code === 0) {
          this.outputChannel.appendLine(`[BeadsBackend] Command succeeded`);
          resolve({ success: true, data: stdout });
        } else {
          this.outputChannel.appendLine(`[BeadsBackend] Command failed with code ${code}: ${stderr}`);
          resolve({
            success: false,
            error: `Command exited with code ${code}`,
            stderr,
          });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeoutId);
        this.outputChannel.appendLine(`[BeadsBackend] Command error: ${err.message}`);
        resolve({
          success: false,
          error: err.message,
        });
      });
    });
  }

  /**
   * Runs a bd command with --json flag and parses the output
   */
  private async runJsonCommand<T>(
    args: string[],
    options: { timeout?: number; cwd?: string } = {}
  ): Promise<CommandResult<T>> {
    const result = await this.runCommand([...args, "--json"], options);

    if (!result.success) {
      return result as CommandResult<T>;
    }

    try {
      const data = JSON.parse(result.data || "{}") as T;
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: `Failed to parse JSON output: ${err}`,
        stderr: result.data,
      };
    }
  }

  /**
   * Gets info about the current Beads project and daemon status
   */
  async getInfo(): Promise<CommandResult<BeadsInfo>> {
    return this.runJsonCommand<BeadsInfo>(["info"]);
  }

  /**
   * Lists all beads in the project
   */
  async listBeads(filters?: BeadFilters): Promise<CommandResult<Bead[]>> {
    const args = ["list"];

    // Add filter arguments where supported by CLI
    if (filters?.status && filters.status.length > 0) {
      // Some CLIs support --status filter
      args.push("--status", filters.status.join(","));
    }

    const result = await this.runJsonCommand<unknown[]>(args);

    if (!result.success) {
      return result as CommandResult<Bead[]>;
    }

    // Normalize the raw data to our Bead type
    const beads = (result.data || []).map((raw) =>
      normalizeBead(raw as Record<string, unknown>)
    );

    // Apply client-side filtering for filters not supported by CLI
    let filteredBeads = beads;

    if (filters?.priority && filters.priority.length > 0) {
      filteredBeads = filteredBeads.filter(
        (b) => b.priority !== undefined && filters.priority!.includes(b.priority)
      );
    }

    if (filters?.labels && filters.labels.length > 0) {
      filteredBeads = filteredBeads.filter(
        (b) =>
          b.labels &&
          filters.labels!.some((label) => b.labels!.includes(label))
      );
    }

    if (filters?.type && filters.type.length > 0) {
      filteredBeads = filteredBeads.filter(
        (b) => b.type && filters.type!.includes(b.type)
      );
    }

    if (filters?.assignee && filters.assignee.length > 0) {
      filteredBeads = filteredBeads.filter(
        (b) => b.assignee && filters.assignee!.includes(b.assignee)
      );
    }

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      filteredBeads = filteredBeads.filter(
        (b) =>
          b.title.toLowerCase().includes(searchLower) ||
          (b.description && b.description.toLowerCase().includes(searchLower)) ||
          b.id.toLowerCase().includes(searchLower)
      );
    }

    return { success: true, data: filteredBeads };
  }

  /**
   * Gets detailed information about a single bead
   */
  async getBead(id: string): Promise<CommandResult<Bead>> {
    const result = await this.runJsonCommand<Record<string, unknown>>(["show", id]);

    if (!result.success) {
      return result as CommandResult<Bead>;
    }

    return { success: true, data: normalizeBead(result.data!) };
  }

  /**
   * Gets the list of ready beads
   */
  async getReadyBeads(): Promise<CommandResult<Bead[]>> {
    const result = await this.runJsonCommand<unknown[]>(["ready"]);

    if (!result.success) {
      return result as CommandResult<Bead[]>;
    }

    const beads = (result.data || []).map((raw) =>
      normalizeBead(raw as Record<string, unknown>)
    );

    return { success: true, data: beads };
  }

  /**
   * Gets the list of blocked beads
   */
  async getBlockedBeads(): Promise<CommandResult<Bead[]>> {
    const result = await this.runJsonCommand<unknown[]>(["blocked"]);

    if (!result.success) {
      return result as CommandResult<Bead[]>;
    }

    const beads = (result.data || []).map((raw) =>
      normalizeBead(raw as Record<string, unknown>)
    );

    return { success: true, data: beads };
  }

  /**
   * Updates a bead's properties
   */
  async updateBead(
    id: string,
    updates: Partial<Bead>
  ): Promise<CommandResult<Bead>> {
    const args = ["update", id];

    if (updates.title) {
      args.push("--title", updates.title);
    }

    if (updates.description) {
      args.push("--description", updates.description);
    }

    if (updates.status) {
      // Convert internal status to CLI format
      const cliStatus = updates.status.replace(/_/g, "-");
      args.push("--status", cliStatus);
    }

    if (updates.priority !== undefined) {
      args.push("--priority", String(updates.priority));
    }

    if (updates.type) {
      args.push("--type", updates.type);
    }

    if (updates.assignee) {
      args.push("--assignee", updates.assignee);
    }

    if (updates.labels && updates.labels.length > 0) {
      args.push("--labels", updates.labels.join(","));
    }

    const result = await this.runJsonCommand<Record<string, unknown>>(args);

    if (!result.success) {
      return result as CommandResult<Bead>;
    }

    // Fetch the updated bead to return
    return this.getBead(id);
  }

  /**
   * Creates a new bead
   */
  async createBead(data: Partial<Bead>): Promise<CommandResult<Bead>> {
    const args = ["create"];

    if (data.title) {
      args.push("--title", data.title);
    }

    if (data.description) {
      args.push("--description", data.description);
    }

    if (data.type) {
      args.push("--type", data.type);
    }

    if (data.priority !== undefined) {
      args.push("--priority", String(data.priority));
    }

    if (data.status) {
      const cliStatus = data.status.replace(/_/g, "-");
      args.push("--status", cliStatus);
    }

    if (data.assignee) {
      args.push("--assignee", data.assignee);
    }

    if (data.labels && data.labels.length > 0) {
      args.push("--labels", data.labels.join(","));
    }

    const result = await this.runJsonCommand<Record<string, unknown>>(args);

    if (!result.success) {
      return result as CommandResult<Bead>;
    }

    // The CLI should return the created bead with its ID
    if (result.data) {
      return { success: true, data: normalizeBead(result.data) };
    }

    return {
      success: false,
      error: "Bead created but no data returned",
    };
  }

  /**
   * Adds a dependency between beads
   */
  async addDependency(
    beadId: string,
    dependsOnId: string
  ): Promise<CommandResult<void>> {
    const result = await this.runCommand(["dep", "add", beadId, dependsOnId]);
    return result as CommandResult<void>;
  }

  /**
   * Removes a dependency between beads
   */
  async removeDependency(
    beadId: string,
    dependsOnId: string
  ): Promise<CommandResult<void>> {
    const result = await this.runCommand(["dep", "remove", beadId, dependsOnId]);
    return result as CommandResult<void>;
  }

  /**
   * Gets the dependency tree for a specific bead
   */
  async getDependencyTree(beadId: string): Promise<CommandResult<string>> {
    return this.runCommand(["dep", "tree", beadId]);
  }

  /**
   * Generates a summary of all beads for the dashboard
   */
  async getSummary(): Promise<CommandResult<BeadsSummary>> {
    const beadsResult = await this.listBeads();

    if (!beadsResult.success) {
      return beadsResult as CommandResult<BeadsSummary>;
    }

    const beads = beadsResult.data!;

    const byStatus: Record<BeadStatus, number> = {
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
    };

    const byPriority: Record<BeadPriority, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
    };

    for (const bead of beads) {
      byStatus[bead.status]++;
      if (bead.priority !== undefined) {
        byPriority[bead.priority]++;
      }
    }

    const summary: BeadsSummary = {
      total: beads.length,
      byStatus,
      byPriority,
      readyCount: byStatus.open,
      blockedCount: byStatus.blocked,
      inProgressCount: byStatus.in_progress,
    };

    return { success: true, data: summary };
  }

  /**
   * Starts the Beads daemon for this project
   */
  async startDaemon(): Promise<CommandResult<void>> {
    const result = await this.runCommand(["daemon", "start"]);
    return result as CommandResult<void>;
  }

  /**
   * Stops the Beads daemon for this project
   */
  async stopDaemon(): Promise<CommandResult<void>> {
    const result = await this.runCommand(["daemon", "stop"]);
    return result as CommandResult<void>;
  }

  /**
   * Lists all running daemons on the system
   */
  async listDaemons(): Promise<CommandResult<DaemonInfo[]>> {
    const result = await this.runJsonCommand<DaemonInfo[]>(["daemons", "list"]);
    return result;
  }

  /**
   * Checks if the daemon is running for this project
   */
  async isDaemonRunning(): Promise<boolean> {
    const info = await this.getInfo();
    if (!info.success || !info.data) {
      return false;
    }

    const status = info.data.daemon_status?.toLowerCase();
    return status === "running" || status === "active";
  }

  /**
   * Gets all unique labels from the beads
   */
  async getAllLabels(): Promise<CommandResult<string[]>> {
    const beadsResult = await this.listBeads();

    if (!beadsResult.success) {
      return beadsResult as CommandResult<string[]>;
    }

    const labels = new Set<string>();
    for (const bead of beadsResult.data!) {
      if (bead.labels) {
        for (const label of bead.labels) {
          labels.add(label);
        }
      }
    }

    return { success: true, data: Array.from(labels).sort() };
  }

  /**
   * Gets all unique types from the beads
   */
  async getAllTypes(): Promise<CommandResult<string[]>> {
    const beadsResult = await this.listBeads();

    if (!beadsResult.success) {
      return beadsResult as CommandResult<string[]>;
    }

    const types = new Set<string>();
    for (const bead of beadsResult.data!) {
      if (bead.type) {
        types.add(bead.type);
      }
    }

    return { success: true, data: Array.from(types).sort() };
  }

  /**
   * Gets all unique assignees from the beads
   */
  async getAllAssignees(): Promise<CommandResult<string[]>> {
    const beadsResult = await this.listBeads();

    if (!beadsResult.success) {
      return beadsResult as CommandResult<string[]>;
    }

    const assignees = new Set<string>();
    for (const bead of beadsResult.data!) {
      if (bead.assignee) {
        assignees.add(bead.assignee);
      }
    }

    return { success: true, data: Array.from(assignees).sort() };
  }
}
