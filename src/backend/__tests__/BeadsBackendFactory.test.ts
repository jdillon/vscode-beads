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

  it("keeps the Dolt SQL backend for server-mode projects", async () => {
    const kind = await selectBackendKind(async () => ({
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      database: "example",
      connection_ok: true,
      shared_server: false,
    }));

    expect(kind).toBe("dolt-sql");
  });

  it("falls back to the Dolt SQL backend when mode detection fails", async () => {
    const kind = await selectBackendKind(async () => {
      throw new Error("bd dolt show failed");
    });

    expect(kind).toBe("dolt-sql");
  });
});
