import type { ScanNode, ScanResult } from "../../shared/types";

function nodeMap(result: ScanResult): Map<number, ScanNode> {
  return new Map(result.nodes.map((node) => [node.id, node]));
}

function filesUnder(scope: ScanNode, byId: Map<number, ScanNode>): ScanNode[] {
  if (!scope.isDirectory) return [scope];

  const files: ScanNode[] = [];
  const stack = [...scope.children];
  while (stack.length > 0) {
    const node = byId.get(stack.pop() ?? -1);
    if (!node) continue;
    if (node.isDirectory) {
      stack.push(...node.children);
    } else {
      files.push(node);
    }
  }
  return files;
}

export function fileScopeForSelection(result: ScanResult, selectedId: number | null): ScanNode | null {
  if (selectedId === null) return null;
  const byId = nodeMap(result);
  const selected = byId.get(selectedId);
  if (!selected) return null;
  if (selected.isDirectory) return selected;
  return selected.parentId === null ? selected : (byId.get(selected.parentId) ?? selected);
}

export function visibleFilesForSelection(result: ScanResult | null, selectedId: number | null, search: string, limit = 2000): ScanNode[] {
  if (!result) return [];

  const byId = nodeMap(result);
  const scope = fileScopeForSelection(result, selectedId);
  const query = search.trim().toLowerCase();
  const candidates = scope ? filesUnder(scope, byId) : result.nodes.filter((node) => !node.isDirectory);

  return candidates
    .filter((node) => !query || node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query))
    .sort((left, right) => right.size - left.size)
    .slice(0, limit);
}
