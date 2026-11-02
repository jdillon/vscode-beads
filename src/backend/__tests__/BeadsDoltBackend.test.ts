import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BeadsDoltBackend, resolveDoltPassword } from "../BeadsDoltBackend";
import { Logger } from "../../utils/logger";

const issueRow = {
  id: "bd-1",
  title: "Resolved issue",
  status: "closed",
  priority: 2,
  issue_type: "task",
  created_at: "2026-09-23T00:00:00Z",
  updated_at: "2026-09-24T15:20:13Z",
  closed_at: "2026-09-24T15:20:13Z",
  close_reason: "Root cause: fixed. Verified by user.",
};

function mockIssueQuery() {
  const log = { child: () => log } as unknown as Logger;
  const backend = new BeadsDoltBackend({
    bdPath: "bd",
    cwd: "/tmp",
    beadsDir: "/tmp/.beads",
    log,
  });
  const query = jest.spyOn(
    backend as unknown as {
      query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
    },
    "query"
  ).mockImplementation(async (sql) => sql.includes("FROM issues") ? [issueRow] : []);
  return { backend, query };
}

describe("BeadsDoltBackend close reason", () => {
  it("selects and maps close_reason in list results", async () => {
    const { backend, query } = mockIssueQuery();

    const issues = await backend.list();

    expect(query.mock.calls[0][0]).toMatch(/close_reason\s+FROM issues/);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ status: "closed", close_reason: issueRow.close_reason });
  });

  it("selects and maps close_reason in detail results", async () => {
    const { backend, query } = mockIssueQuery();

    const issue = await backend.show(issueRow.id);

    expect(query.mock.calls[0][0]).toMatch(/close_reason\s+FROM issues/);
    expect(issue).toMatchObject({ status: "closed", close_reason: issueRow.close_reason });
  });
});

describe("resolveDoltPassword", () => {
  let dir: string;
  let credentialsFile: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dolt-credentials-"));
    credentialsFile = path.join(dir, "credentials");
    fs.writeFileSync(credentialsFile, [
      "[orchard.example:3307]",
      "password = pear-cider",
      "password=second-ignored",
      "",
      "[seeds.example:3307]",
      "password=apple#core",
      "",
      "[[::1]:3307]",
      "password=quince",
    ].join("\n"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ["env wins over file", "orchard.example", 3307, { BEADS_DOLT_PASSWORD: "plum-jam" }, "plum-jam"],
    ["empty env falls back to file", "orchard.example", 3307, { BEADS_DOLT_PASSWORD: "" }, "pear-cider"],
    ["wrong port gives empty", "orchard.example", 3308, {}, ""],
    ["# cuts the value", "seeds.example", 3307, {}, "apple"],
    ["bracketed IPv6 host", "[::1]", 3307, {}, "quince"],
    ["missing file gives empty", "orchard.example", 3307, { BEADS_CREDENTIALS_FILE: "/nonexistent/credentials" }, ""],
  ])("%s", (_name, host, port, env, expected) => {
    expect(resolveDoltPassword(host, port, { BEADS_CREDENTIALS_FILE: credentialsFile, ...env })).toBe(expected);
  });
});
