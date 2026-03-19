import * as crypto from "crypto";
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import * as vscode from "vscode";
import { Logger } from "../utils/logger";
import { BeadsBackend } from "./BeadsBackend";
import { BeadsCLIBackend } from "./BeadsCLIBackend";
import { BeadsProject } from "./types";

const ACTIVE_PROJECT_KEY = "beads.activeProjectId";
const execFileAsync = util.promisify(execFile);

type BackendStatusState = "running" | "stopped" | "zombie" | "not_initialized" | "unknown";

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

    const configuredProjects = await Promise.all(
      this.getConfiguredProjectPaths().map((explicitPath) => this.createProjectFromInputPath(explicitPath, "setting"))
    );
    for (const project of configuredProjects) {
      if (project && !discoveredById.has(project.id)) discoveredById.set(project.id, project);
    }

    const envBeadsDir = process.env.BEADS_DIR?.trim();
    if (envBeadsDir) {
      const project = await this.createProjectFromInputPath(envBeadsDir, "env");
      if (project && !discoveredById.has(project.id)) discoveredById.set(project.id, project);
    }

    const workspaceProjects = await Promise.all(
      (vscode.workspace.workspaceFolders ?? []).map((folder) => this.createProjectFromInputPath(folder.uri.fsPath, "workspace"))
    );
    for (const project of workspaceProjects) {
      if (project && !discoveredById.has(project.id)) discoveredById.set(project.id, project);
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
    let project = this.projects.find((p) => p.id === projectId);
    if (!project) {
      this.log.warn(`Project ${projectId} not found in current cache; rediscovering.`);
      await this.discoverProjects();
      project = this.projects.find((p) => p.id === projectId);
    }

    if (!project) {
      this.log.warn(`Project ${projectId} still not found after rediscovery.`);
      return false;
    }

    this.log.info(`Switching active project to ${project.name} (${project.id})`);

    await this.activateProject(project, { emitActiveProjectChanged: true, persistSelection: true, emitDataChanged: false });
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
      this._onDataChanged.fire();
      return;
    }

    const activeProject = this.projects.find((project) => project.id === activeId);
    if (activeProject) {
      await this.activateProject(activeProject, {
        emitActiveProjectChanged: false,
        persistSelection: false,
        emitDataChanged: true,
      });
    }
  }

  async getBackendStatus(): Promise<{ state: BackendStatusState; message: string; details?: Record<string, unknown> }> {
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

  async notifyBackendError(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.log.trace(`Backend error: ${message}`);
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

  private async createProjectFromInputPath(inputPath: string, source: BeadsProject["source"]): Promise<BeadsProject | null> {
    const resolvedInput = path.resolve(inputPath);
    const stats = await this.tryStat(resolvedInput);
    if (!stats) return null;

    const rootPath = path.basename(resolvedInput) === ".beads" ? path.dirname(resolvedInput) : resolvedInput;
    const explicitBeadsDir = path.basename(resolvedInput) === ".beads" ? resolvedInput : undefined;
    const projectProbe = await this.probeBeadsProject(rootPath, explicitBeadsDir);
    if (!projectProbe) return null;

    const folderName = this.getProjectDisplayName(rootPath, projectProbe.beadsDir);

    return {
      id: this.generateProjectId(projectProbe.beadsDir),
      name: folderName,
      rootPath,
      beadsDir: projectProbe.beadsDir,
      backendStatus: "running",
      source,
      storageMode: projectProbe.storageMode,
    };
  }

  private async probeBeadsProject(
    rootPath: string,
    explicitBeadsDir?: string
  ): Promise<{ beadsDir: string; storageMode: "embedded" | "server" } | null> {
    const bdPath = this.getBdPath();
    const commandLabel = `${bdPath} where`;

    try {
      const env = {
        ...process.env,
        ...(explicitBeadsDir ? { BEADS_DIR: explicitBeadsDir } : {}),
      };

      this.log.debug(
        `Running discovery probe: ${commandLabel} (cwd=${rootPath}${explicitBeadsDir ? `, BEADS_DIR=${explicitBeadsDir}` : ""})`
      );
      const startedAt = Date.now();

      const { stdout } = await execFileAsync(bdPath, ["where"], {
        cwd: rootPath,
        env,
        maxBuffer: 1024 * 1024,
      });
      const elapsedMs = Date.now() - startedAt;
      this.log.debug(`Completed discovery probe: ${commandLabel} (${elapsedMs}ms)`);
      const trimmedStdout = stdout.trim();
      if (trimmedStdout) this.log.trace(`discovery stdout: ${trimmedStdout}`);

      const beadsDirLine = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      if (!beadsDirLine) return null;

      const beadsDir = path.resolve(rootPath, beadsDirLine);
      return {
        beadsDir,
        storageMode: await this.detectStorageMode(beadsDir),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.trace(`Discovery probe failed for ${rootPath}: ${message}`);
      return null;
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

  private getProjectDisplayName(rootPath: string, beadsDir: string): string {
    const workspaceName = path.basename(rootPath) || rootPath;
    const canonicalRepoName = path.basename(path.dirname(beadsDir));

    if (!canonicalRepoName || canonicalRepoName === workspaceName) {
      return workspaceName;
    }

    return `${canonicalRepoName} (${workspaceName})`;
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

      const beadsRootWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, "**/.beads"));
      beadsRootWatcher.onDidCreate(() => this.scheduleRediscovery());
      beadsRootWatcher.onDidDelete(() => this.scheduleRediscovery());

      this.discoveryWatchers.push(metadataWatcher, configWatcher, beadsRootWatcher);
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
      if (normalizedPath.includes("/.dolt/noms/")) {
        const ignoredNomsFiles = new Set(["LOCK", "manifest"]);
        return !ignoredNomsFiles.has(fileName);
      }
      return false;
    }

    const definitiveFiles = new Set([
      "metadata.json",
      "config.yaml",
      "redirect",
      "interactions.jsonl",
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
      vscode.workspace.getConfiguration("beads").get<number>("refreshInterval", 0)
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

  private async tryStat(target: string): Promise<fs.Stats | null> {
    try {
      return await fs.promises.stat(target);
    } catch {
      return null;
    }
  }

  private async activateProject(
    project: BeadsProject,
    options: { emitActiveProjectChanged: boolean; persistSelection: boolean; emitDataChanged: boolean }
  ): Promise<void> {
    this.activeProject = project;

    if (options.persistSelection) {
      await this.context.workspaceState.update(ACTIVE_PROJECT_KEY, project.id);
    }

    const bdPath = this.getBdPath();

    this.backend = new BeadsCLIBackend({
      bdPath,
      cwd: project.rootPath,
      beadsDir: project.beadsDir,
      log: this.log,
      minSupportedVersion: "0.51.0",
    });

    project.backendStatus = "unknown";

    if (options.emitActiveProjectChanged) {
      this._onActiveProjectChanged.fire(project);
    }

    this.syncActiveProjectPolling();

    if (options.emitDataChanged) {
      this._onDataChanged.fire();
    }

    const compatibility = await this.backend.checkCompatibility();
    project.backendStatus = compatibility.supported ? "running" : "stopped";
  }

  private resolveBdPath(configuredPath: string): string {
    const raw = configuredPath || "bd";
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const resolvedPath = workspaceRoot && !path.isAbsolute(raw) ? path.resolve(workspaceRoot, raw) : raw;

    if (resolvedPath !== raw && fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }

    if (path.isAbsolute(raw) || raw === "bd") {
      return raw;
    }

    return fs.existsSync(raw) ? raw : "bd";
  }

  private getBdPath(): string {
    const config = vscode.workspace.getConfiguration("beads");
    const configuredBdPath = config.get<string>("pathToBd", "bd") ?? "bd";
    return this.resolveBdPath(configuredBdPath.trim());
  }

  private isNotInitializedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    const missingNamedDatabase = normalized.includes('database "') && normalized.includes('" not found');
    return normalized.includes("not initialized") || missingNamedDatabase;
  }
}
