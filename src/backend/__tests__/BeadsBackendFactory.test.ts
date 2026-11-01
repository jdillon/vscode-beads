import { selectBackendKind } from "../BeadsBackendFactory";

describe("selectBackendKind", () => {
  it("uses the CLI backend for embedded Dolt projects", async () => {
    const kind = await selectBackendKind(async () => ({
      backend: "dolt",
      data_dir: "/workspace/.beads/embeddeddolt",
      database: "example",
      embedded: true,
      schema_version: 1,
    }));

    expect(kind).toBe("cli");
  });

  it("uses the HTTP backend for server-mode projects", async () => {
    const kind = await selectBackendKind(async () => ({
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      database: "example",
      connection_ok: true,
      shared_server: false,
    }));

    expect(kind).toBe("http");
  });

  it("does not guess a backend when mode detection fails", async () => {
    await expect(selectBackendKind(async () => { throw new Error("bd dolt show failed"); }))
      .rejects.toThrow("bd dolt show failed");
  });
  it("rejects unknown storage modes", async () => {
    await expect(selectBackendKind(async () => ({ mode: "unknown" }))).rejects.toThrow("Cannot determine");
  });
  it("uses HTTP for proxied mode", async () => {
    expect(await selectBackendKind(async () => ({ mode: "proxied" }))).toBe("http");
  });
});
