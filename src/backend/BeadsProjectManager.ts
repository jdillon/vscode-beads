import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Logger } from "../utils/logger";
import { BeadsBackend } from "./BeadsBackend";
import { BeadsCLIBackend } from "./BeadsCLIBackend";
import { BeadsProject } from "./types";

const ACTIVE_PROJECT_KEY = "beads.activeProjectId";

type DaemonStatusState = "running" | "stopped" | "zombie" | "not_initialized" | "unknown";

export class BeadsProjectManager implements vscode.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly log: Logger;
  private projects: BeadsProject[] = [];
  private activeProject: BeadsProject | null = null;
  private backend: BeadsBackend | null = null;

  private readonly projectWatchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly projectRefreshTimers = new Map<string, NodeJS.Timeout>();
  private readonly discoveryWatchers: vscode.Disposable[] = [];
  private activePollTimer: NodeJS.Timeout | null = null;

  private readonly _onProjectsChanged = new vscode.EventEmitter<BeadsProject[]>();
  public readonly onProjectsChanged = this._onProjectsChanged.event;

  private readonly _onActiveProjectChanged = new vscode.EventEmitter<BeadsProject | null>();
  public readonly onActiveProjectChanged = this._onActiveProjectChanged.event;

  private readonly _onDataChanged = new vscode.EventEmitter<void>();
  public readonly onDataChanged = this._onDataChanged.event;

  constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.context = context;
    this.log = logger.child("ProjectManager");
  }

  async initialize(): Promise<void> {
    await this.discoverProjects();
    this.setupDiscoveryWatchers();

    if (this.projects.length > 0 && !this.activeProject) {
      const savedProjectId = this.context.workspaceState.get<string>(ACTIVE_PROJECT_KEY);
      const targetProject = savedProjectId
        ? this.projects.find((p) => p.id === savedProjectId)
        : undefined;
      await this.setActiveProject(targetProject?.id ?? this.projects[0].id);
    }
  }

  async discoverProjects(): Promise<void> {
    const discoveredById = new Map<string, BeadsProject>();

    for (const explicitPath of this.getConfiguredProjectPaths()) {
      const project = await this.createProjectFromInputPath(explicitPath, "setting");
      if (project) discoveredById.set(project.id, project);
    }

    const envBeadsDir = process.env.BEADS_DIR?.trim();
    if (envBeadsDir) {
      const project = await this.createProjectFromInputPath(envBeadsDir, "env");
      if (project) discoveredById.set(project.id, project);
    }

    const depth = Math.max(0, vscode.workspace.getConfiguration("beads").get<number>("discoveryDepth", 1));
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const roots = await this.getCandidateRoots(folder.uri.fsPath, depth);
      for (const root of roots) {
        const project = await this.createProjectFromInputPath(root, "workspace");
        if (project) discoveredById.set(project.id, project);
      }
    }

    const discoveredProjects = Array.from(discoveredById.values()).sort((a, b) => a.name.localeCompare(b.name));
    this.projects = discoveredProjects;
    this._onProjectsChanged.fire(this.projects);
    this.syncProjectWatchers();
  }

  getProjects(): BeadsProject[] {
    return this.projects;
  }

  getActiveProject(): BeadsProject | null {
    return this.activeProject;
  }

  getBackend(): BeadsBackend | null {
    return this.backend;
  }

  getClient(): BeadsBackend | null {
    return this.backend;
  }

  async setActiveProject(projectId: string): Promise<boolean> {
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return false;

    this.activeProject = project;
    await this.context.workspaceState.update(ACTIVE_PROJECT_KEY, project.id);

    const config = vscode.workspace.getConfiguration("beads");
    const bdPath = config.get<string>("pathToBd", "bd");

    this.backend = new BeadsCLIBackend({
      bdPath,
      cwd: project.rootPath,
      log: this.log,
      minSupportedVersion: "0.51.0",
    });

    const compatibility = await this.backend.checkCompatibility();
    if (compatibility.supported) {
      try {
        await this.backend.info();
        project.daemonStatus = "running";
      } catch (error) {
        project.daemonStatus = this.isNotInitializedError(error) ? "stopped" : "unknown";
      }
    } else {
      project.daemonStatus = "stopped";
    }

    this._onActiveProjectChanged.fire(project);
    this.syncActiveProjectPolling();
    this._onDataChanged.fire();
    return true;
  }

  async refresh(): Promise<void> {
    await this.discoverProjects();

    const activeId = this.activeProject?.id;
    if (!activeId) {
      this._onDataChanged.fire();
      return;
    }

    const stillExists = this.projects.some((p) => p.id === activeId);
    if (!stillExists) {
      this.activeProject = null;
      this.backend = null;
      this._onActiveProjectChanged.fire(null);
    }

    this._onDataChanged.fire();
  }

  async ensureDaemonRunning(): Promise<boolean> {
    await this.refresh();
    return this.backend !== null;
  }

  async stopDaemon(): Promise<boolean> {
    return true;
  }

  async restartDaemon(): Promise<boolean> {
    await this.refresh();
    return this.backend !== null;
  }

  async getDaemonStatus(): Promise<{ state: DaemonStatusState; message: string; details?: Record<string, unknown> }> {
    if (!this.activeProject || !this.backend) {
      return { state: "unknown", message: "No active project" };
    }

    const compatibility = await this.backend.checkCompatibility();
    if (!compatibility.supported) {
      return {
        state: "stopped",
        message: compatibility.message,
        details: {
          detectedVersion: compatibility.detectedVersion,
          minimumVersion: compatibility.minimumVersion,
        },
      };
    }

    try {
      await this.backend.info();
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return {
          state: "not_initialized",
          message: "Beads project is not initialized. Run `bd init` in this project.",
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      return { state: "unknown", message };
    }

    return {
      state: "running",
      message: compatibility.message,
      details: {
        beadsDir: this.activeProject.beadsDir,
        watchMode: this.activeProject.storageMode,
      },
    };
  }

  async showProjectPicker(): Promise<BeadsProject | undefined> {
    if (this.projects.length === 0) {
      vscode.window.showWarningMessage("No Beads projects found. Initialize a project with `bd init` first.");
      return undefined;
    }

    const items = this.projects.map((project) => ({
      label: project.name,
      description: project.rootPath,
      detail: `${project.storageMode ?? "embedded"} mode`,
      project,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a Beads project",
      title: "Switch Beads Project",
    });

    if (!selected) return undefined;
    await this.setActiveProject(selected.project.id);
    return selected.project;
  }

  async notifyDaemonError(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.log.warn(`Backend error: ${message}`);
  }

  dispose(): void {
    for (const watcher of this.projectWatchers.values()) watcher.dispose();
    for (const watcher of this.discoveryWatchers) watcher.dispose();
    for (const timer of this.projectRefreshTimers.values()) clearTimeout(timer);
    this.projectWatchers.clear();
    this.discoveryWatchers.length = 0;
    this.projectRefreshTimers.clear();
    if (this.activePollTimer) {
      clearInterval(this.activePollTimer);
      this.activePollTimer = null;
    }
    this._onProjectsChanged.dispose();
    this._onActiveProjectChanged.dispose();
    this._onDataChanged.dispose();
  }

  private getConfiguredProjectPaths(): string[] {
    const config = vscode.workspace.getConfiguration("beads");
    const configured = config.get<string[]>("projects", []);
    return configured.filter((value) => typeof value === "string" && value.trim().length > 0);
  }

  private async getCandidateRoots(workspaceRoot: string, depth: number): Promise<string[]> {
    const roots = [workspaceRoot];
    if (depth <= 0) return roots;

    try {
      const children = await fs.promises.readdir(workspaceRoot, { withFileTypes: true });
      for (const child of children) {
        if (child.isDirectory()) roots.push(path.join(workspaceRoot, child.name));
      }
    } catch {
      // Ignore unreadable workspace roots.
    }

    return roots;
  }

  private async createProjectFromInputPath(inputPath: string, source: BeadsProject["source"]): Promise<BeadsProject | null> {
    const resolvedInput = path.resolve(inputPath);
    const stats = await this.tryStat(resolvedInput);
    if (!stats) return null;

    const explicitBeadsDir = path.basename(resolvedInput) === ".beads" ? resolvedInput : path.join(resolvedInput, ".beads");
    const beadsStats = await this.tryStat(explicitBeadsDir);
    if (!beadsStats?.isDirectory()) return null;

    const resolvedBeadsDir = await this.resolveBeadsDir(explicitBeadsDir);
    if (!(await this.isBeadsProject(resolvedBeadsDir))) return null;

    const rootPath = path.basename(resolvedInput) === ".beads" ? path.dirname(resolvedInput) : resolvedInput;
    const folderName = path.basename(rootPath) || rootPath;

    return {
      id: this.generateProjectId(resolvedBeadsDir),
      name: folderName,
      rootPath,
      beadsDir: resolvedBeadsDir,
      daemonStatus: "running",
      source,
      storageMode: await this.detectStorageMode(resolvedBeadsDir),
    };
  }

  private async resolveBeadsDir(initialBeadsDir: string): Promise<string> {
    const redirectPath = path.join(initialBeadsDir, "redirect");
    try {
      const content = (await fs.promises.readFile(redirectPath, "utf8")).trim();
      if (!content) return initialBeadsDir;
      return path.resolve(initialBeadsDir, content);
    } catch {
      return initialBeadsDir;
    }
  }

  private async isBeadsProject(beadsDir: string): Promise<boolean> {
    if (await this.pathExists(path.join(beadsDir, "metadata.json"))) return true;
    if (await this.pathExists(path.join(beadsDir, "config.yaml"))) return true;

    const doltStats = await this.tryStat(path.join(beadsDir, "dolt"));
    if (doltStats?.isDirectory()) return true;

    try {
      const entries = await fs.promises.readdir(beadsDir);
      return entries.some((entry) => entry.endsWith(".db"));
    } catch {
      return false;
    }
  }

  private async detectStorageMode(beadsDir: string): Promise<"embedded" | "server"> {
    const metadataPath = path.join(beadsDir, "metadata.json");
    try {
      const raw = await fs.promises.readFile(metadataPath, "utf8");
      const metadata = JSON.parse(raw) as { dolt_mode?: string; backend?: string };
      if (metadata.dolt_mode === "server") return "server";
      if (metadata.backend === "sqlite") return "embedded";
    } catch {
      // Ignore parse failures and default to embedded.
    }
    return "embedded";
  }

  private generateProjectId(beadsDir: string): string {
    return crypto.createHash("sha256").update(beadsDir).digest("hex").slice(0, 12);
  }

  private syncProjectWatchers(): void {
    const validIds = new Set(this.projects.map((p) => p.id));

    for (const [projectId, watcher] of this.projectWatchers.entries()) {
      if (validIds.has(projectId)) continue;
      watcher.dispose();
      this.projectWatchers.delete(projectId);
      const timer = this.projectRefreshTimers.get(projectId);
      if (timer) clearTimeout(timer);
      this.projectRefreshTimers.delete(projectId);
    }

    for (const project of this.projects) {
      if (this.projectWatchers.has(project.id)) continue;
      const pattern = new vscode.RelativePattern(project.beadsDir, "**/*");
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onFileEvent = (uri: vscode.Uri) => this.onProjectFileChange(project.id, uri.fsPath);

      watcher.onDidCreate(onFileEvent);
      watcher.onDidChange(onFileEvent);
      watcher.onDidDelete(onFileEvent);

      this.projectWatchers.set(project.id, watcher);
    }
  }

  private setupDiscoveryWatchers(): void {
    for (const watcher of this.discoveryWatchers) watcher.dispose();
    this.discoveryWatchers.length = 0;

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const metadataWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, "**/.beads/metadata.json")
      );
      metadataWatcher.onDidCreate(() => this.scheduleRediscovery());
      metadataWatcher.onDidDelete(() => this.scheduleRediscovery());

      const configWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, "**/.beads/config.yaml")
      );
      configWatcher.onDidCreate(() => this.scheduleRediscovery());
      configWatcher.onDidDelete(() => this.scheduleRediscovery());

      this.discoveryWatchers.push(metadataWatcher, configWatcher);
    }
  }

  private onProjectFileChange(projectId: string, filePath: string): void {
    if (!this.shouldTriggerRefresh(filePath)) return;

    const existing = this.projectRefreshTimers.get(projectId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.projectRefreshTimers.delete(projectId);
      if (this.activeProject?.id === projectId) {
        this._onDataChanged.fire();
      }
    }, 500);

    this.projectRefreshTimers.set(projectId, timer);
  }

  private shouldTriggerRefresh(filePath: string): boolean {
    const fileName = path.basename(filePath);
    const normalizedPath = filePath.split(path.sep).join("/");

    if (normalizedPath.includes("/.beads/dolt/")) {
      const ignoredDoltFiles = new Set(["LOCK", "log.txt"]);
      return !ignoredDoltFiles.has(fileName);
    }

    const definitiveFiles = new Set([
      "metadata.json",
      "config.yaml",
      "redirect",
      "interactions.jsonl",
      "dolt-server.port",
      "dolt-server.activity",
    ]);
    if (definitiveFiles.has(fileName)) return true;

    const ignoredFiles = new Set([
      ".DS_Store",
      "dolt-server.log",
      "dolt-server.pid",
      "dolt-monitor.pid",
      "dolt-server.lock",
      ".local_version",
      ".gitignore",
    ]);

    if (ignoredFiles.has(fileName)) return false;
    if (filePath.includes(`${path.sep}.git${path.sep}`)) return false;
    return false;
  }

  private syncActiveProjectPolling(): void {
    if (this.activePollTimer) {
      clearInterval(this.activePollTimer);
      this.activePollTimer = null;
    }

    const project = this.activeProject;
    if (!project || project.storageMode !== "server") return;

    const intervalMs = Math.max(
      0,
      vscode.workspace.getConfiguration("beads").get<number>("refreshInterval", 30000)
    );
    if (intervalMs === 0) return;

    this.activePollTimer = setInterval(() => {
      if (this.activeProject?.id === project.id) {
        this._onDataChanged.fire();
      }
    }, intervalMs);
  }

  private scheduleRediscovery(): void {
    const existing = this.projectRefreshTimers.get("__discovery__");
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      this.projectRefreshTimers.delete("__discovery__");
      await this.discoverProjects();
      this._onDataChanged.fire();
    }, 500);
    this.projectRefreshTimers.set("__discovery__", timer);
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async tryStat(target: string): Promise<fs.Stats | null> {
    try {
      return await fs.promises.stat(target);
    } catch {
      return null;
    }
  }

  private isNotInitializedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    return normalized.includes("not initialized") || normalized.includes("failed to open database");
  }
}
