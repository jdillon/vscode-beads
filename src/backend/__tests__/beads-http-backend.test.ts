import { BeadsHttpBackend } from "../beads-http-backend";
import { BeadsHttpClient, BeadsHttpError } from "../beads-http-client";
import { Logger } from "../../utils/logger";

const issue = { id: "bd-1", title: "Done", status: "closed", priority: 2, issue_type: "task", created_at: "2026-01-01", updated_at: "2026-02-01", close_reason: "Verified" };
function fixture() {
  const log = { child: () => log } as unknown as Logger;
  const backend = new BeadsHttpBackend({ bdPath: "bd", cwd: "/fixture", beadsDir: "/fixture/.beads", log });
  const get = jest.fn();
  jest.spyOn(backend, "getHttpClient").mockResolvedValue({ get } as unknown as BeadsHttpClient);
  return { backend, get };
}

describe("HTTP read mapping", () => {
  it("joins in-flight reads and invalidation cannot reuse or return the old generation", async () => {
    const { backend, get } = fixture();
    let completeOld!: (value: unknown) => void;
    let completeNew!: (value: unknown) => void;
    get.mockImplementationOnce(() => new Promise(resolve => { completeOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { completeNew = resolve; }));
    const old = backend.list();
    expect(backend.list()).toBe(old);
    const oldError = old.catch(error => error);
    await Promise.resolve();
    backend.invalidateReads();
    const current = backend.list();
    await Promise.resolve();
    completeOld({ items: [issue], has_more: false });
    expect(await oldError).toMatchObject({ code: "read_invalidated" });
    expect(backend.list()).toBe(current);
    completeNew({ items: [], has_more: false });
    await expect(current).resolves.toEqual([]);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("reads all statuses through opaque pages and preserves close_reason", async () => {
    const { backend, get } = fixture();
    get.mockResolvedValueOnce({ items: [issue], has_more: true, next_cursor: "opaque+/=" })
      .mockResolvedValueOnce({ items: [{ ...issue, id: "bd-2", status: "open" }], has_more: false });
    expect(await backend.list()).toEqual([issue, { ...issue, id: "bd-2", status: "open" }]);
    expect(get.mock.calls[1][0]).toContain("all=true");
    expect(get.mock.calls[1][0]).toContain("cursor=opaque%2B%2F%3D");
  });
  it("rejects repeated cursors without returning a partial list", async () => {
    const { backend, get } = fixture();
    get.mockResolvedValue({ items: [issue], has_more: true, next_cursor: "same" });
    await expect(backend.list()).rejects.toMatchObject({ code: "invalid_cursor_response" });
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("restarts from scratch once on invalid_cursor", async () => {
    const { backend, get } = fixture();
    get.mockResolvedValueOnce({ items: [issue], has_more: true, next_cursor: "expired" })
      .mockRejectedValueOnce(new BeadsHttpError(400, "invalid_cursor"))
      .mockResolvedValueOnce({ items: [], has_more: false });
    await expect(backend.list()).resolves.toEqual([]);
    expect(get.mock.calls[2][0]).not.toContain("cursor=");
  });
  it("preserves typed dependencies in both directions", async () => {
    const { backend, get } = fixture();
    const detail = { ...issue, dependencies: [{ id: "bd-parent", dependency_type: "parent-child" }], dependents: [{ id: "bd-child", dependency_type: "blocks" }] };
    get.mockResolvedValue(detail);
    await expect(backend.show(issue.id)).resolves.toEqual(detail);
    expect(get).toHaveBeenCalledWith("/v0/beads/issues/bd-1?include_dependents=true");
  });
  it("distinguishes a missing issue from auth and identity failures", async () => {
    const { backend, get } = fixture();
    get.mockRejectedValueOnce(new BeadsHttpError(404, "not_found"));
    await expect(backend.show(issue.id)).resolves.toBeNull();
    get.mockRejectedValueOnce(new BeadsHttpError(412, "project_mismatch"));
    await expect(backend.show(issue.id)).rejects.toMatchObject({ status: 412 });
  });
  it("does not turn omitted comments into an empty result", async () => {
    const { backend, get } = fixture();
    get.mockResolvedValue({ ...issue, comments_omitted: true, comment_count: 1 });
    await expect(backend.listComments(issue.id)).rejects.toMatchObject({ code: "invalid_comments" });
  });
  it("preserves released string comment ids and full comment text", async () => {
    const { backend, get } = fixture();
    const comment = { id: "c-01", author: "author", text: "line one\nline two", created_at: "2026-02-01" };
    get.mockResolvedValue({ ...issue, comments: [comment], comments_omitted: false });
    await expect(backend.listComments(issue.id)).resolves.toEqual([comment]);
  });
});
