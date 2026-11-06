import { matchesBead, parseBoardColumns, placeBead, canDropBead, BoardColumn } from "../board-columns";

const bead = {
  id: "issue-1", title: "Implement board", status: "open", priority: 1,
  type: "feature", labels: ["ui"], isReady: false, blockedBy: ["issue-2"],
};

describe("board column filters", () => {
  it("combines fields with AND and values within a field with OR", () => {
    expect(matchesBead(bead, { status: ["open", "blocked"], labels: ["docs", "ui"], hasBlockers: true })).toBe(true);
    expect(matchesBead(bead, { status: ["closed"], hasBlockers: true })).toBe(false);
    expect(matchesBead(bead, { status: ["open"], isReady: true })).toBe(false);
    expect(matchesBead(bead, { assignee: ["__unassigned__"], query: "BOARD" })).toBe(true);
  });

  it("does not treat unavailable computed state as false", () => {
    const unknown = { ...bead, blockedBy: undefined, isReady: undefined };
    expect(matchesBead(unknown, { hasBlockers: false })).toBe(false);
    expect(matchesBead(unknown, { isReady: false })).toBe(false);
    expect(matchesBead({ ...bead, blockedBy: [] }, { hasBlockers: false })).toBe(true);
  });

  it("places an issue in the first match and otherwise in Other", () => {
    const columns: BoardColumn[] = [
      { id: "blocked", title: "Blocked", color: "#ef4444", filter: { hasBlockers: true } },
      { id: "open", title: "Open", color: "#3b82f6", filter: { status: ["open"] }, dropStatus: "open" },
    ];
    expect(placeBead(bead, columns)).toBe("blocked");
    expect(placeBead({ ...bead, blockedBy: [] }, columns)).toBe("open");
    expect(placeBead({ ...bead, status: "closed", blockedBy: [] }, columns)).toBe("__other__");
    expect(canDropBead(bead, columns[0], columns)).toBe(false);
    expect(canDropBead({ ...bead, status: "closed", blockedBy: [] }, columns[1], columns)).toBe(true);
    expect(canDropBead(bead, columns[1], columns)).toBe(false);
  });

  it("rejects malformed saved columns", () => {
    const valid = { version: 1, columns: [{ id: "open", title: "Open", color: "#3b82f6", filter: { status: ["open"] }, dropStatus: "open" }] };
    expect(parseBoardColumns(valid)).toEqual(valid);
    expect(parseBoardColumns({ ...valid, columns: [valid.columns[0], valid.columns[0]] })).toBeNull();
    expect(parseBoardColumns({ ...valid, columns: [{ ...valid.columns[0], filter: { arbitrary: true } }] })).toBeNull();
    expect(parseBoardColumns({ ...valid, columns: [{ ...valid.columns[0], dropStatus: 42 }] })).toBeNull();
  });
});
