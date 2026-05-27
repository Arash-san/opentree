import { describe, expect, it } from "vitest";
import { fileScopeForSelection, visibleFilesForSelection } from "../src/renderer/src/fileView";
import type { ScanResult } from "../src/shared/types";

function scan(): ScanResult {
  const now = new Date(0).toISOString();
  return {
    schemaVersion: 1,
    scannedAt: now,
    roots: ["C:\\data"],
    options: { roots: ["C:\\data"], include: [], exclude: [], followSymlinks: false, concurrency: 1, maxDepth: null },
    rootIds: [0],
    nodes: [
      {
        id: 0,
        parentId: null,
        path: "C:\\data",
        name: "data",
        extension: "",
        depth: 0,
        isDirectory: true,
        isSymbolicLink: false,
        size: 60,
        allocatedSize: 60,
        modifiedAt: now,
        createdAt: now,
        accessedAt: now,
        children: [1],
        fileCount: 3,
        folderCount: 2
      },
      {
        id: 1,
        parentId: 0,
        path: "C:\\data\\folder",
        name: "folder",
        extension: "",
        depth: 1,
        isDirectory: true,
        isSymbolicLink: false,
        size: 60,
        allocatedSize: 60,
        modifiedAt: now,
        createdAt: now,
        accessedAt: now,
        children: [2, 3, 4],
        fileCount: 3,
        folderCount: 1
      },
      {
        id: 2,
        parentId: 1,
        path: "C:\\data\\folder\\alpha.txt",
        name: "alpha.txt",
        extension: ".txt",
        depth: 2,
        isDirectory: false,
        isSymbolicLink: false,
        size: 10,
        allocatedSize: 10,
        modifiedAt: now,
        createdAt: now,
        accessedAt: now,
        children: [],
        fileCount: 1,
        folderCount: 0
      },
      {
        id: 3,
        parentId: 1,
        path: "C:\\data\\folder\\beta.txt",
        name: "beta.txt",
        extension: ".txt",
        depth: 2,
        isDirectory: false,
        isSymbolicLink: false,
        size: 20,
        allocatedSize: 20,
        modifiedAt: now,
        createdAt: now,
        accessedAt: now,
        children: [],
        fileCount: 1,
        folderCount: 0
      },
      {
        id: 4,
        parentId: 1,
        path: "C:\\data\\folder\\nested",
        name: "nested",
        extension: "",
        depth: 2,
        isDirectory: true,
        isSymbolicLink: false,
        size: 30,
        allocatedSize: 30,
        modifiedAt: now,
        createdAt: now,
        accessedAt: now,
        children: [5],
        fileCount: 1,
        folderCount: 1
      },
      {
        id: 5,
        parentId: 4,
        path: "C:\\data\\folder\\nested\\gamma.log",
        name: "gamma.log",
        extension: ".log",
        depth: 3,
        isDirectory: false,
        isSymbolicLink: false,
        size: 30,
        allocatedSize: 30,
        modifiedAt: now,
        createdAt: now,
        accessedAt: now,
        children: [],
        fileCount: 1,
        folderCount: 0
      }
    ],
    totals: { bytes: 60, allocatedBytes: 60, files: 3, folders: 3, errors: 0, durationMs: 1 },
    errors: []
  };
}

describe("visibleFilesForSelection", () => {
  it("keeps sibling files visible when a file is selected", () => {
    const result = scan();
    const files = visibleFilesForSelection(result, 2, "");

    expect(files.map((file) => file.name)).toEqual(["gamma.log", "beta.txt", "alpha.txt"]);
    expect(fileScopeForSelection(result, 2)?.name).toBe("folder");
  });

  it("uses the selected folder as the file-list scope", () => {
    const files = visibleFilesForSelection(scan(), 4, "");

    expect(files.map((file) => file.name)).toEqual(["gamma.log"]);
  });

  it("filters the active file scope by search text", () => {
    const files = visibleFilesForSelection(scan(), 2, "beta");

    expect(files.map((file) => file.name)).toEqual(["beta.txt"]);
  });
});
