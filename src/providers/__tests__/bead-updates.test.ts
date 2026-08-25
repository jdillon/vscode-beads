/**
 * Coverage for the webview mutation boundary: field mapping and the allowlist
 * that keeps unexpected fields out of a backend update.
 */

import { buildUpdateArgs } from "../bead-updates";

function expectArgs(result: ReturnType<typeof buildUpdateArgs>) {
  if ("error" in result) {
    throw new Error(`expected args, got error: ${result.error}`);
  }
  return result;
}

describe("buildUpdateArgs", () => {
  it("maps webview field names to backend argument names", () => {
    const { args } = expectArgs(
      buildUpdateArgs("bd-1", {
        title: "New title",
        acceptanceCriteria: "Given a bead",
        externalRef: "gh-9",
        estimatedMinutes: 30,
        labels: ["ui", "perf"],
        type: "bug",
      })
    );

    expect(args).toEqual({
      id: "bd-1",
      title: "New title",
      acceptance_criteria: "Given a bead",
      external_ref: "gh-9",
      estimated_minutes: 30,
      set_labels: ["ui", "perf"],
      issue_type: "bug",
    });
  });

  it("cannot be retargeted by an id inside the updates", () => {
    const { args, dropped } = expectArgs(
      buildUpdateArgs("bd-1", { id: "bd-victim", status: "closed" })
    );

    expect(args.id).toBe("bd-1");
    expect(dropped).toContain("id");
  });

  it("drops fields the UI does not offer", () => {
    const { args, dropped } = expectArgs(
      buildUpdateArgs("bd-1", { status: "open", createdAt: "2026-01-01", sortOrder: 3 })
    );

    expect(args).toEqual({ id: "bd-1", status: "open" });
    expect(dropped).toEqual(["createdAt", "sortOrder"]);
  });

  it("drops values of the wrong runtime type", () => {
    const { args, dropped } = expectArgs(
      buildUpdateArgs("bd-1", {
        title: "kept",
        priority: "high",
        estimatedMinutes: -5,
        labels: ["ok", 7],
      })
    );

    expect(args).toEqual({ id: "bd-1", title: "kept" });
    expect(dropped).toEqual(expect.arrayContaining(["priority", "estimatedMinutes", "labels"]));
  });

  it("accepts priorities across the supported range and rejects others", () => {
    expect(expectArgs(buildUpdateArgs("bd-1", { priority: 0 })).args.priority).toBe(0);
    expect(expectArgs(buildUpdateArgs("bd-1", { priority: 4 })).args.priority).toBe(4);
    expect(buildUpdateArgs("bd-1", { priority: 5 })).toHaveProperty("error");
    expect(buildUpdateArgs("bd-1", { priority: 1.5 })).toHaveProperty("error");
  });

  it("rejects a message with no usable target or payload", () => {
    expect(buildUpdateArgs("", { status: "open" })).toHaveProperty("error");
    expect(buildUpdateArgs(42, { status: "open" })).toHaveProperty("error");
    expect(buildUpdateArgs("bd-1", null)).toHaveProperty("error");
    expect(buildUpdateArgs("bd-1", ["status"])).toHaveProperty("error");
    expect(buildUpdateArgs("bd-1", {})).toHaveProperty("error");
  });

  it("ignores undefined values rather than dropping them", () => {
    const { args, dropped } = expectArgs(
      buildUpdateArgs("bd-1", { status: "open", assignee: undefined })
    );

    expect(args).toEqual({ id: "bd-1", status: "open" });
    expect(dropped).toEqual([]);
  });
});
