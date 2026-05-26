import { describe, expect, it } from "vitest";
import { exportCsv, exportHtml, exportJson, exportXlsx } from "../src/main/exporters";
import type { ScanResult } from "../src/shared/types";

const result: ScanResult = {
  schemaVersion: 1,
  scannedAt: "2026-01-01T00:00:00.000Z",
  roots: ["C:\\data"],
  options: { roots: ["C:\\data"], include: [], exclude: [], followSymlinks: false, concurrency: 4, maxDepth: null },
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
      size: 3,
      allocatedSize: 3,
      modifiedAt: null,
      createdAt: null,
      accessedAt: null,
      children: [1],
      fileCount: 1,
      folderCount: 1
    },
    {
      id: 1,
      parentId: 0,
      path: "C:\\data\\a.txt",
      name: "a.txt",
      extension: ".txt",
      depth: 1,
      isDirectory: false,
      isSymbolicLink: false,
      size: 3,
      allocatedSize: 3,
      modifiedAt: null,
      createdAt: null,
      accessedAt: null,
      children: [],
      fileCount: 1,
      folderCount: 0
    }
  ],
  totals: { bytes: 3, allocatedBytes: 3, files: 1, folders: 1, errors: 0, durationMs: 2 },
  errors: []
};

describe("exporters", () => {
  it("exports stable JSON", () => {
    expect(JSON.parse(exportJson(result)).totals.bytes).toBe(3);
  });

  it("exports CSV with paths and byte columns", () => {
    const csv = exportCsv(result);
    expect(csv).toContain("path,name,type");
    expect(csv).toContain("C:\\data\\a.txt");
  });

  it("exports a standalone HTML report", () => {
    const html = exportHtml(result);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("OpenTree Folder Analysis");
  });

  it("exports a non-empty XLSX workbook", () => {
    expect(exportXlsx(result).byteLength).toBeGreaterThan(1000);
  });
});
