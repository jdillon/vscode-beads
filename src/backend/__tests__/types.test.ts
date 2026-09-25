import { BUILT_IN_STATUSES, issueToWebviewBead, normalizeStatus } from "../types";

describe("normalizeStatus", () => {
  it("maps every bd built-in status to itself", () => {
    for (const status of BUILT_IN_STATUSES) {
      expect(normalizeStatus(status)).toBe(status);
    }
  });

  it("canonicalizes known aliases", () => {
    expect(normalizeStatus("in-progress")).toBe("in_progress");
    expect(normalizeStatus("active")).toBe("in_progress");
    expect(normalizeStatus("done")).toBe("closed");
    expect(normalizeStatus("completed")).toBe("closed");
    expect(normalizeStatus("cancelled")).toBe("closed");
    expect(normalizeStatus("OPEN")).toBe("open");
  });

  it("passes custom statuses through verbatim so they round-trip to bd", () => {
    // bd allows user-defined statuses via `bd config set status.custom`.
    expect(normalizeStatus("awaiting_review")).toBe("awaiting_review");
    expect(normalizeStatus("awaiting-review")).toBe("awaiting-review");
  });

  it("returns null only when the status is absent", () => {
    expect(normalizeStatus(undefined)).toBeNull();
    expect(normalizeStatus("")).toBeNull();
    expect(normalizeStatus("   ")).toBeNull();
  });
});

describe("issueToWebviewBead", () => {
  const base = {
    id: "bd-1",
    title: "t",
    priority: 2,
    issue_type: "task",
    created_at: "2026-07-27T00:00:00Z",
    updated_at: "2026-07-27T00:00:00Z",
  };

  it("keeps beads whose status bd added after the original four", () => {
    // Regression: these used to normalize to null and get filtered out of
    // every view, so `bd defer` made an issue vanish from the extension.
    for (const status of ["deferred", "pinned", "hooked"]) {
      expect(issueToWebviewBead({ ...base, status })?.status).toBe(status);
    }
  });

  it("keeps beads with a custom status", () => {
    expect(issueToWebviewBead({ ...base, status: "awaiting_review" })?.status).toBe(
      "awaiting_review"
    );
  });

  it("still drops beads with no status at all", () => {
    expect(issueToWebviewBead({ ...base, status: "" })).toBeNull();
  });

  it("keeps computed readiness and blockers independent of stored status", () => {
    const state = {
      readyIds: new Set(["bd-ready"]),
      blockedBy: new Map([["bd-open", ["bd-parent"]]]),
    };
    expect(issueToWebviewBead({ ...base, id: "bd-open", status: "open" }, state))
      .toMatchObject({ status: "open", isReady: false, blockedBy: ["bd-parent"] });
    expect(issueToWebviewBead({ ...base, id: "bd-ready", status: "open" }, state))
      .toMatchObject({ status: "open", isReady: true, blockedBy: [] });
    expect(issueToWebviewBead({ ...base, id: "bd-unknown", status: "blocked" }))
      .toMatchObject({ status: "blocked", isReady: undefined, blockedBy: undefined });
  });
});
