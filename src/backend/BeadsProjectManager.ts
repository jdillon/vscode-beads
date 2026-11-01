import * as crypto from "crypto";
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import * as vscode from "vscode";
import { Logger } from "../utils/logger";
import { resolveEnvVariables } from "../utils/resolve-env-variables";
import { BeadsBackend, MIN_SUPPORTED_BD_VERSION } from "./BeadsBackend";
import { createBeadsBackend } from "./BeadsBackendFactory";
import { BeadsChangeSource } from "./beads-change-source";
import { BeadsHttpBackend } from "./beads-http-backend";
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

  private activePollTimer: NodeJS.Timeout | null = null;
  private changeSource: BeadsChangeSource | null = null;
  private activationGeneration = 0;
  private disposed = false;
  private activationError: string | null = null;
  private liveUpdateState = "periodic";

  private readonly _onLiveUpdateStateChanged = new vscode.EventEmitter<void>();
  public readonly onLiveUpdateStateChanged = this._onLiveUpdateStateChanged.event;

  getLiveUpdateState(): string { return this.liveUpdateState; }

  private invalidateData(): void {
    this.backend?.invalidateReads?.();
    this._onDataChanged.fire();
  }

  async enableEventsJournal(): Promise<void> {
    const backend = this.backend;
    const generation = this.activationGeneration;
    if (!backend?.enableEventsJournal) throw new Error("No compatible active Beads project");
    await backend.enableEventsJournal();
    if (generation === this.activationGeneration) await this.refresh();
  }

  private stopWatching(): void {
    if (this.activePollTimer) clearInterval(this.activePollTimer);
    this.activePollTimer = null;
    this.changeSource?.dispose();
    this.changeSource = null;
  }

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
      if (this.projects.length > 0) {
        await this.setActiveProject(this.projects[0].id);
      }
      this._onDataChanged.fire();
      return;
    }

    const stillExists = this.projects.some((p) => p.id === activeId);
    if (!stillExists) {
      const generation = ++this.activationGeneration;
      this.stopWatching();
      const oldBackend = this.backend;
      this.activeProject = null;
      this.backend = null;
      await oldBackend?.dispose();
      if (this.disposed || generation !== this.activationGeneration) return;
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
    const project = this.activeProject;
    const backend = this.backend;
    if (this.activationError) return { state: "stopped", message: this.activationError };
    if (!project || !backend) {
      return { state: "unknown", message: "No active project" };
    }

    const compatibility = await backend.checkCompatibility();
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
      await backend.probeLive();
    } catch (error) {
      if (this.isNotInitializedError(error)) {
        return {
          state: "not_initialized",
          message: "Beads project is not initialized. Run `bd init` in this project. See Output > Beads for details.",
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        state: "zombie",
        message,
        details: {
          beadsDir: project.beadsDir,
          detectedVersion: compatibility.detectedVersion,
          minimumVersion: compatibility.minimumVersion,
        },
      };
    }

      return {
        state: "running",
        message: compatibility.message,
        details: {
          beadsDir: project.beadsDir,
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
    if (this.disposed) return;
    this.disposed = true;
    this.activationGeneration++;
    this.stopWatching();
    const backend = this.backend;
    this.backend = null;
    void backend?.dispose().catch((error) => this.log.warn(`Backend disposal failed: ${error}`));
    this._onProjectsChanged.dispose();
    this._onActiveProjectChanged.dispose();
    this._onDataChanged.dispose();
    this._onLiveUpdateStateChanged.dispose();
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
    };
  }

  private async probeBeadsProject(
    rootPath: string,
    explicitBeadsDir?: string
  ): Promise<{ beadsDir: string } | null> {
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
        timeout: 5000,
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
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn(`Discovery probe failed: ${commandLabel} (cwd=${rootPath}): ${message}`);
      return null;
    }
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

  private syncActiveProjectPolling(): void {
    this.stopWatching();
    const project = this.activeProject;
    const backend = this.backend;
    const generation = this.activationGeneration;
    if (!project || !backend) return;
    const current = () => !this.disposed && generation === this.activationGeneration && this.backend === backend;
    const configured = vscode.workspace.getConfiguration("beads").get<number>("refreshInterval", 30000);
    const intervalMs = Number.isFinite(configured) ? Math.max(0, configured) : 30000;
    this.liveUpdateState = intervalMs === 0 ? "manual" : "periodic";
    if (intervalMs === 0) return;
    this.changeSource = new BeadsChangeSource({
      bdPath: this.getBdPath(), cwd: project.rootPath, beadsDir: project.beadsDir, log: this.log,
      ...(backend instanceof BeadsHttpBackend ? { getHttpClient: () => backend.getHttpClient() } : {}),
      onChange: () => { if (current()) this.invalidateData(); },
      onState: (state) => {
        if (!current()) return;
        const next = state === "live" ? "live" : `periodic (${state})`;
        if (this.liveUpdateState === next) return;
        this.liveUpdateState = next;
        this._onLiveUpdateStateChanged.fire();
      },
    });
    this.changeSource.start();
    // Journal events are hints: sync/restore/direct writes can bypass them.
    // Periodically restart the cursor too, since sequence numbers can reset.
    let reconciliations = 0;
    this.activePollTimer = setInterval(() => {
      if (!current()) return;
      this.invalidateData();
      if (++reconciliations % 10 === 0 && this.liveUpdateState !== "periodic (disabled)") this.changeSource?.restart();
    }, Math.max(1000, intervalMs));
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
    this.activationError = null;
    const generation = ++this.activationGeneration;
    const current = () => !this.disposed && generation === this.activationGeneration;
    this.stopWatching();
    const oldBackend = this.backend;
    this.backend = null;
    this.activeProject = project;
    await oldBackend?.dispose();
    if (!current()) return;
    if (options.persistSelection) {
      await this.context.workspaceState.update(ACTIVE_PROJECT_KEY, project.id);
      if (!current()) return;
    }
    let backend: BeadsBackend;
    try {
      backend = await createBeadsBackend({
      bdPath: this.getBdPath(), cwd: project.rootPath, beadsDir: project.beadsDir,
      log: this.log, minSupportedVersion: MIN_SUPPORTED_BD_VERSION,
      onMutation: () => { if (current()) this.invalidateData(); },
      });
    } catch (error) {
      if (!current()) return;
      this.activationError = error instanceof Error ? error.message : String(error);
      project.backendStatus = "stopped";
      this.log.warn(`Unable to activate Beads project: ${this.activationError}`);
      this._onActiveProjectChanged.fire(project);
      this._onLiveUpdateStateChanged.fire();
      this.invalidateData();
      return;
    }
    if (!current()) { await backend.dispose(); return; }
    this.backend = backend;
    project.backendStatus = "unknown";
    if (options.emitActiveProjectChanged) this._onActiveProjectChanged.fire(project);
    if (options.emitDataChanged) this.invalidateData();
    const compatibility = await backend.checkCompatibility();
    if (!current()) return;
    project.backendStatus = compatibility.supported ? "running" : "stopped";
    if (compatibility.supported) this.syncActiveProjectPolling();
  }

  private resolveBdPath(configuredPath: string): string {
    const raw = configuredPath || "bd";
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const resolvedPath = workspaceRoot && !path.isAbsolute(raw) ? path.resolve(workspaceRoot, raw) : raw;

    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }

    if (raw === "bd") {
      return raw;
    }

    this.log.warn(`Configured beads.pathToBd "${raw}" does not exist; falling back to "bd" on PATH.`);
    return "bd";
  }

  private getBdPath(): string {
    const config = vscode.workspace.getConfiguration("beads");
    const configuredBdPath = config.get<string>("pathToBd", "bd") ?? "bd";
    return this.resolveBdPath(resolveEnvVariables(configuredBdPath).trim());
  }

  private isNotInitializedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    const missingNamedDatabase = normalized.includes('database "') && normalized.includes('" not found');
    return normalized.includes("not initialized") || missingNamedDatabase;
  }
}
