import { createListCommandArgs } from "../BeadsCommandRunner";

describe("createListCommandArgs", () => {
  it("requests all issues without the CLI default limit", () => {
    expect(createListCommandArgs()).toEqual(["list", "--all", "--limit", "0", "--json"]);
  });
});
