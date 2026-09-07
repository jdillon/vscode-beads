import {
  BeadsCommandRunner,
  createListCommandArgs,
  createShowCommandArgs,
  createUpdateCommandArgs,
} from "../BeadsCommandRunner";
import { MIN_SUPPORTED_BD_VERSION } from "../BeadsBackend";
import { Logger } from "../../utils/logger";

describe("createListCommandArgs", () => {
  it("requests all issues without the CLI default limit", () => {
    expect(createListCommandArgs()).toEqual(["list", "--all", "--limit", "0", "--json"]);
  });
});

describe("createShowCommandArgs", () => {
  it("opts in to the dependents payload bd 1.0.5+ omits by default", () => {
    expect(createShowCommandArgs("bd-abc")).toEqual([
      "show",
      "bd-abc",
      "--json",
      "--include-dependents",
    ]);
  });

  it("is backed by a version floor new enough to accept --include-dependents", () => {
    // bd rejects unknown flags outright, so the floor must be >= 1.0.5.
    const [major, minor, patch] = MIN_SUPPORTED_BD_VERSION.split(".").map(Number);
    expect(major * 10000 + minor * 100 + patch).toBeGreaterThanOrEqual(10005);
  });
});

describe("createUpdateCommandArgs", () => {
  it("serializes empty strings and zero values used to clear optional fields", () => {
    expect(createUpdateCommandArgs({
      id: "bd-1",
      external_ref: "",
      estimated_minutes: 0,
    })).toEqual([
      "update",
      "bd-1",
      "--json",
      "--external-ref",
      "",
      "--estimate",
      "0",
    ]);
  });

  it("removes current labels when the replacement set is empty", () => {
    expect(createUpdateCommandArgs(
      { id: "bd-1", set_labels: [] },
      ["bug", "ui"]
    )).toEqual([
      "update",
      "bd-1",
      "--json",
      "--remove-label",
      "bug",
      "--remove-label",
      "ui",
    ]);
  });

  it("reads labels without the show cache before removing the final labels", async () => {
    const log = { child: () => log } as unknown as Logger;
    const runner = new BeadsCommandRunner({
      bdPath: "bd",
      cwd: "/tmp",
      beadsDir: "/tmp/.beads",
      log,
    });
    const issue = {
      id: "bd-1",
      title: "Issue",
      status: "open",
      priority: 2,
      issue_type: "task",
      labels: ["bug", "ui"],
      created_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    };
    const runJson = jest.spyOn(
      runner as unknown as { runJson: (args: string[]) => Promise<unknown> },
      "runJson"
    )
      .mockResolvedValueOnce([issue])
      .mockResolvedValueOnce([{ ...issue, labels: [] }]);

    await runner.update({ id: "bd-1", set_labels: [] });

    expect(runJson).toHaveBeenNthCalledWith(1, createShowCommandArgs("bd-1"));
    expect(runJson).toHaveBeenNthCalledWith(2, [
      "update",
      "bd-1",
      "--json",
      "--remove-label",
      "bug",
      "--remove-label",
      "ui",
    ]);
  });
});
