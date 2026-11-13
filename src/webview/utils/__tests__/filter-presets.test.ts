import { FILTER_PRESETS, isBlockedPresetMatch } from "../filter-presets";

describe("Blocked filter preset", () => {
  const blocked = FILTER_PRESETS.find((p) => p.id === "blocked")!;

  it("matches stored status blocked with no computed blockers", () => {
    expect(isBlockedPresetMatch({ status: "blocked", blockedBy: [] })).toBe(true);
    expect(isBlockedPresetMatch({ status: "blocked" })).toBe(true);
  });

  it("matches any non-blocked status that has active blockers", () => {
    expect(isBlockedPresetMatch({ status: "open", blockedBy: ["bd-1"] })).toBe(true);
    expect(isBlockedPresetMatch({ status: "in_progress", blockedBy: ["bd-1", "bd-2"] })).toBe(true);
  });

  it("skips beads with neither, including when blocker data is unavailable", () => {
    expect(isBlockedPresetMatch({ status: "open", blockedBy: [] })).toBe(false);
    expect(isBlockedPresetMatch({ status: "open" })).toBe(false);
  });

  it("is the only preset that opts into blockers, and adds no status filter that would AND it away", () => {
    expect(blocked.includeBlockedBy).toBe(true);
    expect(blocked.statuses).toEqual([]);
    expect(FILTER_PRESETS.filter((p) => p.includeBlockedBy)).toEqual([blocked]);
  });
});
