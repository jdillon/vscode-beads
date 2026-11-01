import { BeadsIssue } from "./BeadsBackend";
import { BeadsCommandRunner } from "./BeadsCommandRunner";
import { BeadsHttpClient, BeadsHttpError, objectBody } from "./beads-http-client";
import { BeadsServeOptions, BeadsServeSession } from "./beads-serve-session";
import { Logger } from "../utils/logger";

function issueBody(value: unknown): BeadsIssue {
  const issue = objectBody(value);
  for (const key of ["id", "title", "status", "issue_type", "created_at", "updated_at"]) {
    if (typeof issue[key] !== "string") throw new BeadsHttpError(0, "invalid_issue");
  }
  if (typeof issue.priority !== "number" || !Number.isFinite(issue.priority)) throw new BeadsHttpError(0, "invalid_issue");
  for (const key of ["dependencies", "dependents", "labels", "comments"]) {
    if (issue[key] !== undefined && !Array.isArray(issue[key])) throw new BeadsHttpError(0, "invalid_issue");
  }
  return issue as unknown as BeadsIssue;
}

/** Supported HTTP reads, with the inherited CLI mutations preserving hooks. */
export class BeadsHttpBackend extends BeadsCommandRunner {
  private readonly session: BeadsServeSession;
  private readonly httpReads = new Map<string, Promise<unknown>>();
  private httpGeneration = 0;

  constructor(params: BeadsServeOptions & { log: Logger; minSupportedVersion?: string; onMutation?: () => void }) {
    super(params);
    this.session = new BeadsServeSession(params);
  }

  async getHttpClient(): Promise<BeadsHttpClient> {
    const compatibility = await this.checkCompatibility();
    if (!compatibility.supported) throw new Error(compatibility.message);
    return this.session.getClient();
  }

  override async probeLive(): Promise<void> {
    await (await this.getHttpClient()).get("/v0/beads/ready?limit=1");
  }

  override async dispose(): Promise<void> {
    this.invalidateReads();
    await this.session.dispose();
    await super.dispose();
  }

  override invalidateReads(): void {
    super.invalidateReads();
    this.httpGeneration++;
    this.httpReads.clear();
  }

  override list(): Promise<BeadsIssue[]> {
    return this.readOnce("list", () => this.readList());
  }

  override show(id: string): Promise<BeadsIssue | null> {
    return this.readOnce(`show:${id}`, () => this.readIssue(id));
  }

  override listComments(id: string): Promise<NonNullable<BeadsIssue["comments"]>> {
    return this.readOnce(`comments:${id}`, () => this.readComments(id));
  }

  private readOnce<T>(key: string, read: () => Promise<T>): Promise<T> {
    const existing = this.httpReads.get(key);
    if (existing) return existing as Promise<T>;
    const generation = this.httpGeneration;
    const pending = read().then(value => {
      if (generation !== this.httpGeneration) throw new BeadsHttpError(0, "read_invalidated");
      return value;
    }).finally(() => {
      if (this.httpReads.get(key) === pending) this.httpReads.delete(key);
    });
    this.httpReads.set(key, pending);
    return pending;
  }

  private async readList(): Promise<BeadsIssue[]> {
    const client = await this.getHttpClient();
    // Restart an invalidated cursor once, discarding the incomplete generation.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const issues = new Map<string, BeadsIssue>();
        const cursors = new Set<string>();
        let cursor: string | undefined;
        for (let pageNumber = 0; pageNumber < 10000; pageNumber++) {
          const query = new URLSearchParams({ all: "true", limit: "500" });
          if (cursor) query.set("cursor", cursor);
          const page = objectBody(await client.get(`/v0/beads/issues?${query}`));
          if (!Array.isArray(page.items) || typeof page.has_more !== "boolean") {
            throw new BeadsHttpError(0, "invalid_page");
          }
          for (const value of page.items) {
            const issue = issueBody(value);
            issues.set(issue.id, issue);
          }
          if (!page.has_more) return [...issues.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
          if (typeof page.next_cursor !== "string" || !page.next_cursor || cursors.has(page.next_cursor)) {
            throw new BeadsHttpError(0, "invalid_cursor_response");
          }
          cursor = page.next_cursor;
          cursors.add(cursor);
        }
        throw new BeadsHttpError(0, "page_limit_exceeded");
      } catch (error) {
        if (attempt === 0 && error instanceof BeadsHttpError && error.code === "invalid_cursor") continue;
        throw error;
      }
    }
    throw new BeadsHttpError(0, "invalid_cursor");
  }

  private async readIssue(id: string): Promise<BeadsIssue | null> {
    try {
      const value = await (await this.getHttpClient()).get(`/v0/beads/issues/${encodeURIComponent(id)}?include_dependents=true`);
      const issue = issueBody(value);
      if (issue.id !== id) throw new BeadsHttpError(0, "issue_mismatch");
      return issue;
    } catch (error) {
      if (error instanceof BeadsHttpError && error.status === 404 && error.code === "not_found") return null;
      throw error;
    }
  }

  private async readComments(id: string): Promise<NonNullable<BeadsIssue["comments"]>> {
    const value = objectBody(await (await this.getHttpClient()).get(`/v0/beads/issues/${encodeURIComponent(id)}?include_comments=true`));
    if (value.id !== id || value.comments_omitted === true) throw new BeadsHttpError(0, "invalid_comments");
    if (value.comments === undefined) {
      if (typeof value.comment_count === "number" && value.comment_count > 0) throw new BeadsHttpError(0, "invalid_comments");
      return [];
    }
    if (!Array.isArray(value.comments)) throw new BeadsHttpError(0, "invalid_comments");
    return value.comments.map(raw => {
      const comment = objectBody(raw);
      for (const key of ["id", "author", "text", "created_at"]) {
        if (typeof comment[key] !== "string") throw new BeadsHttpError(0, "invalid_comments");
      }
      return comment as unknown as NonNullable<BeadsIssue["comments"]>[number];
    });
  }
}
