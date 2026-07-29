import { createListCommandArgs, createShowCommandArgs } from "../BeadsCommandRunner";
import { MIN_SUPPORTED_BD_VERSION } from "../BeadsBackend";

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
