import { describe, expect, it } from "vitest";
import { itemContextMenuEntries } from "../src/main/item-context-menu";

function itemLabels(entries: ReturnType<typeof itemContextMenuEntries>): string[] {
  return entries.filter((entry) => entry.type === "item").map((entry) => entry.label);
}

describe("itemContextMenuEntries", () => {
  it("builds a file menu with common file actions without repeating the same icon everywhere", () => {
    const entries = itemContextMenuEntries("C:\\data\\report.txt", { isDirectory: false });

    expect(itemLabels(entries)).toEqual([
      "Open",
      "Show in folder",
      "Copy path",
      'Copy "report.txt"',
      "Move to Recycle Bin",
      "Properties"
    ]);
    expect(entries.filter((entry) => entry.type === "item" && entry.icon === "item")).toHaveLength(1);
  });

  it("adds folder-specific actions for directories", () => {
    const labels = itemLabels(itemContextMenuEntries("C:\\data\\projects", { isDirectory: true }));

    expect(labels).toContain("Open folder");
    expect(labels).toContain("Open in terminal");
    expect(labels).toContain("Show parent folder");
    expect(labels).toContain("Properties");
  });

  it("keeps Windows shell verbs in the menu when they are available", () => {
    const entries = itemContextMenuEntries("C:\\data\\archive.zip", {
      isDirectory: false,
      shellVerbs: [
        { name: "&Open", label: "&Open" },
        { name: "Edit with &Notepad++", label: "Edit with &Notepad++" },
        { name: "Ex&tract All...", label: "Ex&tract All..." }
      ]
    });

    expect(entries).toContainEqual({ type: "shell-verb", label: "Open", verb: "&Open", icon: undefined });
    expect(entries).toContainEqual({ type: "shell-verb", label: "Edit with Notepad++", verb: "Edit with &Notepad++", icon: "editor" });
    expect(entries).toContainEqual({ type: "shell-verb", label: "Extract All...", verb: "Ex&tract All...", icon: "archive" });
  });

  it("adds WinRAR archive actions when WinRAR is installed", () => {
    const labels = itemLabels(itemContextMenuEntries("C:\\data\\archive.rar", { isDirectory: false, hasWinRar: true }));

    expect(labels).toContain("Open with WinRAR");
    expect(labels).toContain("Extract files...");
    expect(labels).toContain("Extract here");
    expect(labels).toContain('Extract to "archive\\"');
  });

  it("supports multi-selection actions", () => {
    const labels = itemLabels(itemContextMenuEntries(["C:\\data\\a.txt", "C:\\data\\b.txt"], { isDirectory: false, hasWinRar: true }));

    expect(labels).toContain("Open 2 items");
    expect(labels).toContain("Copy paths");
    expect(labels).toContain("Move 2 items to Recycle Bin");
    expect(labels).toContain('Add to "selected-items.rar"');
  });
});
