/**
 * BeadsProjectManager - Project Discovery and Active Project Management
 *
 * This service handles:
 * - Discovering Beads projects in the current VS Code workspace
 * - Managing the currently active project
 * - Connecting to the daemon via Unix socket RPC
 * - Real-time mutation tracking via daemon events
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { BeadsProject } from "./types";
import { BeadsDaemonClient, MutationEvent } from "./BeadsDaemonClient";

export class BeadsProjectManager implements vscode.Disposable {
  private projects: BeadsProject[] = [];
  private activeProject: BeadsProject | null = null;
  private client: BeadsDaemonClient | null = null;
  private outputChannel: vscode.OutputChannel;

  private readonly _onProjectsChanged = new vscode.EventEmitter<BeadsProject[]>();
  public readonly onProjectsChanged = this._onProjectsChanged.event;

  private readonly _onActiveProjectChanged = new vscode.EventEmitter<BeadsProject | null>();
  public readonly onActiveProjectChanged = this._onActiveProjectChanged.event;

  private readonly _onDataChanged = new vscode.EventEmitter<void>();
  public readonly onDataChanged = this._onDataChanged.event;

  private readonly _onMutation = new vscode.EventEmitter<MutationEvent>();
  public readonly onMutation = this._onMutation.event;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Initializes the project manager by discovering all projects
   */
  async initialize(): Promise<void> {
    await this.discoverProjects();

    // Auto-select the first project if available
    if (this.projects.length > 0 && !this.activeProject) {
      await this.setActiveProject(this.projects[0].id);
    }
  }

  /**
   * Discovers Beads projects in all workspace folders
   */
  async discoverProjects(): Promise<void> {
    this.outputChannel.appendLine("[ProjectManager] Discovering Beads projects...");

    const discoveredProjects: BeadsProject[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders || [];

    // Check each workspace folder for a .beads directory
    for (const folder of workspaceFolders) {
      const beadsDir = path.join(folder.uri.fsPath, ".beads");

      try {
        const stats = await fs.promises.stat(beadsDir);
        if (stats.isDirectory()) {
          const project = await this.createProjectFromPath(
            folder.uri.fsPath,
            beadsDir,
            folder.name
          );
          discoveredProjects.push(project);
          this.outputChannel.appendLine(
            `[ProjectManager] Found project: ${project.name} at ${project.rootPath}`
          );
        }
      } catch {
        // .beads directory doesn't exist in this folder, skip
      }
    }

    this.projects = discoveredProjects;
    this._onProjectsChanged.fire(this.projects);

    this.outputChannel.appendLine(
      `[ProjectManager] Discovered ${this.projects.length} project(s)`
    );
  }

  /**
   * Creates a BeadsProject from a discovered path
   */
  private async createProjectFromPath(
    rootPath: string,
    beadsDir: string,
    folderName: string
  ): Promise<BeadsProject> {
    const project: BeadsProject = {
      id: this.generateProjectId(beadsDir),
      name: folderName,
      rootPath,
      beadsDir,
      daemonStatus: "unknown",
    };

    // Check for database file
    const dbPath = path.join(beadsDir, "beads.db");
    try {
      await fs.promises.access(dbPath);
      project.dbPath = dbPath;
    } catch {
      // Database might not exist yet
    }

    // Check daemon status by checking socket existence
    const socketPath = path.join(beadsDir, "bd.sock");
    try {
      await fs.promises.access(socketPath);
      project.daemonStatus = "running";
    } catch {
      project.daemonStatus = "stopped";
    }

    return project;
  }

  /**
   * Generates a stable ID for a project based on its beads directory path
   */
  private generateProjectId(beadsDir: string): string {
    return crypto.createHash("sha256").update(beadsDir).digest("hex").slice(0, 12);
  }

  /**
   * Gets all discovered projects
   */
  getProjects(): BeadsProject[] {
    return this.projects;
  }

  /**
   * Gets the currently active project
   */
  getActiveProject(): BeadsProject | null {
    return this.activeProject;
  }

  /**
   * Gets the daemon client for the active project
   */
  getClient(): BeadsDaemonClient | null {
    return this.client;
  }

  /**
   * Sets the active project by ID
   */
  async setActiveProject(projectId: string): Promise<boolean> {
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) {
      this.outputChannel.appendLine(
        `[ProjectManager] Project not found: ${projectId}`
      );
      return false;
    }

    // Clean up previous client
    if (this.client) {
      this.client.stopMutationWatch();
      this.client.dispose();
    }

    this.activeProject = project;

    // Create new daemon client
    this.client = new BeadsDaemonClient(project.beadsDir, {
      cwd: project.rootPath,
      expectedDb: project.dbPath,
    });

    this.outputChannel.appendLine(
      `[ProjectManager] Active project set to: ${project.name}`
    );

    // Check if daemon is running and connect
    if (this.client.socketExists()) {
      try {
        const health = await this.client.health();
        project.daemonStatus = health.status === "healthy" ? "running" : "stopped";
        this.outputChannel.appendLine(
          `[ProjectManager] Daemon status: ${health.status} (v${health.version})`
        );

        // Start mutation watching for real-time updates
        this.client.on("mutation", (mutation: MutationEvent) => {
          this.outputChannel.appendLine(
            `[ProjectManager] Mutation: ${mutation.Type} on ${mutation.IssueID}`
          );
          this._onMutation.fire(mutation);
          this._onDataChanged.fire();
        });

        this.client.on("error", (err: Error) => {
          this.outputChannel.appendLine(
            `[ProjectManager] Mutation watch error: ${err.message}`
          );
        });

        // Poll for mutations every second
        this.client.startMutationWatch(1000);
      } catch (err) {
        this.outputChannel.appendLine(
          `[ProjectManager] Failed to connect to daemon: ${err}`
        );
        project.daemonStatus = "stopped";
      }
    } else {
      project.daemonStatus = "stopped";

      // Check if we should auto-start the daemon
      const config = vscode.workspace.getConfiguration("beads");
      const autoStart = config.get<boolean>("autoStartDaemon", true);

      if (autoStart) {
        await this.ensureDaemonRunning();
      }
    }

    this._onActiveProjectChanged.fire(this.activeProject);
    this._onDataChanged.fire();

    return true;
  }

  /**
   * Ensures the daemon is running for the active project
   */
  async ensureDaemonRunning(): Promise<boolean> {
    if (!this.activeProject) {
      return false;
    }

    // Check if already running
    if (this.client?.socketExists()) {
      try {
        await this.client.health();
        this.activeProject.daemonStatus = "running";
        return true;
      } catch {
        // Socket exists but daemon not responding
      }
    }

    this.outputChannel.appendLine(
      `[ProjectManager] Starting daemon for ${this.activeProject.name}...`
    );

    // Start daemon via CLI (one-time spawn)
    const { spawn } = await import("child_process");
    return new Promise((resolve) => {
      const proc = spawn("bd", ["daemon", "start"], {
        cwd: this.activeProject!.rootPath,
        shell: true,
        detached: true,
        stdio: "ignore",
      });

      proc.unref();

      // Wait a moment for daemon to start
      setTimeout(async () => {
        if (this.client?.socketExists()) {
          try {
            await this.client.health();
            this.activeProject!.daemonStatus = "running";
            this.outputChannel.appendLine(
              `[ProjectManager] Daemon started successfully`
            );

            // Start mutation watching
            this.client.startMutationWatch(1000);
            resolve(true);
          } catch {
            resolve(false);
          }
        } else {
          this.outputChannel.appendLine(
            `[ProjectManager] Daemon failed to start`
          );
          resolve(false);
        }
      }, 1000);
    });
  }

  /**
   * Stops the daemon for the active project
   */
  async stopDaemon(): Promise<boolean> {
    if (!this.activeProject) {
      return false;
    }

    // Stop daemon via CLI
    const { spawn } = await import("child_process");
    return new Promise((resolve) => {
      const proc = spawn("bd", ["daemon", "stop"], {
        cwd: this.activeProject!.rootPath,
        shell: true,
      });

      proc.on("close", (code) => {
        if (code === 0) {
          this.activeProject!.daemonStatus = "stopped";
          if (this.client) {
            this.client.stopMutationWatch();
          }
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  /**
   * Refreshes data for the active project
   */
  async refresh(): Promise<void> {
    if (!this.activeProject || !this.client) {
      return;
    }

    // Re-check daemon status
    if (this.client.socketExists()) {
      try {
        await this.client.health();
        this.activeProject.daemonStatus = "running";
      } catch {
        this.activeProject.daemonStatus = "stopped";
      }
    } else {
      this.activeProject.daemonStatus = "stopped";
    }

    this._onDataChanged.fire();
  }

  /**
   * Shows a quick pick to select a project
   */
  async showProjectPicker(): Promise<BeadsProject | undefined> {
    if (this.projects.length === 0) {
      vscode.window.showWarningMessage(
        "No Beads projects found. Initialize a project with `bd init` first."
      );
      return undefined;
    }

    const items = this.projects.map((project) => ({
      label: project.name,
      description: project.rootPath,
      detail: `Daemon: ${project.daemonStatus}${project.daemonPid ? ` (PID: ${project.daemonPid})` : ""}`,
      project,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a Beads project",
      title: "Switch Beads Project",
    });

    if (selected) {
      await this.setActiveProject(selected.project.id);
      return selected.project;
    }

    return undefined;
  }

  /**
   * Prompts the user to start the daemon if it's not running
   */
  async promptDaemonStart(): Promise<boolean> {
    if (!this.activeProject) {
      return false;
    }

    if (this.activeProject.daemonStatus === "running") {
      return true;
    }

    const action = await vscode.window.showWarningMessage(
      `The Beads daemon is not running for "${this.activeProject.name}". Start it now?`,
      "Start Daemon",
      "Cancel"
    );

    if (action === "Start Daemon") {
      return this.ensureDaemonRunning();
    }

    return false;
  }

  dispose(): void {
    if (this.client) {
      this.client.stopMutationWatch();
      this.client.dispose();
    }
    this._onProjectsChanged.dispose();
    this._onActiveProjectChanged.dispose();
    this._onDataChanged.dispose();
    this._onMutation.dispose();
  }
}
