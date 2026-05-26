import { opendir, realpath, stat as statPath, lstat as lstatPath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ScanError, ScanNode, ScanOptions, ScanProgress, ScanResult } from "../shared/types";
import { compilePatterns, shouldExclude, shouldInclude } from "./patterns";

const PARTIAL_NODE_LIMIT = 20_000;

export interface ScanHooks {
  onProgress?: (progress: ScanProgress) => void;
}

interface DirectoryJob {
  id: number;
  path: string;
  depth: number;
}

interface NormalizedScanOptions {
  roots: string[];
  include: string[];
  exclude: string[];
  maxDepth: number | null;
  followSymlinks: boolean;
  concurrency: number;
}

interface ScanCounters {
  scannedFiles: number;
  scannedFolders: number;
  scannedBytes: number;
  errors: number;
}

function normalizeOptions(options: ScanOptions): NormalizedScanOptions {
  const cpuCount = Math.max(1, os.availableParallelism?.() ?? os.cpus().length);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? cpuCount * 2, 32));

  return {
    roots: [...new Set(options.roots.map((root) => path.resolve(root)))],
    include: options.include ?? [],
    exclude: options.exclude ?? [],
    maxDepth: typeof options.maxDepth === "number" && Number.isFinite(options.maxDepth) ? options.maxDepth : null,
    followSymlinks: Boolean(options.followSymlinks),
    concurrency
  };
}

function dateToIso(value: Date | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function toNodePath(value: string): string {
  return process.platform === "win32" ? path.toNamespacedPath(value) : value;
}

function baseName(value: string): string {
  const parsed = path.parse(value);
  return parsed.base || value;
}

function extensionFor(name: string, isDirectory: boolean): string {
  if (isDirectory) return "";
  const extension = path.extname(name).toLowerCase();
  return extension || "(none)";
}

function buildNode(args: {
  id: number;
  parentId: number | null;
  fullPath: string;
  depth: number;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  size: number;
  stats: { mtime?: Date; birthtime?: Date; atime?: Date };
}): ScanNode {
  const name = baseName(args.fullPath);

  return {
    id: args.id,
    parentId: args.parentId,
    path: args.fullPath,
    name,
    extension: extensionFor(name, args.isDirectory),
    depth: args.depth,
    isDirectory: args.isDirectory,
    isSymbolicLink: args.isSymbolicLink,
    size: args.isDirectory ? 0 : args.size,
    allocatedSize: args.isDirectory ? 0 : args.size,
    modifiedAt: dateToIso(args.stats.mtime),
    createdAt: dateToIso(args.stats.birthtime),
    accessedAt: dateToIso(args.stats.atime),
    children: [],
    fileCount: args.isDirectory ? 0 : 1,
    folderCount: args.isDirectory ? 1 : 0
  };
}

function pushError(errors: ScanError[], counters: ScanCounters, targetPath: string, error: unknown): void {
  const typed = error as NodeJS.ErrnoException;
  counters.errors += 1;
  errors.push({
    path: targetPath,
    message: typed.message ?? String(error),
    code: typed.code
  });
}

function shouldReport(lastReportAt: number): boolean {
  return Date.now() - lastReportAt > 100;
}

export async function scanFolders(options: ScanOptions, hooks: ScanHooks = {}): Promise<ScanResult> {
  const normalized = normalizeOptions(options);
  const compiled = compilePatterns(normalized.include, normalized.exclude);
  const startedAt = performance.now();
  const nodes: ScanNode[] = [];
  const rootIds: number[] = [];
  const errors: ScanError[] = [];
  const queue: DirectoryJob[] = [];
  const counters: ScanCounters = {
    scannedFiles: 0,
    scannedFolders: 0,
    scannedBytes: 0,
    errors: 0
  };
  const seenDirectories = new Set<string>();
  let nextId = 0;
  let cursor = 0;
  let lastReportAt = 0;
  let lastSnapshotAt = 0;

  function partialResult(): ScanResult {
    const durationMs = performance.now() - startedAt;
    const visibleNodes = nodes.length > PARTIAL_NODE_LIMIT ? nodes.slice(0, PARTIAL_NODE_LIMIT) : nodes;
    return {
      schemaVersion: 1,
      scannedAt: new Date().toISOString(),
      roots: normalized.roots,
      options: normalized,
      rootIds: [...rootIds],
      nodes: visibleNodes.map((node) => ({
        ...node,
        children: node.children.filter((childId) => childId < visibleNodes.length)
      })),
      totals: {
        bytes: rootIds.reduce((total, id) => total + (nodes[id]?.size ?? 0), 0),
        allocatedBytes: rootIds.reduce((total, id) => total + (nodes[id]?.allocatedSize ?? 0), 0),
        files: counters.scannedFiles,
        folders: counters.scannedFolders,
        errors: counters.errors,
        durationMs
      },
      errors: [...errors]
    };
  }

  function addNode(node: Omit<Parameters<typeof buildNode>[0], "id">): ScanNode {
    const created = buildNode({ ...node, id: nextId });
    nextId += 1;
    nodes.push(created);
    if (created.parentId !== null) {
      nodes[created.parentId]?.children.push(created.id);
    }
    return created;
  }

  function bumpAncestors(parentId: number | null, values: { size?: number; allocatedSize?: number; files?: number; folders?: number }): void {
    let currentId = parentId;
    while (currentId !== null) {
      const node = nodes[currentId];
      if (!node) break;
      node.size += values.size ?? 0;
      node.allocatedSize += values.allocatedSize ?? 0;
      node.fileCount += values.files ?? 0;
      node.folderCount += values.folders ?? 0;
      currentId = node.parentId;
    }
  }

  function report(currentPath: string, phase: ScanProgress["phase"] = "scanning", force = false): void {
    if (!hooks.onProgress) return;
    if (!force && !shouldReport(lastReportAt)) return;

    lastReportAt = Date.now();
    const includeSnapshot = nodes.length > 0 && (force || Date.now() - lastSnapshotAt > 1000);
    if (includeSnapshot) lastSnapshotAt = Date.now();

    hooks.onProgress({
      phase,
      currentPath,
      scannedFiles: counters.scannedFiles,
      scannedFolders: counters.scannedFolders,
      scannedBytes: counters.scannedBytes,
      errors: counters.errors,
      partialResult: includeSnapshot ? partialResult() : undefined
    });
  }

  async function registerDirectory(fullPath: string, parentId: number | null, depth: number, isSymbolicLink: boolean): Promise<void> {
    const stats = await statPath(toNodePath(fullPath));
    const key = normalized.followSymlinks ? await realpath(toNodePath(fullPath)).catch(() => fullPath) : fullPath.toLowerCase();
    if (seenDirectories.has(key)) return;
    seenDirectories.add(key);

    const node = addNode({
      parentId,
      fullPath,
      depth,
      isDirectory: true,
      isSymbolicLink,
      size: 0,
      stats
    });
    counters.scannedFolders += 1;
    bumpAncestors(parentId, { folders: 1 });
    queue.push({ id: node.id, path: fullPath, depth });
    if (parentId === null) rootIds.push(node.id);
  }

  async function registerFile(fullPath: string, parentId: number | null, depth: number, isSymbolicLink: boolean): Promise<void> {
    const name = baseName(fullPath);
    if (!shouldInclude(compiled, fullPath, name)) return;

    const stats = normalized.followSymlinks ? await statPath(toNodePath(fullPath)) : await lstatPath(toNodePath(fullPath));
    if (stats.isDirectory()) {
      await registerDirectory(fullPath, parentId, depth, isSymbolicLink);
      return;
    }

    if (!stats.isFile() && !stats.isSymbolicLink()) return;

    addNode({
      parentId,
      fullPath,
      depth,
      isDirectory: false,
      isSymbolicLink,
      size: Number(stats.size),
      stats
    });
    counters.scannedFiles += 1;
    counters.scannedBytes += Number(stats.size);
    bumpAncestors(parentId, { size: Number(stats.size), allocatedSize: Number(stats.size), files: 1 });
  }

  async function processEntry(parent: DirectoryJob, entryName: string, entryIsDirectory: boolean, entryIsSymlink: boolean): Promise<void> {
    const fullPath = path.join(parent.path, entryName);
    if (shouldExclude(compiled, fullPath, entryName)) return;

    try {
      const depth = parent.depth + 1;
      const stats = normalized.followSymlinks ? await statPath(toNodePath(fullPath)) : await lstatPath(toNodePath(fullPath));
      const isDirectory = stats.isDirectory() || (normalized.followSymlinks && entryIsDirectory);
      const isSymbolicLink = entryIsSymlink || stats.isSymbolicLink();

      if (isDirectory) {
        if (normalized.maxDepth !== null && depth > normalized.maxDepth) return;
        const node = addNode({
          parentId: parent.id,
          fullPath,
          depth,
          isDirectory: true,
          isSymbolicLink,
          size: 0,
          stats
        });

        const key = normalized.followSymlinks ? await realpath(toNodePath(fullPath)).catch(() => fullPath) : fullPath.toLowerCase();
        if (!seenDirectories.has(key)) {
          seenDirectories.add(key);
          counters.scannedFolders += 1;
          bumpAncestors(parent.id, { folders: 1 });
          queue.push({ id: node.id, path: fullPath, depth });
        }
      } else if (stats.isFile() || stats.isSymbolicLink() || (!entryIsDirectory && !stats.isDirectory())) {
        if (!shouldInclude(compiled, fullPath, entryName)) return;
        const size = Number(stats.size);
        addNode({
          parentId: parent.id,
          fullPath,
          depth,
          isDirectory: false,
          isSymbolicLink,
          size,
          stats
        });
        counters.scannedFiles += 1;
        counters.scannedBytes += size;
        bumpAncestors(parent.id, { size, allocatedSize: size, files: 1 });
      }
    } catch (error) {
      pushError(errors, counters, fullPath, error);
    }
  }

  async function scanDirectory(job: DirectoryJob): Promise<void> {
    report(job.path);
    if (normalized.maxDepth !== null && job.depth >= normalized.maxDepth) return;

    try {
      const directory = await opendir(toNodePath(job.path), { bufferSize: 256 });
      let batch: Array<{ name: string; isDirectory: boolean; isSymlink: boolean }> = [];

      async function flushBatch(): Promise<void> {
        const pending = batch;
        batch = [];
        await Promise.all(
          pending.map((entry) => processEntry(job, entry.name, entry.isDirectory, entry.isSymlink))
        );
      }

      for await (const entry of directory) {
        batch.push({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isSymlink: entry.isSymbolicLink()
        });
        if (batch.length >= 128) {
          await flushBatch();
          report(job.path);
        }
      }

      if (batch.length > 0) {
        await flushBatch();
      }
    } catch (error) {
      pushError(errors, counters, job.path, error);
    }
  }

  hooks.onProgress?.({
    phase: "queued",
    currentPath: normalized.roots.join("; "),
    scannedFiles: 0,
    scannedFolders: 0,
    scannedBytes: 0,
    errors: 0
  });

  for (const root of normalized.roots) {
    const name = baseName(root);
    if (shouldExclude(compiled, root, name)) continue;

    try {
      const stats = await lstatPath(toNodePath(root));
      if (stats.isDirectory()) {
        await registerDirectory(root, null, 0, stats.isSymbolicLink());
      } else {
        await registerFile(root, null, 0, stats.isSymbolicLink());
        const created = nodes.at(-1);
        if (created) rootIds.push(created.id);
      }
    } catch (error) {
      pushError(errors, counters, root, error);
    }
  }

  const workers = Array.from({ length: normalized.concurrency }, async () => {
    while (cursor < queue.length) {
      const job = queue[cursor];
      cursor += 1;
      if (job) await scanDirectory(job);
    }
  });
  await Promise.all(workers);

  report("finalizing", "finalizing", true);

  for (const node of [...nodes].sort((left, right) => right.depth - left.depth)) {
    if (!node.isDirectory) continue;

    let size = 0;
    let allocatedSize = 0;
    let fileCount = 0;
    let folderCount = 1;
    for (const childId of node.children) {
      const child = nodes[childId];
      if (!child) continue;
      size += child.size;
      allocatedSize += child.allocatedSize;
      fileCount += child.fileCount;
      folderCount += child.folderCount;
    }
    node.size = size;
    node.allocatedSize = allocatedSize;
    node.fileCount = fileCount;
    node.folderCount = folderCount;
  }

  const durationMs = performance.now() - startedAt;
  const result: ScanResult = {
    schemaVersion: 1,
    scannedAt: new Date().toISOString(),
    roots: normalized.roots,
    options: normalized,
    rootIds,
    nodes,
    totals: {
      bytes: rootIds.reduce((total, id) => total + (nodes[id]?.size ?? 0), 0),
      allocatedBytes: rootIds.reduce((total, id) => total + (nodes[id]?.allocatedSize ?? 0), 0),
      files: rootIds.reduce((total, id) => total + (nodes[id]?.fileCount ?? 0), 0),
      folders: rootIds.reduce((total, id) => total + (nodes[id]?.folderCount ?? 0), 0),
      errors: counters.errors,
      durationMs
    },
    errors
  };

  hooks.onProgress?.({
    phase: "complete",
    currentPath: "complete",
    scannedFiles: result.totals.files,
    scannedFolders: result.totals.folders,
    scannedBytes: result.totals.bytes,
    errors: result.totals.errors
  });

  return result;
}
