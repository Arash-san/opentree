import path from "node:path";

export type ItemContextMenuActionId =
  | "open"
  | "open-terminal"
  | "show-in-folder"
  | "copy-path"
  | "copy-name"
  | "trash"
  | "properties";

export type ItemContextMenuIcon = "item" | "folder";

export type ItemContextMenuEntry =
  | { type: "separator" }
  | {
      type: "item";
      id: ItemContextMenuActionId;
      label: string;
      icon: ItemContextMenuIcon;
      dangerous?: boolean;
    };

export function itemContextMenuEntries(itemPath: string, options: { isDirectory: boolean }): ItemContextMenuEntry[] {
  const name = path.basename(itemPath) || itemPath;
  const entries: ItemContextMenuEntry[] = [
    { type: "item", id: "open", label: options.isDirectory ? "Open folder" : "Open", icon: "item" }
  ];

  if (options.isDirectory) {
    entries.push({ type: "item", id: "open-terminal", label: "Open in terminal", icon: "folder" });
  }

  entries.push(
    { type: "item", id: "show-in-folder", label: options.isDirectory ? "Show parent folder" : "Show in folder", icon: "folder" },
    { type: "separator" },
    { type: "item", id: "copy-path", label: "Copy path", icon: "item" },
    { type: "item", id: "copy-name", label: `Copy "${name}"`, icon: "item" },
    { type: "separator" },
    { type: "item", id: "trash", label: "Move to Recycle Bin", icon: "item", dangerous: true },
    { type: "item", id: "properties", label: "Properties", icon: "item" }
  );

  return entries;
}
