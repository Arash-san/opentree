export interface FileSelectionInput {
  visibleIds: number[];
  selectedIds: ReadonlySet<number>;
  focusedId: number | null;
  clickedId: number;
  additive: boolean;
  range: boolean;
}

export interface FileSelectionResult {
  selectedIds: Set<number>;
  focusedId: number;
}

export function nextFileSelection(input: FileSelectionInput): FileSelectionResult {
  if (input.range && input.focusedId !== null) {
    const anchorIndex = input.visibleIds.indexOf(input.focusedId);
    const clickedIndex = input.visibleIds.indexOf(input.clickedId);
    if (anchorIndex !== -1 && clickedIndex !== -1) {
      const start = Math.min(anchorIndex, clickedIndex);
      const end = Math.max(anchorIndex, clickedIndex);
      return {
        focusedId: input.clickedId,
        selectedIds: new Set(input.visibleIds.slice(start, end + 1))
      };
    }
  }

  if (input.additive) {
    const selectedIds = new Set(input.selectedIds);
    if (selectedIds.has(input.clickedId)) {
      selectedIds.delete(input.clickedId);
    } else {
      selectedIds.add(input.clickedId);
    }
    return { focusedId: input.clickedId, selectedIds };
  }

  return { focusedId: input.clickedId, selectedIds: new Set([input.clickedId]) };
}
