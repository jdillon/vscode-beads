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
  private readonly log: Logger;
  private readonly minSupportedVersion: string;

  constructor(params: {
    bdPath: string;
    cwd: string;
    log: Logger;
    minSupportedVersion?: string;
  }) {
    this.bdPath = params.bdPath;
    this.cwd = params.cwd;
    this.log = params.log.child("CLIBackend");
    this.minSupportedVersion = params.minSupportedVersion ?? "0.51.0";
  }

  async checkCompatibility(): Promise<BackendCompatibility> {
    const version = await this.getBdVersion();
    if (!version) {
      return {
        supported: false,
        minimumVersion: this.minSupportedVersion,
        message: `Unable to detect bd version at '${this.bdPath}'.`,
      };
    }

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

  async list(): Promise<BeadsIssue[]> {
    const result = await this.runJson(["list", "--json"]);
    return Array.isArray(result) ? (result as BeadsIssue[]) : [];
  }

  async info(): Promise<Record<string, unknown>> {
    const result = await this.runJson(["info", "--json"]);
    if (result && typeof result === "object" && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
    return {};
  }

  async show(id: string): Promise<BeadsIssue | null> {
    const result = await this.runJson(["show", id, "--json"]);
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

  async listComments(id: string): Promise<Array<{ id: number; author: string; text: string; created_at: string }>> {
    const result = await this.runJson(["comments", id, "--json"]);
    return Array.isArray(result)
      ? (result as Array<{ id: number; author: string; text: string; created_at: string }>)
      : [];
  }

  async addComment(args: AddCommentArgs): Promise<void> {
    const cmdArgs = ["comments", "add", args.id, args.text, "--json"];
    if (args.author) cmdArgs.push("--author", args.author);
    await this.runJson(cmdArgs);
  }

  private async runJson(args: string[]): Promise<unknown> {
    const compatibility = await this.checkCompatibility();
    if (!compatibility.supported) {
      throw new Error(compatibility.message);
    }

    try {
      const { stdout } = await execFileAsync(this.bdPath, args, {
        cwd: this.cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      const trimmed = stdout.trim();
      if (!trimmed) return [];
      return JSON.parse(trimmed);
    } catch (error) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const stderr = err.stderr?.trim() ?? "";
      const stdout = err.stdout?.trim() ?? "";
      const rawMessage = stderr || stdout || err.message;
      this.log.warn(`bd command failed: ${args.join(" ")} :: ${rawMessage}`);

      if (this.isProjectNotInitializedError(rawMessage)) {
        throw new Error("Beads project is not initialized. Run `bd init` in this project.");
      }

      throw new Error(rawMessage);
    }
  }

  private async getBdVersion(): Promise<string | undefined> {
    const attempts: string[][] = [["version"], ["--version"]];
    for (const args of attempts) {
      try {
        const { stdout, stderr } = await execFileAsync(this.bdPath, args, {
          cwd: this.cwd,
          maxBuffer: 1024 * 1024,
        });
        const version = detectSemver(`${stdout}\n${stderr}`);
        if (version) return version;
      } catch {
        continue;
      }
    }
    return undefined;
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
    return (
      normalized.includes("failed to open database") ||
      normalized.includes("database \"beads\" not found") ||
      normalized.includes("database not found on dolt server") ||
      normalized.includes("has not been initialized")
    );
  }
}
