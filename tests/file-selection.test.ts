import { describe, expect, it } from "vitest";
import { nextFileSelection } from "../src/renderer/src/fileSelection";

describe("nextFileSelection", () => {
  it("selects a single file without requiring a folder-scope change", () => {
    const next = nextFileSelection({
      visibleIds: [10, 11, 12],
      selectedIds: new Set(),
      focusedId: null,
      clickedId: 11,
      additive: false,
      range: false
    });

    expect([...next.selectedIds]).toEqual([11]);
    expect(next.focusedId).toBe(11);
  });

  it("toggles files for ctrl multi-selection", () => {
    const next = nextFileSelection({
      visibleIds: [10, 11, 12],
      selectedIds: new Set([10]),
      focusedId: 10,
      clickedId: 12,
      additive: true,
      range: false
    });

    expect([...next.selectedIds].sort()).toEqual([10, 12]);
    expect(next.focusedId).toBe(12);
  });

  it("selects a contiguous shift range from the focused file", () => {
    const next = nextFileSelection({
      visibleIds: [10, 11, 12, 13],
      selectedIds: new Set([10]),
      focusedId: 10,
      clickedId: 12,
      additive: false,
      range: true
    });

    expect([...next.selectedIds]).toEqual([10, 11, 12]);
    expect(next.focusedId).toBe(12);
  });
});
