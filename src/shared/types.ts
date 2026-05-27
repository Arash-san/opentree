export type ExportFormat = "json" | "csv" | "xlsx" | "html" | "pdf";

export type ScanPhase = "queued" | "scanning" | "finalizing" | "complete";

export interface ScanOptions {
  roots: string[];
  include?: string[];
  exclude?: string[];
  maxDepth?: number;
  followSymlinks?: boolean;
  concurrency?: number;
}

export interface ScanNode {
  id: number;
  parentId: number | null;
  path: string;
  name: string;
  extension: string;
  depth: number;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  size: number;
  allocatedSize: number;
  modifiedAt: string | null;
  createdAt: string | null;
  accessedAt: string | null;
  children: number[];
  fileCount: number;
  folderCount: number;
}

export interface ScanError {
  path: string;
  message: string;
  code?: string;
}

export interface ScanTotals {
  bytes: number;
  allocatedBytes: number;
  files: number;
  folders: number;
  errors: number;
  durationMs: number;
}

export interface ScanResult {
  schemaVersion: 1;
  scannedAt: string;
  roots: string[];
  options: Required<Omit<ScanOptions, "maxDepth">> & { maxDepth: number | null };
  rootIds: number[];
  nodes: ScanNode[];
  totals: ScanTotals;
  errors: ScanError[];
}

export interface ScanProgress {
  phase: ScanPhase;
  currentPath: string;
  scannedFiles: number;
  scannedFolders: number;
  scannedBytes: number;
  errors: number;
  partialResult?: ScanResult;
}

export interface DriveInfo {
  path: string;
  name: string;
}

export interface ExtensionSummary {
  extension: string;
  bytes: number;
  files: number;
}

export interface AgeBucket {
  label: string;
  bytes: number;
  files: number;
}

export interface DuplicateOptions {
  hash?: boolean;
  algorithm?: "sha256" | "md5";
  minSize?: number;
  concurrency?: number;
}

export interface DuplicateFile {
  path: string;
  name: string;
  size: number;
  modifiedAt: string | null;
  hash?: string;
}

export interface DuplicateGroup {
  key: string;
  size: number;
  wastedBytes: number;
  files: DuplicateFile[];
}

export interface CompareEntry {
  path: string;
  previousSize: number;
  currentSize: number;
  delta: number;
  status: "added" | "removed" | "changed";
}

export interface CompareResult {
  previousScannedAt: string;
  currentScannedAt: string;
  totalDelta: number;
  addedBytes: number;
  removedBytes: number;
  changedBytes: number;
  entries: CompareEntry[];
}

export interface UpdateStatus {
  state:
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  version?: string;
  message?: string;
  percent?: number;
}

export interface ItemContextMenuRequest {
  path: string;
  paths?: string[];
  x: number;
  y: number;
}

export interface ElectronApi {
  chooseFolders(): Promise<string[]>;
  listDrives(): Promise<DriveInfo[]>;
  startScan(options: ScanOptions): Promise<ScanResult>;
  cancelScan(): Promise<void>;
  exportScan(payload: { result: ScanResult; format: ExportFormat }): Promise<string | null>;
  saveIndex(result: ScanResult): Promise<string | null>;
  loadIndex(): Promise<ScanResult | null>;
  compareWithIndex(): Promise<CompareResult | null>;
  findDuplicates(payload: {
    options: DuplicateOptions;
  }): Promise<DuplicateGroup[]>;
  showItemContextMenu(payload: ItemContextMenuRequest): Promise<void>;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  onScanProgress(callback: (progress: ScanProgress) => void): () => void;
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
}
