import { get, IncomingMessage } from "http";

export class BeadsHttpError extends Error {
  constructor(public readonly status: number, public readonly code: string,
    public readonly body: Record<string, unknown> = {}) {
    super(`Beads HTTP ${status}: ${code}`);
    this.name = "BeadsHttpError";
  }
}

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BeadsHttpError(0, "invalid_response");
  }
  return value as Record<string, unknown>;
}

/** Only talks to the ephemeral loopback child owned by the extension. */
export class BeadsHttpClient {
  readonly capabilities = new Set<string>();
  private readonly lifetime = new AbortController();
  private projectId?: string;

  constructor(private readonly baseUrl: string, private readonly timeoutMs = 30000) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
        !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new BeadsHttpError(0, "invalid_address");
    }
  }

  setContext(capabilities: string[], projectId: string): void {
    capabilities.forEach(value => this.capabilities.add(value));
    if (this.capabilities.has("project.enforce") && projectId) this.projectId = projectId;
  }

  dispose(): void { this.lifetime.abort(); }

  async get<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.request(path, signal, false);
    return await this.readJson(response) as T;
  }

  async openStream(path: string, signal: AbortSignal): Promise<IncomingMessage> {
    return this.request(path, signal, true);
  }

  private async request(path: string, signal: AbortSignal | undefined, stream: boolean): Promise<IncomingMessage> {
    if (!path.startsWith("/v0/beads/") || path.startsWith("//") || path.includes("\\")) {
      throw new BeadsHttpError(0, "invalid_path");
    }
    const url = new URL(path, this.baseUrl);
    if (url.origin !== new URL(this.baseUrl).origin) throw new BeadsHttpError(0, "invalid_address");
    return new Promise((resolve, reject) => {
      if (signal?.aborted || this.lifetime.signal.aborted) {
        reject(new BeadsHttpError(0, "cancelled")); return;
      }
      const request = get(url, { headers: {
        Accept: stream ? "text/event-stream" : "application/json",
        ...(this.projectId ? { "Bd-Project-Id": this.projectId } : {}),
      } });
      const abort = () => request.destroy(new BeadsHttpError(0, "cancelled"));
      const timer = setTimeout(() => request.destroy(new BeadsHttpError(0, "timeout")), this.timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.lifetime.signal.removeEventListener("abort", abort);
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.lifetime.signal.addEventListener("abort", abort, { once: true });
      request.on("error", reject);
      request.on("close", cleanup);
      request.on("response", response => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          void this.readJson(response).then(value => {
            const body = objectBody(value);
            reject(new BeadsHttpError(status, typeof body.code === "string" ? body.code : "request_failed", body));
          }).catch(error => reject(error instanceof BeadsHttpError && error.status === status
            ? error : new BeadsHttpError(status, "invalid_error_response")));
          return;
        }
        const contentType = response.headers["content-type"] ?? "";
        if (!contentType.startsWith(stream ? "text/event-stream" : "application/json")) {
          response.destroy(); reject(new BeadsHttpError(0, "invalid_content_type")); return;
        }
        if (stream) clearTimeout(timer);
        resolve(response);
      });
    });
  }

  private async readJson(response: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 16 * 1024 * 1024) {
        response.destroy(); throw new BeadsHttpError(0, "response_too_large");
      }
      chunks.push(buffer);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new BeadsHttpError(0, "invalid_json"); }
  }
}
