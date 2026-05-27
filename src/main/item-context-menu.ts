import path from "node:path";

export type ItemContextMenuActionId =
  | "open"
  | "open-terminal"
  | "show-in-folder"
  | "copy-path"
  | "copy-name"
  | "trash"
  | "properties"
  | "winrar-open"
  | "winrar-extract-files"
  | "winrar-extract-here"
  | "winrar-extract-folder"
  | "winrar-add-archive"
  | "winrar-add-named";

export type ItemContextMenuIcon = "item" | "folder" | "terminal" | "archive" | "editor" | "tool";

export interface ShellVerbMenuEntry {
  name: string;
  label: string;
}

export type ItemContextMenuEntry =
  | { type: "separator" }
  | {
      type: "item";
      id: ItemContextMenuActionId;
      label: string;
      icon?: ItemContextMenuIcon;
      dangerous?: boolean;
    }
  | {
      type: "shell-verb";
      label: string;
      verb: string;
      icon?: ItemContextMenuIcon;
    };

const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso", ".cab"]);

function withoutMnemonics(value: string): string {
  return value.replace(/&/g, "").replace(/\s+/g, " ").trim();
}

function normalizedLabel(value: string): string {
  return withoutMnemonics(value).replace(/\.+$/g, "").toLowerCase();
}

function iconForShellVerb(label: string): ItemContextMenuIcon | undefined {
  const normalized = normalizedLabel(label);
  if (normalized.includes("notepad++")) return "editor";
  if (normalized.includes("winrar") || normalized.includes("extract") || normalized.includes("archive")) return "archive";
  if (normalized.includes("powerrename") || normalized.includes("file locksmith")) return "tool";
  return undefined;
}

function pushSeparator(entries: ItemContextMenuEntry[]): void {
  if (entries.length > 0 && entries.at(-1)?.type !== "separator") entries.push({ type: "separator" });
}

function shellVerbEntries(shellVerbs: ShellVerbMenuEntry[] | undefined, seen: Set<string>): ItemContextMenuEntry[] {
  if (!shellVerbs) return [];

  const entries: ItemContextMenuEntry[] = [];
  for (const verb of shellVerbs) {
    const label = withoutMnemonics(verb.label || verb.name);
    if (!label) continue;
    const key = normalizedLabel(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    entries.push({ type: "shell-verb", label, verb: verb.name, icon: iconForShellVerb(label) });
  }
  return entries;
}

function winRarEntries(paths: string[], hasWinRar: boolean): ItemContextMenuEntry[] {
  if (!hasWinRar || paths.length === 0) return [];

  const first = paths[0] ?? "";
  const name = path.basename(first) || first;
  const extension = path.extname(first).toLowerCase();
  const isArchive = paths.length === 1 && ARCHIVE_EXTENSIONS.has(extension);
  const base = extension ? name.slice(0, -extension.length) : name;
  const entries: ItemContextMenuEntry[] = [];

  if (isArchive) {
    entries.push(
      { type: "item", id: "winrar-open", label: "Open with WinRAR", icon: "archive" },
      { type: "item", id: "winrar-extract-files", label: "Extract files...", icon: "archive" },
      { type: "item", id: "winrar-extract-here", label: "Extract here", icon: "archive" },
      { type: "item", id: "winrar-extract-folder", label: `Extract to "${base}\\"`, icon: "archive" }
    );
    return entries;
  }

  const archiveName = paths.length === 1 ? `${name}.rar` : "selected-items.rar";
  entries.push(
    { type: "item", id: "winrar-add-archive", label: "Add to archive...", icon: "archive" },
    { type: "item", id: "winrar-add-named", label: `Add to "${archiveName}"`, icon: "archive" }
  );
  return entries;
}

export function itemContextMenuEntries(
  itemPaths: string | string[],
  options: { isDirectory: boolean; shellVerbs?: ShellVerbMenuEntry[]; hasWinRar?: boolean } = { isDirectory: false }
): ItemContextMenuEntry[] {
  const paths = Array.isArray(itemPaths) ? itemPaths.filter(Boolean) : [itemPaths].filter(Boolean);
  const first = paths[0] ?? "";
  const name = path.basename(first) || first;
  const isMulti = paths.length > 1;
  const seen = new Set<string>();
  const entries = shellVerbEntries(isMulti ? undefined : options.shellVerbs, seen);

  if (entries.length === 0) {
    entries.push({ type: "item", id: "open", label: isMulti ? `Open ${paths.length} items` : options.isDirectory ? "Open folder" : "Open", icon: "item" });
    seen.add("open");
  }

  const archiveEntries = winRarEntries(paths, Boolean(options.hasWinRar));
  if (archiveEntries.length > 0) {
    pushSeparator(entries);
    entries.push(...archiveEntries);
  }

  pushSeparator(entries);

  if (!isMulti && options.isDirectory) {
    entries.push({ type: "item", id: "open-terminal", label: "Open in terminal", icon: "terminal" });
  }

  entries.push(
    { type: "item", id: "show-in-folder", label: isMulti ? "Show first item in folder" : options.isDirectory ? "Show parent folder" : "Show in folder", icon: "folder" },
    { type: "item", id: "copy-path", label: isMulti ? "Copy paths" : "Copy path" }
  );

  if (!isMulti) {
    entries.push({ type: "item", id: "copy-name", label: `Copy "${name}"` });
  }

  pushSeparator(entries);
  entries.push({ type: "item", id: "trash", label: isMulti ? `Move ${paths.length} items to Recycle Bin` : "Move to Recycle Bin", dangerous: true });

  if (!isMulti && !seen.has("properties")) {
    entries.push({ type: "item", id: "properties", label: "Properties", icon: "tool" });
  }

  return entries;
}
