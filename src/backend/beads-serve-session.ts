import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { BeadsHttpClient, BeadsHttpError, objectBody } from "./beads-http-client";

export interface BeadsServeOptions {
  bdPath: string;
  cwd: string;
  beadsDir: string;
  expectedProjectId?: string;
  expectedDatabase?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export class BeadsServeSession {
  private child?: ChildProcessWithoutNullStreams;
  private client?: BeadsHttpClient;
  private pending?: Promise<BeadsHttpClient>;
  private disposed = false;
  private cancelStartup?: () => void;
  private identity?: { projectId: string; database: string };

  constructor(private readonly options: BeadsServeOptions) {}

  getClient(): Promise<BeadsHttpClient> {
    if (this.disposed) return Promise.reject(new BeadsHttpError(0, "cancelled"));
    if (this.pending) return this.pending;
    if (this.client) return Promise.resolve(this.client);
    this.pending ??= this.start().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.cancelStartup?.();
    this.client?.dispose();
    this.client = undefined;
    await this.stopChild();
  }

  private async start(): Promise<BeadsHttpClient> {
    const child = spawn(this.options.bdPath, ["serve", "--addr", "127.0.0.1:0"], {
      cwd: this.options.cwd,
      env: { ...process.env, BEADS_DIR: this.options.beadsDir },
      shell: false,
      stdio: "pipe",
    });
    this.child = child;
    child.on("error", () => { client?.dispose(); });
    let client: BeadsHttpClient | undefined;
    // Classify startup refusals without echoing diagnostics that can contain DSNs.
    let diagnostics = "";
    child.stderr.on("data", (chunk: Buffer) => {
      diagnostics = (diagnostics + chunk.toString("utf8")).slice(-16384);
    });
    child.once("exit", () => {
      client?.dispose();
      if (this.child === child) {
        this.child = undefined;
        this.client = undefined;
      }
    });
    try {
      const address = await new Promise<string>((resolve, reject) => {
        let buffer = "";
        const finish = (error?: Error, url?: string) => {
          clearTimeout(timer);
          child.stdout.removeListener("data", onData);
          child.removeListener("error", onError);
          child.removeListener("exit", onExit);
          this.cancelStartup = undefined;
          // Continue draining stdout after the address handshake.
          child.stdout.resume();
          if (error) reject(error); else resolve(url!);
        };
        const onError = () => finish(new BeadsHttpError(0, "serve_start_failed"));
        const onExit = () => {
          const code = /bd migrate schema|migration/i.test(diagnostics) ? "migration_required"
            : /auth-token-file|token file/i.test(diagnostics) ? "authentication_configuration"
            : /embedded/i.test(diagnostics) ? "embedded_http_unavailable" : "serve_exited";
          finish(new BeadsHttpError(0, code));
        };
        const onData = (chunk: Buffer) => {
          buffer += chunk.toString("utf8");
          if (buffer.length > 65536) { finish(new BeadsHttpError(0, "invalid_handshake")); return; }
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (line.startsWith("bd serve: listening on ")) {
              finish(undefined, line.slice("bd serve: listening on ".length)); return;
            }
          }
        };
        const timer = setTimeout(() => finish(new BeadsHttpError(0, "serve_start_timeout")), this.options.startupTimeoutMs ?? 30000);
        this.cancelStartup = () => finish(new BeadsHttpError(0, "cancelled"));
        child.on("error", onError);
        child.once("exit", onExit);
        child.stdout.on("data", onData);
      });
      if (this.disposed || child.exitCode !== null || child.signalCode !== null) throw new BeadsHttpError(0, "cancelled");
      client = new BeadsHttpClient(address, this.options.requestTimeoutMs);
      this.client = client;
      const context = objectBody(await client.get("/v0/beads/context"));
      if (context.api_version !== "v0" || !Array.isArray(context.capabilities) ||
          !context.capabilities.every(value => typeof value === "string") ||
          typeof context.project_id !== "string" || typeof context.database !== "string") {
        throw new BeadsHttpError(0, "unsupported_context");
      }
      if ((this.options.expectedProjectId !== undefined && context.project_id !== this.options.expectedProjectId) ||
          (this.options.expectedDatabase !== undefined && context.database !== this.options.expectedDatabase) ||
          (this.identity !== undefined && (context.project_id !== this.identity.projectId || context.database !== this.identity.database))) {
        throw new BeadsHttpError(412, "project_mismatch");
      }
      this.identity = { projectId: context.project_id, database: context.database };
      client.setContext(context.capabilities as string[], context.project_id);
      for (const capability of ["issues.list", "issues.get", "ready.list"]) {
        if (!client.capabilities.has(capability)) throw new BeadsHttpError(0, "missing_capability", { capability });
      }
      await client.get("/v0/beads/ready?limit=1");
      if (this.disposed || child.exitCode !== null || child.signalCode !== null) throw new BeadsHttpError(0, "cancelled");
      return client;
    } catch (error) {
      client?.dispose();
      this.client = undefined;
      await this.stopChild();
      throw error;
    }
  }

  private async stopChild(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2000);
      timer.unref();
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.kill("SIGTERM");
    });
  }
}
