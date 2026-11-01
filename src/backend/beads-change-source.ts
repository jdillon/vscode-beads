import { spawn, ChildProcess } from "child_process";
import { StringDecoder } from "string_decoder";
import type { Logger } from "../utils/logger";

export type ChangeSourceState = "connecting" | "live" | "disabled" | "retrying" | "stopped";
export interface EventsHttpClient {
  openStream(path: string, signal: AbortSignal): Promise<AsyncIterable<Uint8Array>>;
}
export interface ChangeSourceOptions {
  bdPath: string;
  cwd: string;
  beadsDir: string;
  log: Pick<Logger, "warn">;
  onChange: () => void;
  onState?: (state: ChangeSourceState) => void;
  getHttpClient?: () => Promise<EventsHttpClient | undefined>;
}
const MAX_FRAME = 4 * 1024 * 1024;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid event object");
  return value as Record<string, unknown>;
}
function sequence(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid or unsafe event sequence");
  }
  return value;
}

/** Frames JSON objects, including the CLI's pretty-printed initial error envelope. */
export class JournalJsonParser {
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  private depth = 0;
  private quoted = false;
  private escaped = false;
  constructor(private readonly receive: (value: Record<string, unknown>) => void) {}
  push(chunk: Uint8Array): void {
    for (const c of this.decoder.write(Buffer.from(chunk))) {
      if (!this.buffer && /\s/.test(c)) continue;
      if (!this.buffer && c !== "{") throw new Error("Expected journal JSON object");
      this.buffer += c;
      if (this.buffer.length > MAX_FRAME) throw new Error("Journal frame too large");
      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (c === "\\") this.escaped = true;
        else if (c === '"') this.quoted = false;
      } else if (c === '"') this.quoted = true;
      else if (c === "{" || c === "[") this.depth++;
      else if (c === "}" || c === "]") this.depth--;
      if (this.depth === 0) {
        const value = object(JSON.parse(this.buffer));
        this.buffer = "";
        this.receive(value);
      }
    }
  }
  finish(): void {
    if (this.buffer || this.decoder.end()) throw new Error("Incomplete journal frame");
  }
}

/** SSE ignores heartbeat/retry fields; recovery timing belongs to the owner. */
export class JournalSseParser {
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  private data: string[] = [];
  private event = "";
  private id = "";
  private size = 0;
  constructor(private readonly receive: (value: Record<string, unknown>) => void) {}
  push(chunk: Uint8Array): void {
    this.buffer += this.decoder.write(Buffer.from(chunk));
    let index: number;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);
      this.line(line);
    }
    if (this.buffer.length + this.size > MAX_FRAME) throw new Error("SSE frame too large");
  }
  private line(line: string): void {
    this.size += line.length;
    if (this.size > MAX_FRAME) throw new Error("SSE frame too large");
    if (!line) {
      if (this.data.length) {
        const value = object(JSON.parse(this.data.join("\n")));
        if (this.event && this.event !== "message" && this.event !== "truncated") {
          throw new Error("Unexpected SSE event type");
        }
        if (this.event !== "truncated") {
          if (!/^\d+$/.test(this.id) || sequence(Number(this.id)) !== sequence(value.seq)) {
            throw new Error("SSE cursor does not match journal record");
          }
        }
        this.receive(value);
      }
      this.data = []; this.event = ""; this.id = ""; this.size = 0;
      return;
    }
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "data") this.data.push(value);
    else if (field === "event") this.event = value;
    else if (field === "id") this.id = value;
  }
  finish(): void {
    if (this.buffer || this.data.length || this.decoder.end()) throw new Error("Incomplete SSE frame");
  }
}

/** Notifications invalidate authoritative reads; journal snapshots are never applied to caches. */
export class BeadsChangeSource {
  private generation = 0;
  private stopped = true;
  private cursor = 0;
  private httpClient?: EventsHttpClient;
  private retryMs = 1000;
  private timer?: ReturnType<typeof setTimeout>;
  private changeTimer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  private child?: ChildProcess;
  constructor(private readonly options: ChangeSourceOptions) {}
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect(++this.generation);
  }
  restart(): void {
    this.dispose(); this.cursor = 0; this.retryMs = 1000; this.start();
  }
  dispose(): void {
    this.stopped = true; this.generation++;
    clearTimeout(this.timer); clearTimeout(this.changeTimer);
    this.timer = undefined; this.changeTimer = undefined;
    this.abort?.abort(); this.abort = undefined;
    this.stopChild();
    this.options.onState?.("stopped");
  }
  private current(generation: number): boolean { return !this.stopped && generation === this.generation; }
  private stopChild(): void {
    const child = this.child; this.child = undefined;
    if (!child) return;
    child.kill();
    const killTimer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 2000);
    killTimer.unref();
    child.once("close", () => clearTimeout(killTimer));
  }
  private changed(generation: number): void {
    if (!this.current(generation) || this.changeTimer) return;
    this.changeTimer = setTimeout(() => {
      this.changeTimer = undefined;
      if (this.current(generation)) this.options.onChange();
    }, 50);
  }
  private accept(value: Record<string, unknown>, generation: number): void {
    if (!this.current(generation)) return;
    if (value.code === "events_journal_truncated") {
      this.cursor = sequence(value.head);
      this.changed(generation);
      throw new Error("Journal pruned; rebuilding current state");
    }
    const seq = sequence(value.seq);
    if (seq === 0) throw new Error("Zero journal sequence");
    if (seq <= this.cursor) return;
    this.cursor = seq;
    this.retryMs = 1000;
    this.options.onState?.("live");
    this.changed(generation);
  }
  private async connect(generation: number): Promise<void> {
    if (!this.current(generation)) return;
    this.options.onState?.("connecting");
    const abort = new AbortController(); this.abort = abort;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const client = await this.options.getHttpClient?.();
      if (!this.current(generation)) return;
      if (client) {
        if (this.httpClient && this.httpClient !== client) {
          // A new owned server may read a different branch/replica sequence space.
          this.cursor = 0;
          this.changed(generation);
        }
        this.httpClient = client;
        const stream = await client.openStream(`/v0/beads/events:watch?since=${this.cursor}`, abort.signal);
        if (!this.current(generation)) return;
        this.options.onState?.("live"); this.changed(generation);
        const parser = new JournalSseParser(value => this.accept(value, generation));
        // Released bd sends a heartbeat every 20 seconds. Recover a hung stream.
        const armIdleTimeout = () => {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => abort.abort(), 60000);
        };
        armIdleTimeout();
        for await (const chunk of stream) {
          if (!this.current(generation)) return;
          armIdleTimeout();
          parser.push(chunk);
        }
        parser.finish();
      } else {
        await this.followCli(generation);
      }
      throw new Error("Journal connection closed");
    } catch (error) {
      if (!this.current(generation)) return;
      const failure = error as { status?: number; code?: string; body?: Record<string, unknown> };
      if (failure.code === "events_journal_disabled" || failure.body?.code === "events_journal_disabled") {
        this.options.onState?.("disabled");
        return;
      }
      if (failure.status === 410 && failure.body) {
        try { this.cursor = sequence(failure.body.head); } catch { this.cursor = 0; }
      }
      this.changed(generation);
      this.options.log.warn(`Change notifications interrupted: ${error instanceof Error ? error.message : "unknown error"}`);
      this.options.onState?.("retrying");
      this.timer = setTimeout(() => { this.timer = undefined; void this.connect(generation); }, this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 30000);
    } finally {
      clearTimeout(idleTimer);
      abort.abort();
      if (this.abort === abort) this.abort = undefined;
      if (this.current(generation)) this.stopChild();
    }
  }
  private followCli(generation: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.options.bdPath,
        ["events", "tail", "--since", String(this.cursor), "--follow", "--json"],
        { cwd: this.options.cwd, env: { ...process.env, BEADS_DIR: this.options.beadsDir }, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      this.child = child;
      const parser = new JournalJsonParser(value => this.accept(value, generation));
      let stderr = "";
      let settled = false;
      const fail = (error: unknown) => { settled = true; reject(error); };
      child.stdout?.on("data", (chunk: Buffer) => {
        if (settled || !this.current(generation)) return;
        try { parser.push(chunk); } catch (error) { fail(error); }
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        if (settled || !this.current(generation)) return;
        stderr = (stderr + chunk.toString("utf8")).slice(-8192);
        if (stderr.includes("events journal is disabled")) {
          fail(Object.assign(new Error("Events journal disabled"), { code: "events_journal_disabled" }));
        }
      });
      child.once("spawn", () => { this.changed(generation); });
      child.once("error", fail);
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        try { parser.finish(); } catch (error) { reject(error); return; }
        if (code !== 0) reject(new Error(`Journal follower exited (${code})`));
        else resolve();
      });
    });
  }
}
