import { describe, expect, it } from "vitest";
import { itemContextMenuEntries } from "../src/main/item-context-menu";

function itemLabels(entries: ReturnType<typeof itemContextMenuEntries>): string[] {
  return entries.filter((entry) => entry.type === "item").map((entry) => entry.label);
}

describe("itemContextMenuEntries", () => {
  it("builds a file menu with common file actions and icons", () => {
    const entries = itemContextMenuEntries("C:\\data\\report.txt", { isDirectory: false });

    expect(itemLabels(entries)).toEqual([
      "Open",
      "Show in folder",
      "Copy path",
      'Copy "report.txt"',
      "Move to Recycle Bin",
      "Properties"
    ]);
    expect(entries.filter((entry) => entry.type === "item").every((entry) => entry.icon === "item" || entry.icon === "folder")).toBe(true);
  });

  it("adds folder-specific actions for directories", () => {
    const labels = itemLabels(itemContextMenuEntries("C:\\data\\projects", { isDirectory: true }));

    expect(labels).toContain("Open folder");
    expect(labels).toContain("Open in terminal");
    expect(labels).toContain("Show parent folder");
    expect(labels).toContain("Properties");
  });
});
