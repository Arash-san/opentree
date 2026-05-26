import { describe, expect, it } from "vitest";
import { compilePatterns, shouldExclude, shouldInclude } from "../src/main/patterns";
import { ageBuckets, extensionSummary, formatBytes } from "../src/shared/format";
import type { ScanResult } from "../src/shared/types";

describe("patterns", () => {
  it("matches include and exclude globs against paths and names", () => {
    const patterns = compilePatterns(["*.mp4", "**/*.zip"], ["node_modules", "*.tmp"]);

    expect(shouldInclude(patterns, "C:/media/movie.mp4", "movie.mp4")).toBe(true);
    expect(shouldInclude(patterns, "C:/archives/a.zip", "a.zip")).toBe(true);
    expect(shouldInclude(patterns, "C:/docs/readme.md", "readme.md")).toBe(false);
    expect(shouldExclude(patterns, "C:/app/node_modules", "node_modules")).toBe(true);
    expect(shouldExclude(patterns, "C:/app/cache.tmp", "cache.tmp")).toBe(true);
  });
});

describe("format helpers", () => {
  const now = Date.parse("2026-01-15T00:00:00.000Z");
  const result: ScanResult = {
    schemaVersion: 1,
    scannedAt: new Date(now).toISOString(),
    roots: ["root"],
    options: { roots: ["root"], include: [], exclude: [], followSymlinks: false, concurrency: 1, maxDepth: null },
    rootIds: [0],
    nodes: [
      {
        id: 0,
        parentId: null,
        path: "root",
        name: "root",
        extension: "",
        depth: 0,
        isDirectory: true,
        isSymbolicLink: false,
        size: 3072,
        allocatedSize: 3072,
        modifiedAt: null,
        createdAt: null,
        accessedAt: null,
        children: [1, 2],
        fileCount: 2,
        folderCount: 1
      },
      {
        id: 1,
        parentId: 0,
        path: "root/a.txt",
        name: "a.txt",
        extension: ".txt",
        depth: 1,
        isDirectory: false,
        isSymbolicLink: false,
        size: 1024,
        allocatedSize: 1024,
        modifiedAt: "2026-01-14T00:00:00.000Z",
        createdAt: null,
        accessedAt: null,
        children: [],
        fileCount: 1,
        folderCount: 0
      },
      {
        id: 2,
        parentId: 0,
        path: "root/b.bin",
        name: "b.bin",
        extension: ".bin",
        depth: 1,
        isDirectory: false,
        isSymbolicLink: false,
        size: 2048,
        allocatedSize: 2048,
        modifiedAt: "2024-01-01T00:00:00.000Z",
        createdAt: null,
        accessedAt: null,
        children: [],
        fileCount: 1,
        folderCount: 0
      }
    ],
    totals: { bytes: 3072, allocatedBytes: 3072, files: 2, folders: 1, errors: 0, durationMs: 1 },
    errors: []
  };

  it("formats bytes compactly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024 * 5)).toBe("5.0 MB");
  });

  it("summarizes extensions and age buckets", () => {
    expect(extensionSummary(result).map((entry) => entry.extension)).toEqual([".bin", ".txt"]);
    expect(ageBuckets(result, now).map((entry) => entry.label)).toEqual(["7 days", "Older"]);
  });
});
