import type { CompareEntry, CompareResult, ScanResult } from "../shared/types";

function comparableNodes(result: ScanResult): Map<string, number> {
  const map = new Map<string, number>();
  for (const node of result.nodes) {
    map.set(node.path.toLowerCase(), node.size);
  }
  return map;
}

export function compareScans(previous: ScanResult, current: ScanResult): CompareResult {
  const before = comparableNodes(previous);
  const after = comparableNodes(current);
  const entries: CompareEntry[] = [];

  for (const [nodePath, previousSize] of before) {
    const currentSize = after.get(nodePath);
    if (currentSize === undefined) {
      entries.push({ path: nodePath, previousSize, currentSize: 0, delta: -previousSize, status: "removed" });
    } else if (currentSize !== previousSize) {
      entries.push({
        path: nodePath,
        previousSize,
        currentSize,
        delta: currentSize - previousSize,
        status: "changed"
      });
    }
  }

  for (const [nodePath, currentSize] of after) {
    if (!before.has(nodePath)) {
      entries.push({ path: nodePath, previousSize: 0, currentSize, delta: currentSize, status: "added" });
    }
  }

  const addedBytes = entries.filter((entry) => entry.status === "added").reduce((total, entry) => total + entry.delta, 0);
  const removedBytes = Math.abs(
    entries.filter((entry) => entry.status === "removed").reduce((total, entry) => total + entry.delta, 0)
  );
  const changedBytes = entries
    .filter((entry) => entry.status === "changed")
    .reduce((total, entry) => total + Math.abs(entry.delta), 0);

  return {
    previousScannedAt: previous.scannedAt,
    currentScannedAt: current.scannedAt,
    totalDelta: current.totals.bytes - previous.totals.bytes,
    addedBytes,
    removedBytes,
    changedBytes,
    entries: entries.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
  };
}
