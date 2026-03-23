import { execFile } from "child_process";
import mysql from "mysql2/promise";
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
import { BeadsCommandRunner } from "./BeadsCommandRunner";

const execFileAsync = util.promisify(execFile);

interface DoltConnectionInfo {
  host: string;
  port: number;
  user: string;
  database: string;
  sharedServer: boolean;
}

interface DoltShowInfo {
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  connection_ok?: boolean;
  shared_server?: boolean;
}

type SqlRow = Record<string, unknown>;

export class BeadsDoltBackend implements BeadsBackend {
  private readonly cli: BeadsCommandRunner;
  private readonly bdPath: string;
  private readonly cwd: string;
  private readonly beadsDir: string;
  private readonly log: Logger;
  private pool: mysql.Pool | null = null;
  private connectionInfo: DoltConnectionInfo | null = null;
  private readonly inFlightReads = new Map<string, Promise<unknown>>();
  private poolPromise: Promise<mysql.Pool> | null = null;

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
    this.log = params.log.child("DoltBackend");
    this.cli = new BeadsCommandRunner(params);
  }

  async dispose(): Promise<void> {
    this.inFlightReads.clear();
    await this.resetPool();
    await this.cli.dispose();
  }

  async checkCompatibility(): Promise<BackendCompatibility> {
    return this.cli.checkCompatibility();
  }

  async probeLive(): Promise<void> {
    const pool = await this.getPool();
    await pool.query("SELECT 1");
  }

  async info(): Promise<Record<string, unknown>> {
    return this.cli.info();
  }

  async getChangeToken(): Promise<string | null> {
    try {
      const rows = await this.query<SqlRow>("SELECT dolt_hashof_db() AS token", [], false, { logLevel: "trace" });
      const token = rows[0]?.token;
      return token == null ? null : String(token);
    } catch (error) {
      this.log.trace(`Failed to read dolt_hashof_db(): ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async doltStatus(): Promise<string> {
    return this.cli.doltStatus();
  }

  async startDoltServer(): Promise<string> {
    const output = await this.cli.startDoltServer();
    await this.resetPool();
    await this.waitForServerReady();
    return output;
  }

  async stopDoltServer(): Promise<string> {
    const output = await this.cli.stopDoltServer();
    await this.resetPool();
    return output;
  }

  async list(): Promise<BeadsIssue[]> {
    return this.coalesceRead("list", async () => {
      const rows = await this.query<SqlRow>(`
        SELECT
          id,
          title,
          description,
          design,
          acceptance_criteria,
          notes,
          status,
          priority,
          issue_type,
          NULLIF(assignee, '') AS assignee,
          estimated_minutes,
          NULLIF(external_ref, '') AS external_ref,
          created_at,
          updated_at,
          closed_at
        FROM issues
        WHERE (ephemeral = 0 OR ephemeral IS NULL)
        ORDER BY updated_at DESC
      `);

      const ids = rows.map((row) => String(row.id));
      const labelsByIssue = await this.loadLabels(ids);

      return rows.map((row) => ({
        id: String(row.id),
        title: this.str(row.title),
        description: this.optionalStr(row.description),
        design: this.optionalStr(row.design),
        acceptance_criteria: this.optionalStr(row.acceptance_criteria),
        notes: this.optionalStr(row.notes),
        status: this.str(row.status),
        priority: this.num(row.priority, 4),
        issue_type: this.str(row.issue_type),
        assignee: this.optionalStr(row.assignee),
        labels: labelsByIssue.get(String(row.id)) ?? [],
        estimated_minutes: this.optionalNum(row.estimated_minutes),
        external_ref: this.optionalStr(row.external_ref),
        created_at: this.timestamp(row.created_at),
        updated_at: this.timestamp(row.updated_at),
        closed_at: this.optionalTimestamp(row.closed_at),
      } satisfies BeadsIssue));
    });
  }

  async show(id: string): Promise<BeadsIssue | null> {
    return this.coalesceRead(`show:${id}`, async () => {
      const rows = await this.query<SqlRow>(`
        SELECT
          id,
          title,
          description,
          design,
          acceptance_criteria,
          notes,
          status,
          priority,
          issue_type,
          NULLIF(assignee, '') AS assignee,
          estimated_minutes,
          NULLIF(external_ref, '') AS external_ref,
          created_at,
          updated_at,
          closed_at
        FROM issues
        WHERE id = ?
        LIMIT 1
      `, [id]);

      const row = rows[0];
      if (!row) return null;

      const [labels, dependencies, dependents, comments] = await Promise.all([
        this.loadLabels([id]),
        this.loadDependencies(id),
        this.loadDependents(id),
        this.listComments(id),
      ]);

      return {
        id: String(row.id),
        title: this.str(row.title),
        description: this.optionalStr(row.description),
        design: this.optionalStr(row.design),
        acceptance_criteria: this.optionalStr(row.acceptance_criteria),
        notes: this.optionalStr(row.notes),
        status: this.str(row.status),
        priority: this.num(row.priority, 4),
        issue_type: this.str(row.issue_type),
        assignee: this.optionalStr(row.assignee),
        labels: labels.get(id) ?? [],
        estimated_minutes: this.optionalNum(row.estimated_minutes),
        external_ref: this.optionalStr(row.external_ref),
        created_at: this.timestamp(row.created_at),
        updated_at: this.timestamp(row.updated_at),
        closed_at: this.optionalTimestamp(row.closed_at),
        dependencies,
        dependents,
        comments,
      } satisfies BeadsIssue;
    });
  }

  async create(args: CreateIssueArgs): Promise<BeadsIssue> {
    return this.cli.create(args);
  }

  async update(args: UpdateIssueArgs): Promise<BeadsIssue> {
    return this.cli.update(args);
  }

  async close(args: CloseIssueArgs): Promise<BeadsIssue> {
    return this.cli.close(args);
  }

  async addDependency(args: DependencyArgs): Promise<void> {
    await this.cli.addDependency(args);
  }

  async removeDependency(args: DependencyArgs): Promise<void> {
    await this.cli.removeDependency(args);
  }

  async listComments(id: string): Promise<Array<{ id: string; author: string; text: string; created_at: string }>> {
    return this.coalesceRead(`comments:${id}`, async () => {
      const rows = await this.query<SqlRow>(`
        SELECT CAST(id AS CHAR) AS id, author, text, created_at
        FROM comments
        WHERE issue_id = ?
        ORDER BY created_at ASC
      `, [id]);

      return rows.map((row) => ({
        id: this.str(row.id),
        author: this.str(row.author),
        text: this.str(row.text),
        created_at: this.timestamp(row.created_at),
      }));
    });
  }

  async addComment(args: AddCommentArgs): Promise<void> {
    await this.cli.addComment(args);
  }

  private async loadLabels(issueIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (issueIds.length === 0) return result;

    const rows = issueIds.length > 100
      ? await this.query<SqlRow>(
          "SELECT issue_id, label FROM labels ORDER BY issue_id, label"
        )
      : await this.query<SqlRow>(
          `SELECT issue_id, label FROM labels WHERE issue_id IN (${issueIds.map(() => "?").join(",")}) ORDER BY issue_id, label`,
          issueIds
        );

    const allowedIds = issueIds.length > 100 ? new Set(issueIds) : null;

    for (const row of rows) {
      const issueId = this.str(row.issue_id);
      if (allowedIds && !allowedIds.has(issueId)) continue;
      const labels = result.get(issueId) ?? [];
      labels.push(this.str(row.label));
      result.set(issueId, labels);
    }

    return result;
  }

  private async loadDependencies(issueId: string): Promise<BeadsIssue["dependencies"]> {
    const rows = await this.query<SqlRow>(`
      SELECT
        d.depends_on_id AS id,
        d.type AS dependency_type,
        i.issue_type,
        i.title,
        i.status,
        i.priority
      FROM dependencies d
      LEFT JOIN issues i ON i.id = d.depends_on_id
      WHERE d.issue_id = ?
      ORDER BY d.depends_on_id ASC
    `, [issueId]);

    return rows.map((row) => ({
      id: this.str(row.id),
      dependency_type: this.str(row.dependency_type),
      issue_type: this.optionalStr(row.issue_type),
      title: this.optionalStr(row.title),
      status: this.optionalStr(row.status),
      priority: this.optionalNum(row.priority),
    }));
  }

  private async loadDependents(issueId: string): Promise<BeadsIssue["dependents"]> {
    const rows = await this.query<SqlRow>(`
      SELECT
        d.issue_id AS id,
        d.type AS dependency_type,
        i.issue_type,
        i.title,
        i.status,
        i.priority
      FROM dependencies d
      LEFT JOIN issues i ON i.id = d.issue_id
      WHERE d.depends_on_id = ?
      ORDER BY d.issue_id ASC
    `, [issueId]);

    return rows.map((row) => ({
      id: this.str(row.id),
      dependency_type: this.str(row.dependency_type),
      issue_type: this.optionalStr(row.issue_type),
      title: this.optionalStr(row.title),
      status: this.optionalStr(row.status),
      priority: this.optionalNum(row.priority),
    }));
  }

  private async coalesceRead<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlightReads.get(key);
    if (existing) {
      this.log.trace(`Joining in-flight dolt read: ${key}`);
      return existing as Promise<T>;
    }

    const promise = fn().finally(() => this.inFlightReads.delete(key));
    this.inFlightReads.set(key, promise as Promise<unknown>);
    return promise;
  }

  private async query<T extends SqlRow>(
    sql: string,
    params: unknown[] = [],
    retry = true,
    options?: { logLevel?: "debug" | "trace" }
  ): Promise<T[]> {
    try {
      const pool = await this.getPool();
      const logLevel = options?.logLevel ?? "debug";
      const logMessage = `Running Dolt SQL: ${this.formatSqlForLog(sql)}${params.length > 0 ? ` [params:${params.length}]` : ""}`;
      if (logLevel === "trace") {
        this.log.trace(logMessage);
      } else {
        this.log.debug(logMessage);
      }
      if (params.length > 0) {
        this.log.trace(`Dolt SQL params: ${JSON.stringify(params)}`);
      }
      const startedAt = Date.now();
      const [rows] = await pool.query(sql, params);
      const completionMessage = `Dolt query completed (${Date.now() - startedAt}ms)`;
      if (logLevel === "trace") {
        this.log.trace(completionMessage);
      } else {
        this.log.debug(completionMessage);
      }
      return rows as T[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.trace(`Dolt query failed: ${message}`);
      if (retry && this.isConnectionError(message)) {
        await this.resetPool();
        await this.startDoltServer();
        return this.query<T>(sql, params, false);
      }
      throw error;
    }
  }

  private async getPool(): Promise<mysql.Pool> {
    if (this.pool) {
      return this.pool;
    }

    if (this.poolPromise) {
      return this.poolPromise;
    }

    this.poolPromise = (async () => {
      const info = await this.getConnectionInfo();
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }
      this.connectionInfo = info;
      const pool = mysql.createPool({
        host: info.host,
        port: info.port,
        user: info.user,
        database: info.database,
        connectionLimit: 1,
        maxIdle: 1,
        idleTimeout: 60000,
        waitForConnections: true,
        dateStrings: true,
        enableKeepAlive: true,
      });
      await pool.query("SELECT 1");
      this.pool = pool;
      const mode = info.sharedServer ? "shared" : "per-project";
      this.log.info(`Connected to Dolt SQL at ${info.host}:${info.port}/${info.database} (${mode} server)`);
      return pool;
    })();

    try {
      return await this.poolPromise;
    } finally {
      this.poolPromise = null;
    }
  }

  private async getConnectionInfo(): Promise<DoltConnectionInfo> {
    const statusOutput = await this.ensureServerRunning();
    const showInfo = await this.getDoltShowInfo();

    const port = this.extractNumber(statusOutput, /Port:\s*(\d+)/);
    const host = showInfo.host ?? "127.0.0.1";
    const user = showInfo.user ?? "root";
    const database = showInfo.database;

    if (!database || !port) {
      throw new Error(`Unable to determine Dolt connection details. status=${statusOutput} show=${JSON.stringify(showInfo)}`);
    }

    return { host, port, user, database, sharedServer: showInfo.shared_server === true };
  }

  private async ensureServerRunning(): Promise<string> {
    const status = await this.cli.doltStatus();
    const running = /Dolt server:\s*running/i.test(status);
    const port = this.extractNumber(status, /Port:\s*(\d+)/);
    if (running && port && port > 0) {
      return status;
    }

    await this.cli.startDoltServer();
    return this.waitForServerReady();
  }

  private async waitForServerReady(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const status = await this.cli.doltStatus();
      const running = /Dolt server:\s*running/i.test(status);
      const port = this.extractNumber(status, /Port:\s*(\d+)/);
      if (running && port && port > 0) {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const status = await this.cli.doltStatus();
    throw new Error(`Dolt server did not become ready: ${status}`);
  }

  private async execBdText(args: string[]): Promise<string> {
    const { stdout, stderr } = await execFileAsync(this.bdPath, args, {
      cwd: this.cwd,
      env: {
        ...process.env,
        BEADS_DIR: this.beadsDir,
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();
  }

  private async execBdJson<T>(args: string[]): Promise<T> {
    try {
      const { stdout, stderr } = await execFileAsync(this.bdPath, args, {
        cwd: this.cwd,
        env: {
          ...process.env,
          BEADS_DIR: this.beadsDir,
        },
        maxBuffer: 10 * 1024 * 1024,
      });

      const trimmedStdout = stdout.trim();
      const trimmedStderr = stderr.trim();
      if (trimmedStderr) {
        this.log.trace(`bd ${args.join(" ")} stderr: ${trimmedStderr}`);
      }
      if (!trimmedStdout) {
        throw new Error(`No JSON output from bd ${args.join(" ")}`);
      }
      return JSON.parse(trimmedStdout) as T;
    } catch (error) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const stderr = err.stderr?.trim() ?? "";
      const stdout = err.stdout?.trim() ?? "";
      const rawMessage = stderr || stdout || err.message;
      this.log.trace(`bd ${args.join(" ")} failed: ${rawMessage}`);
      throw new Error(rawMessage);
    }
  }

  private async getDoltShowInfo(): Promise<DoltShowInfo> {
    return this.execBdJson<DoltShowInfo>(["dolt", "show", "--json"]);
  }

  private async resetPool(): Promise<void> {
    this.poolPromise = null;
    if (this.pool) {
      await this.pool.end();
    }
    this.pool = null;
    this.connectionInfo = null;
  }

  private sameConnectionInfo(a: DoltConnectionInfo, b: DoltConnectionInfo): boolean {
    return a.host === b.host && a.port === b.port && a.user === b.user && a.database === b.database;
  }

  private isConnectionError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("connect econnrefused") ||
      normalized.includes("connection refused") ||
      normalized.includes("closed state") ||
      normalized.includes("connection lost") ||
      normalized.includes("server closed the connection")
    );
  }

  private extractString(text: string, pattern: RegExp): string | null {
    const match = text.match(pattern);
    return match?.[1] ?? null;
  }

  private extractNumber(text: string, pattern: RegExp): number | null {
    const value = this.extractString(text, pattern);
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatSqlForLog(sql: string): string {
    return sql.replace(/\s+/g, " ").trim();
  }

  private str(value: unknown): string {
    return value == null ? "" : String(value);
  }

  private optionalStr(value: unknown): string | undefined {
    const str = this.str(value).trim();
    return str.length > 0 ? str : undefined;
  }

  private num(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private optionalNum(value: unknown): number | undefined {
    if (value == null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private timestamp(value: unknown): string {
    return this.str(value);
  }

  private optionalTimestamp(value: unknown): string | undefined {
    return this.optionalStr(value);
  }
}
