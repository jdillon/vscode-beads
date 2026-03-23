import { resolveEnvVariables } from "../resolve-env-variables";

describe("resolveEnvVariables", () => {
  it("returns empty string unchanged", () => {
    expect(resolveEnvVariables("")).toBe("");
  });

  it("returns string without placeholders unchanged", () => {
    expect(resolveEnvVariables("jdillon")).toBe("jdillon");
  });

  it("expands a single ${env:VAR} placeholder", () => {
    process.env.TEST_BEADS_USER = "alice";
    expect(resolveEnvVariables("${env:TEST_BEADS_USER}")).toBe("alice");
    delete process.env.TEST_BEADS_USER;
  });

  it("expands multiple placeholders", () => {
    process.env.TEST_FIRST = "hello";
    process.env.TEST_SECOND = "world";
    expect(resolveEnvVariables("${env:TEST_FIRST}-${env:TEST_SECOND}")).toBe("hello-world");
    delete process.env.TEST_FIRST;
    delete process.env.TEST_SECOND;
  });

  it("replaces missing env var with empty string", () => {
    delete process.env.TEST_NONEXISTENT_VAR;
    expect(resolveEnvVariables("${env:TEST_NONEXISTENT_VAR}")).toBe("");
  });

  it("preserves surrounding text around placeholder", () => {
    process.env.TEST_NAME = "bob";
    expect(resolveEnvVariables("user-${env:TEST_NAME}-admin")).toBe("user-bob-admin");
    delete process.env.TEST_NAME;
  });

  it("does not expand ${VAR} without env: prefix", () => {
    process.env.TEST_RAW = "raw";
    expect(resolveEnvVariables("${TEST_RAW}")).toBe("${TEST_RAW}");
    delete process.env.TEST_RAW;
  });

  it("does not expand malformed patterns", () => {
    expect(resolveEnvVariables("${env:}")).toBe("${env:}");
    expect(resolveEnvVariables("${env:UNCLOSED")).toBe("${env:UNCLOSED");
  });
});
