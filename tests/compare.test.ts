import { describe, expect, it } from "vitest";
import { compareScans } from "../src/main/compare";
import type { ScanResult } from "../src/shared/types";

function scan(nodes: Array<{ path: string; size: number }>, total: number): ScanResult {
  return {
    schemaVersion: 1,
    scannedAt: new Date(0).toISOString(),
    roots: ["C:\\data"],
    options: { roots: ["C:\\data"], include: [], exclude: [], followSymlinks: false, concurrency: 1, maxDepth: null },
    rootIds: [0],
    nodes: nodes.map((node, index) => ({
      id: index,
      parentId: index === 0 ? null : 0,
      path: node.path,
      name: node.path.split("\\").pop() ?? node.path,
      extension: "",
      depth: index === 0 ? 0 : 1,
      isDirectory: index === 0,
      isSymbolicLink: false,
      size: node.size,
      allocatedSize: node.size,
      modifiedAt: null,
      createdAt: null,
      accessedAt: null,
      children: index === 0 ? nodes.slice(1).map((_, childIndex) => childIndex + 1) : [],
      fileCount: index === 0 ? nodes.length - 1 : 1,
      folderCount: index === 0 ? 1 : 0
    })),
    totals: { bytes: total, allocatedBytes: total, files: nodes.length - 1, folders: 1, errors: 0, durationMs: 1 },
    errors: []
  };
}

describe("compareScans", () => {
  it("captures added, removed, and changed paths", () => {
    const previous = scan(
      [
        { path: "C:\\data", size: 30 },
        { path: "C:\\data\\a.bin", size: 10 },
        { path: "C:\\data\\old.bin", size: 20 }
      ],
      30
    );
    const current = scan(
      [
        { path: "C:\\data", size: 28 },
        { path: "C:\\data\\a.bin", size: 12 },
        { path: "C:\\data\\new.bin", size: 16 }
      ],
      28
    );

    const result = compareScans(previous, current);

    expect(result.totalDelta).toBe(-2);
    expect(result.entries.map((entry) => entry.status).sort()).toEqual(["added", "changed", "changed", "removed"]);
    expect(result.addedBytes).toBe(16);
    expect(result.removedBytes).toBe(20);
  });
});
