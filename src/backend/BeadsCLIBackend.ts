import { execFile } from "child_process";
import * as util from "util";
import { Logger } from "../utils/logger";
import {
  AddCommentArgs,
  BackendCompatibility,
  BeadsBackend,
  BeadsIssue,
  CloseIssueArgs,
  CreateIssueArgs,
  DependencyArgs,
  UpdateIssueArgs,
} from "./BeadsBackend";

const execFileAsync = util.promisify(execFile);

function compareSemver(a: string, b: string): number {
  const aParts = a.split(".").map((n) => parseInt(n, 10));
  const bParts = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function detectSemver(text: string): string | undefined {
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function toStringArray(values?: string[]): string[] {
  if (!values || values.length === 0) return [];
  return values.flatMap((v) => ["--label", v]);
}

export class BeadsCLIBackend implements BeadsBackend {
  private readonly bdPath: string;
  private readonly cwd: string;
  private readonly beadsDir: string;
  private readonly log: Logger;
  private readonly minSupportedVersion: string;
  private compatibilityPromise: Promise<BackendCompatibility> | null = null;
  private readonly inFlightReads = new Map<string, Promise<unknown>>();
  private readonly recentJsonCache = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(params: {
    bdPath: string;
    cwd: string;
    beadsDir: string;
    log: Logger;
    minSupportedVersion?: string;
  }) {
    this.bdPath = params.bdPath;
    this.cwd = params.cwd;
    this.beadsDir = params.beadsDir;
    this.log = params.log.child("CLIBackend");
    this.minSupportedVersion = params.minSupportedVersion ?? "0.51.0";
  }

  async checkCompatibility(): Promise<BackendCompatibility> {
    this.compatibilityPromise ??= this.computeCompatibility();
    return this.compatibilityPromise;
  }

  async list(): Promise<BeadsIssue[]> {
    const result = await this.runReadJson(["list", "--json"], { cacheTtlMs: 750 });
    return Array.isArray(result) ? (result as BeadsIssue[]) : [];
  }

  async info(): Promise<Record<string, unknown>> {
    const result = await this.runInfo();
    if (result && typeof result === "object" && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
    return {};
  }

  async getChangeToken(): Promise<string | null> {
    return null;
  }

  async doltStatus(): Promise<string> {
    return this.runText(["dolt", "status"]);
  }

  async startDoltServer(): Promise<string> {
    return this.runText(["dolt", "start"]);
  }

  async stopDoltServer(): Promise<string> {
    return this.runText(["dolt", "stop"]);
  }

  async show(id: string): Promise<BeadsIssue | null> {
    const result = await this.runReadJson(["show", id, "--json"], { cacheTtlMs: 250 });
    if (Array.isArray(result)) {
      return (result[0] as BeadsIssue | undefined) ?? null;
    }
    return (result as BeadsIssue) ?? null;
  }

  async create(args: CreateIssueArgs): Promise<BeadsIssue> {
    const cmdArgs = [
      "create",
      "--title",
      args.title,
      "--type",
      args.issue_type ?? "task",
      "--priority",
      String(args.priority ?? 2),
      ...toStringArray(args.labels),
      "--json",
    ];

    if (args.description) cmdArgs.push("--description", args.description);
    if (args.design) cmdArgs.push("--design", args.design);
    if (args.acceptance_criteria) cmdArgs.push("--acceptance", args.acceptance_criteria);
    if (args.assignee) cmdArgs.push("--assignee", args.assignee);

    const result = await this.runJson(cmdArgs);
    return this.pickSingleIssue(result, "create");
  }

  async update(args: UpdateIssueArgs): Promise<BeadsIssue> {
    const cmdArgs = ["update", args.id, "--json"];

    if (args.title !== undefined) cmdArgs.push("--title", args.title);
    if (args.description !== undefined) cmdArgs.push("--description", args.description);
    if (args.design !== undefined) cmdArgs.push("--design", args.design);
    if (args.acceptance_criteria !== undefined) {
      cmdArgs.push("--acceptance", args.acceptance_criteria);
    }
    if (args.notes !== undefined) cmdArgs.push("--notes", args.notes);
    if (args.status !== undefined) cmdArgs.push("--status", args.status);
    if (args.priority !== undefined) cmdArgs.push("--priority", String(args.priority));
    if (args.assignee !== undefined) cmdArgs.push("--assignee", args.assignee);
    if (args.external_ref !== undefined) cmdArgs.push("--external-ref", args.external_ref);
    if (args.estimated_minutes !== undefined) {
      cmdArgs.push("--estimate", String(args.estimated_minutes));
    }
    if (args.estimate !== undefined) cmdArgs.push("--estimate", String(args.estimate));
    if (args.type !== undefined) cmdArgs.push("--type", args.type);
    if (args.issue_type !== undefined) cmdArgs.push("--type", args.issue_type);

    for (const label of args.add_labels ?? []) cmdArgs.push("--add-label", label);
    for (const label of args.remove_labels ?? []) cmdArgs.push("--remove-label", label);
    for (const label of args.set_labels ?? []) cmdArgs.push("--set-labels", label);

    const result = await this.runJson(cmdArgs);
    return this.pickSingleIssue(result, "update");
  }

  async close(args: CloseIssueArgs): Promise<BeadsIssue> {
    const cmdArgs = ["close", args.id, "--json"];
    if (args.reason) cmdArgs.push("--reason", args.reason);
    const result = await this.runJson(cmdArgs);
    return this.pickSingleIssue(result, "close");
  }

  async addDependency(args: DependencyArgs): Promise<void> {
    const depType = args.dep_type ?? "blocks";
    await this.runJson(["dep", "add", args.from_id, args.to_id, "--type", depType, "--json"]);
  }

  async removeDependency(args: DependencyArgs): Promise<void> {
    const cmdArgs = ["dep", "remove", args.from_id, args.to_id, "--json"];
    if (args.dep_type) cmdArgs.push("--type", args.dep_type);
    await this.runJson(cmdArgs);
  }

  async listComments(id: string): Promise<Array<{ id: string; author: string; text: string; created_at: string }>> {
    const result = await this.runReadJson(["comments", id, "--json"], { cacheTtlMs: 250 });
    return Array.isArray(result)
      ? (result as Array<{ id: string; author: string; text: string; created_at: string }>)
      : [];
  }

  async addComment(args: AddCommentArgs): Promise<void> {
    const cmdArgs = ["comments", "add", args.id, args.text, "--json"];
    if (args.author) cmdArgs.push("--author", args.author);
    await this.runJson(cmdArgs);
  }

  private async execBd(args: string[], maxBuffer: number): Promise<{ stdout: string; stderr: string }> {
    const commandLabel = [this.bdPath, ...args].join(" ");
    this.log.debug(`Running: ${commandLabel} (cwd=${this.cwd}, BEADS_DIR=${this.beadsDir})`);

    const startedAt = Date.now();
    const result = await execFileAsync(this.bdPath, args, {
      cwd: this.cwd,
      env: {
        ...process.env,
        BEADS_DIR: this.beadsDir,
      },
      maxBuffer,
    });

    const elapsedMs = Date.now() - startedAt;
    const stdout = result.stdout?.trim() ?? "";
    const stderr = result.stderr?.trim() ?? "";
    this.log.debug(`Completed: ${commandLabel} (${elapsedMs}ms)`);
    if (stdout) this.log.trace(`stdout: ${stdout}`);
    if (stderr) this.log.trace(`stderr: ${stderr}`);

    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  private async runJson(args: string[], recoveryAttempted = false): Promise<unknown> {
    const compatibility = await this.checkCompatibility();
    if (!compatibility.supported) {
      throw new Error(compatibility.message);
    }

    try {
      const { stdout } = await this.execBd(args, 10 * 1024 * 1024);
      const trimmed = stdout.trim();
      if (!trimmed) return [];
      return JSON.parse(trimmed);
    } catch (error) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const stderr = err.stderr?.trim() ?? "";
      const stdout = err.stdout?.trim() ?? "";
      const rawMessage = stderr || stdout || err.message;
      this.log.trace(`bd command failed: ${args.join(" ")} :: ${rawMessage}`);

      if (this.isDoltConnectionError(rawMessage)) {
        if (!recoveryAttempted) {
          const recovered = await this.tryRecoverDolt(rawMessage);
          if (recovered) {
            return this.runJson(args, true);
          }
        }

        throw new Error(
          "Beads cannot connect to the Dolt server for this project. Run `bd dolt start` and retry. See Output > Beads for details."
        );
      }

      if (this.isProjectNotInitializedError(rawMessage)) {
        throw new Error("Beads project is not initialized. Run `bd init` in this project. See Output > Beads for details.");
      }

      throw new Error(rawMessage);
    }
  }

  private async runReadJson(args: string[], options?: { cacheTtlMs?: number }): Promise<unknown> {
    const cacheKey = args.join("\u0000");
    const now = Date.now();
    const cached = this.recentJsonCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.log.trace(`Using cached result for: ${args.join(" ")}`);
      return cached.value;
    }

    const existing = this.inFlightReads.get(cacheKey);
    if (existing) {
      this.log.trace(`Joining in-flight read: ${args.join(" ")}`);
      return existing;
    }

    const promise = this.runJson(args)
      .then((result) => {
        const ttlMs = options?.cacheTtlMs ?? 0;
        if (ttlMs > 0) {
          this.recentJsonCache.set(cacheKey, {
            expiresAt: Date.now() + ttlMs,
            value: result,
          });
        }
        return result;
      })
      .finally(() => {
        this.inFlightReads.delete(cacheKey);
      });

    this.inFlightReads.set(cacheKey, promise);
    return promise;
  }

  private async runText(args: string[]): Promise<string> {
    const compatibility = await this.checkCompatibility();
    if (!compatibility.supported) {
      throw new Error(compatibility.message);
    }

    try {
      const { stdout, stderr } = await this.execBd(args, 10 * 1024 * 1024);
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();
      return output;
    } catch (error) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const stderr = err.stderr?.trim() ?? "";
      const stdout = err.stdout?.trim() ?? "";
      throw new Error(stderr || stdout || err.message);
    }
  }

  private async runInfo(): Promise<Record<string, unknown>> {
    try {
      return (await this.runJson(["info", "--json"])) as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.looksLikePlainInfoOutput(message)) {
        throw error;
      }

      this.log.debug("Falling back to plain `bd info` output parsing");
      const output = await this.runText(["info"]);
      return this.parsePlainInfo(output);
    }
  }

  private async computeCompatibility(): Promise<BackendCompatibility> {
    const version = await this.getBdVersion();
    if (!version) {
      return {
        supported: false,
        minimumVersion: this.minSupportedVersion,
        message: `Unable to detect bd version at '${this.bdPath}'.`,
      };
    }

    this.log.debug(`Using bd ${version} from ${this.bdPath}`);

    if (compareSemver(version, this.minSupportedVersion) < 0) {
      return {
        supported: false,
        detectedVersion: version,
        minimumVersion: this.minSupportedVersion,
        message: `Unsupported bd version ${version}. Requires >= ${this.minSupportedVersion}.`,
      };
    }

    return {
      supported: true,
      detectedVersion: version,
      minimumVersion: this.minSupportedVersion,
      message: `bd ${version} is compatible`,
    };
  }

  private async getBdVersion(): Promise<string | undefined> {
    const attempts: string[][] = [["version"], ["--version"]];
    for (const args of attempts) {
      try {
        const { stdout, stderr } = await this.execBd(args, 1024 * 1024);
        const version = detectSemver(`${stdout}\n${stderr}`);
        if (version) return version;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  private looksLikePlainInfoOutput(message: string): boolean {
    return message.includes("Beads Database Information") || message.includes("Issue Count:");
  }

  private parsePlainInfo(output: string): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("=") || line.startsWith("Warning:") || line.startsWith("Info:")) continue;

      const match = line.match(/^([^:]+):\s+(.+)$/);
      if (!match) continue;

      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();

      if (key === "database") info.database = value;
      if (key === "mode") info.mode = value;
      if (key === "issue count") info.issue_count = Number.parseInt(value, 10);
    }

    return info;
  }

  private pickSingleIssue(result: unknown, operation: string): BeadsIssue {
    if (Array.isArray(result)) {
      const issue = result[0] as BeadsIssue | undefined;
      if (issue) return issue;
    }
    if (result && typeof result === "object" && "id" in (result as Record<string, unknown>)) {
      return result as BeadsIssue;
    }
    throw new Error(`Unexpected JSON result from bd ${operation}`);
  }

  private isProjectNotInitializedError(message: string): boolean {
    const normalized = message.toLowerCase();
    const missingNamedDatabase = normalized.includes('database "') && normalized.includes('" not found');
    return (
      missingNamedDatabase ||
      normalized.includes("database not found on dolt server") ||
      normalized.includes("has not been initialized")
    );
  }

  private isDoltConnectionError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("dolt server auto-started but still unreachable") ||
      normalized.includes("dolt server endpoint changed") ||
      normalized.includes("connect: connection refused") ||
      normalized.includes("dolt circuit breaker is open") ||
      normalized.includes("server appears down") ||
      normalized.includes("active probe failed")
    );
  }

  private async tryRecoverDolt(rawMessage: string): Promise<boolean> {
    this.log.info(`Attempting Dolt recovery after CLI failure: ${rawMessage}`);

    try {
      const status = await this.runText(["dolt", "status"]);
      this.log.debug(`Current Dolt status before recovery: ${status}`);
    } catch (error) {
      this.log.debug(`Unable to read Dolt status before recovery: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const output = await this.runText(["dolt", "start"]);
      this.log.info(`Dolt recovery start result: ${output || "<no output>"}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return true;
    } catch (error) {
      this.log.warn(`Dolt recovery failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
