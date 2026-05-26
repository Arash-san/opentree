import type { AgeBucket, ExtensionSummary, ScanNode, ScanResult } from "./types";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function topChildren(result: ScanResult, parentId: number, limit = 20): ScanNode[] {
  const byId = new Map(result.nodes.map((node) => [node.id, node]));
  const parent = byId.get(parentId);
  if (!parent) return [];

  return parent.children
    .map((id) => byId.get(id))
    .filter((node): node is ScanNode => Boolean(node))
    .sort((left, right) => right.size - left.size)
    .slice(0, limit);
}

export function extensionSummary(result: ScanResult, limit = 16): ExtensionSummary[] {
  const map = new Map<string, ExtensionSummary>();

  for (const node of result.nodes) {
    if (node.isDirectory) continue;
    const extension = node.extension || "(none)";
    const previous = map.get(extension) ?? { extension, bytes: 0, files: 0 };
    previous.bytes += node.size;
    previous.files += 1;
    map.set(extension, previous);
  }

  return [...map.values()].sort((left, right) => right.bytes - left.bytes).slice(0, limit);
}

export function ageBuckets(result: ScanResult, now = Date.now()): AgeBucket[] {
  const buckets: AgeBucket[] = [
    { label: "7 days", bytes: 0, files: 0 },
    { label: "30 days", bytes: 0, files: 0 },
    { label: "1 year", bytes: 0, files: 0 },
    { label: "Older", bytes: 0, files: 0 },
    { label: "Unknown", bytes: 0, files: 0 }
  ];

  for (const node of result.nodes) {
    if (node.isDirectory) continue;
    const time = node.modifiedAt ? Date.parse(node.modifiedAt) : Number.NaN;
    let index = 4;

    if (Number.isFinite(time)) {
      const days = (now - time) / 86_400_000;
      if (days <= 7) index = 0;
      else if (days <= 30) index = 1;
      else if (days <= 365) index = 2;
      else index = 3;
    }

    buckets[index].bytes += node.size;
    buckets[index].files += 1;
  }

  return buckets.filter((bucket) => bucket.files > 0);
}

export interface TreemapNode {
  name: string;
  path: string;
  size: number;
  children?: TreemapNode[];
}

export function treemapData(result: ScanResult, rootId: number, maxDepth = 2, maxChildren = 14): TreemapNode[] {
  const byId = new Map(result.nodes.map((node) => [node.id, node]));

  function walk(id: number, depth: number): TreemapNode | null {
    const node = byId.get(id);
    if (!node || node.size <= 0) return null;

    const childNodes =
      node.isDirectory && depth < maxDepth
        ? node.children
            .map((childId) => byId.get(childId))
            .filter((child): child is ScanNode => child !== undefined && child.size > 0)
            .sort((left, right) => right.size - left.size)
            .slice(0, maxChildren)
            .map((child: ScanNode) => walk(child.id, depth + 1))
            .filter((child): child is TreemapNode => Boolean(child))
        : [];

    return {
      name: node.name,
      path: node.path,
      size: node.size,
      children: childNodes.length > 0 ? childNodes : undefined
    };
  }

  const root = walk(rootId, 0);
  return root ? [root] : [];
}

export function filesOnly(result: ScanResult): ScanNode[] {
  return result.nodes.filter((node) => !node.isDirectory);
}
