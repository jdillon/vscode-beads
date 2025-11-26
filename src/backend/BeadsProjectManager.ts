/**
 * BeadsProjectManager - Project Discovery and Active Project Management
 *
 * This service handles:
 * - Discovering Beads projects in the current VS Code workspace
 * - Managing the currently active project
 * - Tracking daemon status for each project
 * - Emitting events when the active project changes
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { BeadsProject, DaemonInfo } from "./types";
import { BeadsBackend } from "./BeadsBackend";

export class BeadsProjectManager implements vscode.Disposable {
  private projects: BeadsProject[] = [];
  private activeProject: BeadsProject | null = null;
  private backend: BeadsBackend | null = null;
  private outputChannel: vscode.OutputChannel;

  private readonly _onProjectsChanged = new vscode.EventEmitter<BeadsProject[]>();
  public readonly onProjectsChanged = this._onProjectsChanged.event;

  private readonly _onActiveProjectChanged = new vscode.EventEmitter<BeadsProject | null>();
  public readonly onActiveProjectChanged = this._onActiveProjectChanged.event;

  private readonly _onDataChanged = new vscode.EventEmitter<void>();
  public readonly onDataChanged = this._onDataChanged.event;

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

    // Also check for any running daemons that might not be in the workspace
    await this.discoverDaemonProjects(discoveredProjects);

    this.projects = discoveredProjects;
    this._onProjectsChanged.fire(this.projects);

    this.outputChannel.appendLine(
      `[ProjectManager] Discovered ${this.projects.length} project(s)`
    );
  }

  /**
   * Discovers projects from running daemons that might not be in the workspace
   */
  private async discoverDaemonProjects(
    existingProjects: BeadsProject[]
  ): Promise<void> {
    // Create a temporary backend to query daemons
    const tempBackend = new BeadsBackend(
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
      this.outputChannel
    );

    const daemonsResult = await tempBackend.listDaemons();
    if (!daemonsResult.success || !daemonsResult.data) {
      return;
    }

    const existingPaths = new Set(existingProjects.map((p) => p.beadsDir));

    for (const daemon of daemonsResult.data) {
      const dbPath = daemon.database;
      if (!dbPath) {
        continue;
      }

      // Get the .beads directory from the database path
      const beadsDir = path.dirname(dbPath);
      if (existingPaths.has(beadsDir)) {
        // Update the existing project with daemon info
        const existing = existingProjects.find((p) => p.beadsDir === beadsDir);
        if (existing) {
          existing.daemonStatus = "running";
          existing.daemonPid = daemon.pid;
        }
        continue;
      }

      // This is a new project from a daemon outside the workspace
      const rootPath = daemon.working_dir || path.dirname(beadsDir);
      const project: BeadsProject = {
        id: this.generateProjectId(beadsDir),
        name: `${path.basename(rootPath)} (daemon)`,
        rootPath,
        beadsDir,
        dbPath,
        daemonStatus: "running",
        daemonPid: daemon.pid,
      };

      existingProjects.push(project);
      existingPaths.add(beadsDir);
    }
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

    // Check daemon status
    const tempBackend = new BeadsBackend(rootPath, this.outputChannel);
    const running = await tempBackend.isDaemonRunning();
    project.daemonStatus = running ? "running" : "stopped";

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
   * Gets the backend for the active project
   */
  getBackend(): BeadsBackend | null {
    return this.backend;
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

    this.activeProject = project;
    this.backend = new BeadsBackend(project.rootPath, this.outputChannel);

    this.outputChannel.appendLine(
      `[ProjectManager] Active project set to: ${project.name}`
    );

    // Check if we should auto-start the daemon
    const config = vscode.workspace.getConfiguration("beads");
    const autoStart = config.get<boolean>("autoStartDaemon", true);

    if (autoStart && project.daemonStatus !== "running") {
      await this.ensureDaemonRunning();
    }

    this._onActiveProjectChanged.fire(this.activeProject);
    this._onDataChanged.fire();

    return true;
  }

  /**
   * Ensures the daemon is running for the active project
   */
  async ensureDaemonRunning(): Promise<boolean> {
    if (!this.activeProject || !this.backend) {
      return false;
    }

    const running = await this.backend.isDaemonRunning();
    if (running) {
      this.activeProject.daemonStatus = "running";
      return true;
    }

    this.outputChannel.appendLine(
      `[ProjectManager] Starting daemon for ${this.activeProject.name}...`
    );

    const result = await this.backend.startDaemon();
    if (result.success) {
      this.activeProject.daemonStatus = "running";
      this.outputChannel.appendLine(
        `[ProjectManager] Daemon started successfully`
      );
      return true;
    }

    this.outputChannel.appendLine(
      `[ProjectManager] Failed to start daemon: ${result.error}`
    );
    return false;
  }

  /**
   * Stops the daemon for the active project
   */
  async stopDaemon(): Promise<boolean> {
    if (!this.activeProject || !this.backend) {
      return false;
    }

    const result = await this.backend.stopDaemon();
    if (result.success) {
      this.activeProject.daemonStatus = "stopped";
      return true;
    }

    return false;
  }

  /**
   * Refreshes data for the active project
   */
  async refresh(): Promise<void> {
    if (!this.activeProject) {
      return;
    }

    // Re-check daemon status
    if (this.backend) {
      const running = await this.backend.isDaemonRunning();
      this.activeProject.daemonStatus = running ? "running" : "stopped";
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
    this._onProjectsChanged.dispose();
    this._onActiveProjectChanged.dispose();
    this._onDataChanged.dispose();
  }
}
