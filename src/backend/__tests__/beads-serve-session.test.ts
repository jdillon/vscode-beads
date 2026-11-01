import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { spawn } from "child_process";
import { BeadsHttpClient } from "../beads-http-client";
import { BeadsServeSession } from "../beads-serve-session";

jest.mock("child_process", () => ({ spawn: jest.fn() }));

function fixture() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(),
    exitCode: null as number | null, signalCode: null as string | null,
    kill: jest.fn((signal: string) => {
      child.signalCode = signal;
      child.emit("exit", null, signal);
      return true;
    }),
  });
  (spawn as jest.Mock).mockReturnValue(child);
  const session = new BeadsServeSession({ bdPath: "/bin/bd", cwd: "/fixture", beadsDir: "/fixture/.beads", startupTimeoutMs: 50 });
  return { child, session };
}

describe("owned serve lifecycle", () => {
  afterEach(() => jest.restoreAllMocks());
  it("joins startup, validates context before readiness, and kills only its child", async () => {
    const { child, session } = fixture();
    const get = jest.spyOn(BeadsHttpClient.prototype, "get")
      .mockResolvedValueOnce({ api_version: "v0", project_id: "p", database: "db", capabilities: ["issues.list", "issues.get", "ready.list", "project.enforce"] })
      .mockResolvedValueOnce({ items: [] });
    const first = session.getClient();
    expect(session.getClient()).toBe(first);
    child.stdout.write("bd serve: listening on http://127.0.");
    child.stdout.write("0.1:12345\n");
    const client = await first;
    expect(client.capabilities.has("project.enforce")).toBe(true);
    expect(get.mock.calls.map(args => args[0])).toEqual(["/v0/beads/context", "/v0/beads/ready?limit=1"]);
    expect(spawn).toHaveBeenCalledWith("/bin/bd", ["serve", "--addr", "127.0.0.1:0"], expect.objectContaining({ shell: false, env: expect.objectContaining({ BEADS_DIR: "/fixture/.beads" }) }));
    await session.dispose();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    await expect(session.getClient()).rejects.toMatchObject({ code: "cancelled" });
  });
  it("rejects unsafe addresses before issuing any request", async () => {
    const { child, session } = fixture();
    const get = jest.spyOn(BeadsHttpClient.prototype, "get");
    const pending = session.getClient();
    child.stdout.write("bd serve: listening on http://example.com:12345\n");
    await expect(pending).rejects.toMatchObject({ code: "invalid_address" });
    expect(get).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
  it("refuses a different logical database after its owned child restarts", async () => {
    const { child, session } = fixture();
    const context = { api_version: "v0", project_id: "p", database: "db", capabilities: ["issues.list", "issues.get", "ready.list"] };
    jest.spyOn(BeadsHttpClient.prototype, "get").mockResolvedValueOnce(context)
      .mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ ...context, database: "other" });
    const first = session.getClient();
    child.stdout.write("bd serve: listening on http://127.0.0.1:12345\n");
    await first;
    child.kill("SIGTERM");
    const replacement = fixture().child;
    const second = session.getClient();
    replacement.stdout.write("bd serve: listening on http://127.0.0.1:12346\n");
    await expect(second).rejects.toMatchObject({ code: "project_mismatch" });
    expect(replacement.kill).toHaveBeenCalledWith("SIGTERM");
    await session.dispose();
  });
  it("cancels startup immediately on disposal", async () => {
    const { session } = fixture();
    const rejected = session.getClient().catch(error => error);
    await session.dispose();
    expect(await rejected).toMatchObject({ code: "cancelled" });
  });
  it("bounds a child that never announces readiness", async () => {
    const { child, session } = fixture();
    await expect(session.getClient()).rejects.toMatchObject({ code: "serve_start_timeout" });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
