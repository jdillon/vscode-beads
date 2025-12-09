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
import { Logger } from "../utils/logger";

const ACTIVE_PROJECT_KEY = "beads.activeProjectId";

export class BeadsProjectManager implements vscode.Disposable {
  private projects: BeadsProject[] = [];
  private activeProject: BeadsProject | null = null;
  private client: BeadsDaemonClient | null = null;
  private log: Logger;
  private context: vscode.ExtensionContext;

  // Dedupe daemon error notifications
  private lastDaemonErrorTime = 0;
  private static readonly DAEMON_ERROR_DEDUPE_MS = 5000;

  private readonly _onProjectsChanged = new vscode.EventEmitter<BeadsProject[]>();
  public readonly onProjectsChanged = this._onProjectsChanged.event;

  private readonly _onActiveProjectChanged = new vscode.EventEmitter<BeadsProject | null>();
  public readonly onActiveProjectChanged = this._onActiveProjectChanged.event;

  private readonly _onDataChanged = new vscode.EventEmitter<void>();
  public readonly onDataChanged = this._onDataChanged.event;

  private readonly _onMutation = new vscode.EventEmitter<MutationEvent>();
  public readonly onMutation = this._onMutation.event;

  constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.context = context;
    this.log = logger.child("ProjectManager");
  }

  /**
   * Initializes the project manager by discovering all projects
   */
  async initialize(): Promise<void> {
    await this.discoverProjects();

    // Restore previously selected project, or default to first
    if (this.projects.length > 0 && !this.activeProject) {
      const savedProjectId = this.context.workspaceState.get<string>(ACTIVE_PROJECT_KEY);
      const targetProject = savedProjectId
        ? this.projects.find((p) => p.id === savedProjectId)
        : null;

      await this.setActiveProject(targetProject?.id || this.projects[0].id);
    }
  }

  /**
   * Discovers Beads projects in all workspace folders
   */
  async discoverProjects(): Promise<void> {
    this.log.info("Discovering Beads projects...");

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
          this.log.info(`Found project: ${project.name} at ${project.rootPath}`);
        }
      } catch {
        // .beads directory doesn't exist in this folder, skip
      }
    }

    this.projects = discoveredProjects;
    this._onProjectsChanged.fire(this.projects);

    this.log.info(`Discovered ${this.projects.length} project(s)`);
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
      this.log.warn(`Project not found: ${projectId}`);
      return false;
    }

    // Clean up previous client
    if (this.client) {
      this.client.stopMutationWatch();
      this.client.dispose();
    }

    this.activeProject = project;

    // Save selection to workspace state
    await this.context.workspaceState.update(ACTIVE_PROJECT_KEY, project.id);

    // Create new daemon client
    this.client = new BeadsDaemonClient(project.beadsDir, {
      cwd: project.rootPath,
      expectedDb: project.dbPath,
    });

    this.log.info(`Active project set to: ${project.name}`);

    // Check if daemon is running and connect
    let needsAutoStart = false;

    if (this.client.socketExists()) {
      try {
        const health = await this.client.health();
        project.daemonStatus = health.status === "healthy" ? "running" : "stopped";
        this.log.info(`Daemon status: ${health.status} (v${health.version})`);

        // Start mutation watching for real-time updates
        this.setupMutationWatching();
      } catch (err) {
        // Socket exists but connection failed (stale socket from reboot, etc.)
        this.log.warn(`Stale socket detected, daemon not responding: ${err}`);
        project.daemonStatus = "stopped";
        needsAutoStart = true;
      }
    } else {
      project.daemonStatus = "stopped";
      needsAutoStart = true;
    }

    // Auto-start daemon if needed and configured
    if (needsAutoStart) {
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

    // Check if already running and healthy
    if (this.client?.socketExists()) {
      try {
        await this.client.health();
        this.activeProject.daemonStatus = "running";
        return true;
      } catch {
        // Socket exists but daemon not responding - try restart
        this.log.warn("Daemon socket exists but not responding, attempting restart...");
        await this.restartDaemon();
        return this.activeProject.daemonStatus === "running";
      }
    }

    // Try to start daemon
    const result = await this.startDaemonProcess();

    if (!result.success && result.notInitialized) {
      // Project has .beads directory but no database
      this.log.warn("Project not fully initialized - no database found");
      const action = await vscode.window.showWarningMessage(
        `The project "${this.activeProject.name}" has not been initialized. Run 'bd init' to set up the database.`,
        "Open Terminal",
        "Dismiss"
      );

      if (action === "Open Terminal") {
        const terminal = vscode.window.createTerminal({
          name: `Beads Init: ${this.activeProject.name}`,
          cwd: this.activeProject.rootPath,
        });
        terminal.show();
        terminal.sendText("bd init");
      }
      return false;
    }

    if (!result.success && result.alreadyRunning) {
      // Daemon claims to be running but we couldn't connect
      // This usually means zombie daemon - offer restart
      this.log.warn("Daemon reports already running but socket not accessible");
      const action = await vscode.window.showWarningMessage(
        `The daemon for "${this.activeProject.name}" appears to be in a bad state. Restart it?`,
        "Restart Daemon",
        "Cancel"
      );

      if (action === "Restart Daemon") {
        return this.restartDaemon();
      }
      return false;
    }

    return result.success;
  }

  /**
   * Starts the daemon process and waits for it to be ready
   */
  private async startDaemonProcess(): Promise<{
    success: boolean;
    alreadyRunning: boolean;
    notInitialized: boolean;
  }> {
    if (!this.activeProject) {
      return { success: false, alreadyRunning: false, notInitialized: false };
    }

    const cwd = this.activeProject.rootPath;
    this.log.info(`Starting daemon for ${this.activeProject.name}...`);

    const { spawn } = await import("child_process");
    return new Promise((resolve) => {
      const proc = spawn("bd", ["daemon", "--start"], {
        cwd,
        shell: true,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("error", (err) => {
        this.log.error(`Spawn error: ${err.message}`);
      });

      let exitCode: number | null = null;
      proc.on("exit", (code) => {
        exitCode = code;
        if (code !== 0 && code !== null) {
          this.log.error(`bd daemon --start exited with code ${code}`);
          if (stderr) {
            this.log.error(`stderr: ${stderr.trim()}`);
          }
        }
      });

      proc.unref();

      // Wait for daemon to start
      setTimeout(async () => {
        const alreadyRunning = stderr.includes("daemon already running");
        const notInitialized = stderr.includes("no database path configured") ||
                              stderr.includes("bd init");

        if (this.client?.socketExists()) {
          try {
            await this.client.health();
            this.activeProject!.daemonStatus = "running";
            this.log.info("Daemon started successfully");
            this.setupMutationWatching();
            resolve({ success: true, alreadyRunning: false, notInitialized: false });
          } catch (err) {
            this.log.errorNotify(`Daemon health check failed: ${err}`);
            resolve({ success: false, alreadyRunning, notInitialized });
          }
        } else {
          if (!alreadyRunning && !notInitialized) {
            this.log.errorNotify(
              `Daemon failed to start - socket not found at ${path.join(this.activeProject!.beadsDir, "bd.sock")}`
            );
          }
          resolve({ success: false, alreadyRunning, notInitialized });
        }
      }, 2000);
    });
  }

  /**
   * Sets up mutation watching after daemon connection
   */
  private setupMutationWatching(): void {
    if (!this.client) return;

    // Register event listeners for mutation events
    this.client.on("mutation", (mutation: MutationEvent) => {
      this.log.debug(`Mutation: ${mutation.Type} on ${mutation.IssueID}`);
      this._onMutation.fire(mutation);
      this._onDataChanged.fire();
    });

    this.client.on("disconnected", (err: Error) => {
      if (this.activeProject) {
        this.log.warn(
          `Lost connection to daemon for "${this.activeProject.name}": ${err.message}`
        );
        this.activeProject.daemonStatus = "stopped";
        this._onActiveProjectChanged.fire(this.activeProject);
        vscode.window.setStatusBarMessage("$(warning) Beads daemon disconnected", 3000);
      }
    });

    this.client.on("reconnected", () => {
      if (this.activeProject) {
        this.log.info(`Reconnected to daemon for "${this.activeProject.name}"`);
        this.activeProject.daemonStatus = "running";
        this._onActiveProjectChanged.fire(this.activeProject);
        this._onDataChanged.fire();
        vscode.window.setStatusBarMessage("$(check) Beads daemon connected", 3000);
      }
    });

    this.client.startMutationWatch(1000);
    this._onActiveProjectChanged.fire(this.activeProject);
    this._onDataChanged.fire();
  }

  /**
   * Restarts the daemon (stop + start)
   */
  async restartDaemon(): Promise<boolean> {
    if (!this.activeProject) {
      return false;
    }

    this.log.info(`Restarting daemon for ${this.activeProject.name}...`);
    await this.stopDaemon();

    // Brief pause to ensure cleanup
    await new Promise((r) => setTimeout(r, 500));

    const result = await this.startDaemonProcess();
    return result.success;
  }

  /**
   * Stops the daemon for the active project
   */
  async stopDaemon(): Promise<boolean> {
    if (!this.activeProject) {
      return false;
    }

    this.log.info(`Stopping daemon for ${this.activeProject.name}...`);

    // Stop daemon via CLI
    const { spawn } = await import("child_process");
    return new Promise((resolve) => {
      const proc = spawn("bd", ["daemon", "--stop"], {
        cwd: this.activeProject!.rootPath,
        shell: true,
      });

      proc.on("close", (code) => {
        if (code === 0) {
          this.activeProject!.daemonStatus = "stopped";
          if (this.client) {
            this.client.stopMutationWatch();
          }
          this.log.info("Daemon stopped");
          resolve(true);
        } else {
          this.log.errorNotify(`Failed to stop daemon (exit code ${code})`);
          resolve(false);
        }
      });
    });
  }

  /**
   * Detailed daemon status check with edge case detection
   */
  async getDaemonStatus(): Promise<{
    state: "running" | "stopped" | "zombie" | "not_initialized" | "unknown";
    message: string;
    details: {
      hasDatabase: boolean;
      hasSocket: boolean;
      hasPidFile: boolean;
      pidFileValue: number | null;
      processRunning: boolean;
      healthCheckPassed: boolean;
    };
  }> {
    if (!this.activeProject) {
      return {
        state: "unknown",
        message: "No active project",
        details: {
          hasDatabase: false,
          hasSocket: false,
          hasPidFile: false,
          pidFileValue: null,
          processRunning: false,
          healthCheckPassed: false,
        },
      };
    }

    const beadsDir = this.activeProject.beadsDir;
    const details = {
      hasDatabase: false,
      hasSocket: false,
      hasPidFile: false,
      pidFileValue: null as number | null,
      processRunning: false,
      healthCheckPassed: false,
    };

    // Check for database
    try {
      await fs.promises.access(path.join(beadsDir, "beads.db"));
      details.hasDatabase = true;
    } catch {
      // No database
    }

    // Check for socket
    try {
      await fs.promises.access(path.join(beadsDir, "bd.sock"));
      details.hasSocket = true;
    } catch {
      // No socket
    }

    // Check PID file
    try {
      const pidContent = await fs.promises.readFile(
        path.join(beadsDir, "daemon.pid"),
        "utf-8"
      );
      details.hasPidFile = true;
      details.pidFileValue = parseInt(pidContent.trim(), 10);

      // Check if process is actually running
      if (details.pidFileValue) {
        try {
          process.kill(details.pidFileValue, 0); // Signal 0 = check existence
          details.processRunning = true;
        } catch {
          // Process not running
        }
      }
    } catch {
      // No PID file
    }

    // Try health check if socket exists
    if (details.hasSocket && this.client) {
      try {
        await this.client.health();
        details.healthCheckPassed = true;
      } catch {
        // Health check failed
      }
    }

    // Determine state based on checks
    if (!details.hasDatabase) {
      return {
        state: "not_initialized",
        message: "Database not found. Run 'bd init' to initialize.",
        details,
      };
    }

    if (details.hasSocket && details.healthCheckPassed) {
      this.activeProject.daemonStatus = "running";
      return {
        state: "running",
        message: `Healthy (PID: ${details.pidFileValue || "unknown"})`,
        details,
      };
    }

    if (details.processRunning && !details.hasSocket) {
      // Zombie: process running but no socket
      return {
        state: "zombie",
        message: `Process running (PID: ${details.pidFileValue}) but socket missing. Daemon crashed?`,
        details,
      };
    }

    if (details.processRunning && details.hasSocket && !details.healthCheckPassed) {
      // Zombie: socket exists but health check fails
      return {
        state: "zombie",
        message: `Process running (PID: ${details.pidFileValue}) but not responding. Daemon unhealthy.`,
        details,
      };
    }

    if (details.hasPidFile && !details.processRunning) {
      // Stale PID file
      this.activeProject.daemonStatus = "stopped";
      return {
        state: "stopped",
        message: `Stale PID file (was PID: ${details.pidFileValue}). Daemon not running.`,
        details,
      };
    }

    // Clean stopped state
    this.activeProject.daemonStatus = "stopped";
    return {
      state: "stopped",
      message: "Daemon not running",
      details,
    };
  }

  /**
   * Refreshes data for the active project
   */
  async refresh(): Promise<void> {
    if (!this.activeProject || !this.client) {
      return;
    }

    // Re-check daemon status using detailed check
    const status = await this.getDaemonStatus();
    if (status.state === "running") {
      this.activeProject.daemonStatus = "running";
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

  /**
   * Centralized daemon error notification - dedupes across all callers
   * Called by views when they encounter daemon connection errors
   */
  async notifyDaemonError(err: unknown): Promise<void> {
    // Dedupe: only show one notification within time window
    const now = Date.now();
    if (now - this.lastDaemonErrorTime < BeadsProjectManager.DAEMON_ERROR_DEDUPE_MS) {
      return;
    }
    this.lastDaemonErrorTime = now;

    const projectName = this.activeProject?.name || "unknown";
    const action = await vscode.window.showErrorMessage(
      `Beads: Failed to connect to daemon for "${projectName}"`,
      "Restart Daemon",
      "Show Output"
    );

    if (action === "Restart Daemon") {
      const restarted = await this.restartDaemon();
      if (restarted) {
        vscode.window.setStatusBarMessage("$(check) Daemon restarted", 3000);
        this._onDataChanged.fire();
      } else {
        vscode.window.showErrorMessage("Failed to restart daemon");
      }
    } else if (action === "Show Output") {
      this.log.show();
    }
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
