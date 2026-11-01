import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { BeadsHttpClient, BeadsHttpError } from "../beads-http-client";

describe("owned HTTP client", () => {
  let server: Server;
  let client: BeadsHttpClient;
  beforeEach(async () => {
    server = createServer();
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    client = new BeadsHttpClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  });
  afterEach(async () => {
    client.dispose();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  it("stamps the verified project identity and decodes JSON", async () => {
    client.setContext(["project.enforce"], "project-one");
    server.on("request", (req, res) => {
      expect(req.headers["bd-project-id"]).toBe("project-one");
      res.setHeader("Content-Type", "application/json");
      res.end('{"items":[],"has_more":false}');
    });
    await expect(client.get("/v0/beads/issues")).resolves.toEqual({ items: [], has_more: false });
  });
  it("preserves structured truncation errors", async () => {
    server.on("request", (_req, res) => {
      res.writeHead(410, { "Content-Type": "application/json" });
      res.end('{"code":"cursor_truncated","head":42}');
    });
    await expect(client.openStream("/v0/beads/events/watch", new AbortController().signal))
      .rejects.toMatchObject({ status: 410, code: "cursor_truncated", body: { head: 42 } });
  });
  it("rejects redirects without contacting another server", async () => {
    server.on("request", (_req, res) => { res.writeHead(302, { Location: "http://example.com" }); res.end(); });
    await expect(client.get("/v0/beads/context")).rejects.toMatchObject({ status: 302 });
  });
  it("cancels an in-flight response on disposal", async () => {
    const arrived = new Promise<void>(resolve => server.on("request", () => resolve()));
    const pending = client.get("/v0/beads/context");
    const rejected = pending.catch(error => error);
    await arrived;
    client.dispose();
    expect(await rejected).toBeInstanceOf(Error);
  });
  it("rejects arbitrary endpoints", async () => {
    expect(() => new BeadsHttpClient("http://example.com:80")).toThrow(BeadsHttpError);
    await expect(client.get("//example.com/v0/beads/context")).rejects.toThrow(BeadsHttpError);
  });
});
