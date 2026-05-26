import {
  AlertTriangle,
  Archive,
  BarChart3,
  Binary,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  Files,
  Folder,
  FolderOpen,
  GitCompare,
  HardDrive,
  History,
  LayoutDashboard,
  ListFilter,
  Loader2,
  PieChart as PieChartIcon,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  TableProperties,
  Zap
} from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis
} from "recharts";
import { ageBuckets, extensionSummary, filesOnly, formatBytes, formatDuration, treemapData } from "../../shared/format";
import type {
  AgeBucket,
  CompareResult,
  DuplicateGroup,
  DriveInfo,
  ElectronApi,
  ExportFormat,
  ScanNode,
  ScanProgress,
  ScanResult,
  UpdateStatus
} from "../../shared/types";

type ChartMode = "treemap" | "extensions" | "age";
type AppTab = "overview" | "files" | "duplicates" | "compare" | "exports";

const CHART_COLORS = ["#55d6be", "#68a8ff", "#f3b44e", "#e66d92", "#8f7aff", "#a3e635", "#fb7185"];
const TREE_ROW_HEIGHT = 32;
const FILE_ROW_HEIGHT = 38;
const VIRTUAL_OVERSCAN = 10;

function demoScanResult(root = "C:\\Sample\\Workspace"): ScanResult {
  const scannedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    scannedAt,
    roots: [root],
    options: { roots: [root], include: [], exclude: [], followSymlinks: false, concurrency: 8, maxDepth: null },
    rootIds: [0],
    nodes: [
      {
        id: 0,
        parentId: null,
        path: root,
        name: "Workspace",
        extension: "",
        depth: 0,
        isDirectory: true,
        isSymbolicLink: false,
        size: 734003200,
        allocatedSize: 734003200,
        modifiedAt: scannedAt,
        createdAt: scannedAt,
        accessedAt: scannedAt,
        children: [1, 4, 7],
        fileCount: 5,
        folderCount: 3
      },
      {
        id: 1,
        parentId: 0,
        path: `${root}\\Media`,
        name: "Media",
        extension: "",
        depth: 1,
        isDirectory: true,
        isSymbolicLink: false,
        size: 492830720,
        allocatedSize: 492830720,
        modifiedAt: scannedAt,
        createdAt: scannedAt,
        accessedAt: scannedAt,
        children: [2, 3],
        fileCount: 2,
        folderCount: 1
      },
      {
        id: 2,
        parentId: 1,
        path: `${root}\\Media\\launch.mov`,
        name: "launch.mov",
        extension: ".mov",
        depth: 2,
        isDirectory: false,
        isSymbolicLink: false,
        size: 314572800,
        allocatedSize: 314572800,
        modifiedAt: scannedAt,
        createdAt: scannedAt,
        accessedAt: scannedAt,
        children: [],
        fileCount: 1,
        folderCount: 0
      },
      {
        id: 3,
        parentId: 1,
        path: `${root}\\Media\\archive.zip`,
        name: "archive.zip",
        extension: ".zip",
        depth: 2,
        isDirectory: false,
        isSymbolicLink: false,
        size: 178257920,
        allocatedSize: 178257920,
        modifiedAt: scannedAt,
        createdAt: scannedAt,
        accessedAt: scannedAt,
        children: [],
        fileCount: 1,
        folderCount: 0
      },
      {
        id: 4,
        parentId: 0,
        path: `${root}\\Design`,
        name: "Design",
        extension: "",
        depth: 1,
        isDirectory: true,
        isSymbolicLink: false,
        size: 188743680,
        allocatedSize: 188743680,
        modifiedAt: scannedAt,
        createdAt: scannedAt,
        accessedAt: scannedAt,
        children: [5, 6],
        fileCount: 2,
        folderCount: 1
      },
      {
        id: 5,
        parentId: 4,
        path: `${root}\\Design\\mockup.psd`,
        name: "mockup.psd",
        extension: ".psd",
        depth: 2,
        isDirectory: false,
        isSymbolicLink: false,
        size: 125829120,
        allocatedSize: 125829120,
        modifiedAt: scannedAt,
        createdAt: scannedAt,
        accessedAt: scannedAt,
        children: [],
        fileCount: 1,
        folderCount: 0
      },
      {
        id: 6,
        parentId: 4,
        path: `${root}\\Design\\mockup-copy.psd`,
        name: "mockup-copy.psd",
        extension: ".psd",
        depth: 2,
        isDirectory: false,
        isSymbolicLink: false,
        size: 62914560,
        allocatedSize: 62914560,
        modifiedAt: scannedAt,
        createdAt: scannedAt,
        accessedAt: scannedAt,
        children: [],
        fileCount: 1,
        folderCount: 0
      },
      {
        id: 7,
        parentId: 0,
        path: `${root}\\notes.md`,
        name: "notes.md",
        extension: ".md",
        depth: 1,
        isDirectory: false,
        isSymbolicLink: false,
        size: 52428800,
        allocatedSize: 52428800,
        modifiedAt: scannedAt,
        createdAt: scannedAt,
        accessedAt: scannedAt,
        children: [],
        fileCount: 1,
        folderCount: 0
      }
    ],
    totals: { bytes: 734003200, allocatedBytes: 734003200, files: 5, folders: 3, errors: 0, durationMs: 284 },
    errors: []
  };
}

const fallbackApi: ElectronApi = {
  chooseFolders: async () => ["C:\\Sample\\Workspace"],
  listDrives: async () => [
    { path: "C:\\", name: "C: Drive" },
    { path: "D:\\", name: "D: Drive" }
  ],
  startScan: async (options) => demoScanResult(options.roots[0]),
  cancelScan: async () => undefined,
  exportScan: async () => null,
  saveIndex: async () => null,
  loadIndex: async () => demoScanResult(),
  compareWithIndex: async () => ({
    previousScannedAt: new Date(Date.now() - 86_400_000).toISOString(),
    currentScannedAt: new Date().toISOString(),
    totalDelta: 52_428_800,
    addedBytes: 52_428_800,
    removedBytes: 0,
    changedBytes: 125_829_120,
    entries: [
      { path: "C:\\Sample\\Workspace\\notes.md", previousSize: 0, currentSize: 52_428_800, delta: 52_428_800, status: "added" },
      {
        path: "C:\\Sample\\Workspace\\Design\\mockup.psd",
        previousSize: 104_857_600,
        currentSize: 125_829_120,
        delta: 20_971_520,
        status: "changed"
      }
    ]
  }),
  findDuplicates: async () => [
    {
      key: "demo",
      size: 62_914_560,
      wastedBytes: 62_914_560,
      files: [
        { path: "C:\\Sample\\Workspace\\Design\\mockup.psd", name: "mockup.psd", size: 62_914_560, modifiedAt: new Date().toISOString() },
        {
          path: "C:\\Sample\\Workspace\\Design\\mockup-copy.psd",
          name: "mockup-copy.psd",
          size: 62_914_560,
          modifiedAt: new Date().toISOString()
        }
      ]
    }
  ],
  showItemContextMenu: async () => undefined,
  checkForUpdates: async () => undefined,
  installUpdate: async () => undefined,
  onScanProgress: () => () => undefined,
  onUpdateStatus: () => () => undefined
};

function openTreeApi(): ElectronApi {
  return window.openTree ?? fallbackApi;
}

function splitPatterns(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function useNodeMap(result: ScanResult | null): Map<number, ScanNode> {
  return useMemo(() => new Map(result?.nodes.map((node) => [node.id, node]) ?? []), [result]);
}

function useVirtualWindow(itemCount: number, rowHeight: number, overscan = VIRTUAL_OVERSCAN) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });

  const syncViewport = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setViewport({ height: element.clientHeight, scrollTop: element.scrollTop });
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    const onScroll = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        syncViewport();
      });
    };

    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(element);
    syncViewport();
    element.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      element.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [syncViewport]);

  const start = Math.max(0, Math.floor(viewport.scrollTop / rowHeight) - overscan);
  const end = Math.min(itemCount, Math.ceil((viewport.scrollTop + viewport.height) / rowHeight) + overscan);

  const scrollToIndex = useCallback(
    (index: number) => {
      const element = scrollRef.current;
      if (!element || index < 0) return;
      const rowTop = index * rowHeight;
      const rowBottom = rowTop + rowHeight;
      if (rowTop < element.scrollTop) {
        element.scrollTop = rowTop;
      } else if (rowBottom > element.scrollTop + element.clientHeight) {
        element.scrollTop = rowBottom - element.clientHeight;
      }
    },
    [rowHeight]
  );

  return {
    end,
    scrollRef,
    scrollToIndex,
    start,
    totalHeight: itemCount * rowHeight
  };
}

function Metric(props: { label: string; value: string; tone?: "cyan" | "green" | "amber" | "rose" }) {
  return (
    <div className={`metric metric-${props.tone ?? "cyan"}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function IconButton(props: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <button
      className={`icon-button ${props.variant ?? "ghost"}`}
      type="button"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.icon}
    </button>
  );
}

function SidebarAction(props: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <button className={`sidebar-action ${props.variant ?? "ghost"}`} type="button" onClick={props.onClick} disabled={props.disabled}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function NodeIcon({ node, expanded }: { node: ScanNode; expanded?: boolean }) {
  if (node.isDirectory) {
    return expanded ? <FolderOpen size={15} /> : <Folder size={15} />;
  }

  const extension = node.extension.toLowerCase();
  if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(extension)) return <Archive size={15} />;
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico"].includes(extension)) return <FileImage size={15} />;
  if ([".mp4", ".mov", ".mkv", ".avi", ".webm"].includes(extension)) return <FileVideo size={15} />;
  if ([".mp3", ".wav", ".flac", ".aac", ".ogg"].includes(extension)) return <FileAudio size={15} />;
  if ([".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html", ".py", ".rs", ".go"].includes(extension)) return <FileCode2 size={15} />;
  if ([".pdf", ".doc", ".docx", ".md", ".txt", ".rtf"].includes(extension)) return <FileText size={15} />;
  if (extension && extension !== "(none)") return <FileType2 size={15} />;
  return <File size={15} />;
}

function TextInput(props: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <div className="input-shell">
        {props.icon}
        <input value={props.value} placeholder={props.placeholder} onChange={(event) => props.onChange(event.target.value)} />
      </div>
    </label>
  );
}

function Toggle(props: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span />
      {props.label}
    </label>
  );
}

function ProgressBar({ progress }: { progress: ScanProgress | null }) {
  if (!progress) return null;
  const moving = progress.phase !== "complete";
  return (
    <div className="progress">
      <div className="progress-top">
        <span>{progress.phase}</span>
        <strong>{formatBytes(progress.scannedBytes)}</strong>
      </div>
      <div className="progress-track">
        <div className={moving ? "progress-fill active" : "progress-fill"} />
      </div>
      <div className="progress-path">{progress.currentPath}</div>
    </div>
  );
}

const TreeRow = memo(function TreeRow(props: {
  node: ScanNode;
  expanded: boolean;
  hasChildren: boolean;
  selected: boolean;
  top: number;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onContextMenu: (node: ScanNode, x: number, y: number) => void;
}) {
  return (
    <button
      className={`tree-row virtual-row ${props.selected ? "selected" : ""}`}
      type="button"
      role="treeitem"
      aria-selected={props.selected}
      aria-expanded={props.hasChildren ? props.expanded : undefined}
      onClick={() => props.onSelect(props.node.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onContextMenu(props.node, event.screenX, event.screenY);
      }}
      style={{
        paddingLeft: `${12 + Math.min(props.node.depth, 12) * 14}px`,
        transform: `translateY(${props.top}px)`
      }}
    >
      <span
        className="tree-toggle"
        onClick={(event) => {
          event.stopPropagation();
          if (props.hasChildren) props.onToggle(props.node.id);
        }}
      >
        {props.hasChildren ? props.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span />}
      </span>
      <span className="tree-icon">
        <NodeIcon node={props.node} expanded={props.expanded} />
      </span>
      <span className="tree-name">{props.node.name}</span>
      <span className="tree-size">{formatBytes(props.node.size)}</span>
    </button>
  );
});

function TreeRows(props: {
  result: ScanResult;
  selectedId: number | null;
  expanded: Set<number>;
  search: string;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onContextMenu: (node: ScanNode, x: number, y: number) => void;
}) {
  const byId = useNodeMap(props.result);
  const childOrder = useMemo(() => {
    const ordered = new Map<number, number[]>();
    for (const node of props.result.nodes) {
      if (node.children.length === 0) continue;
      ordered.set(
        node.id,
        [...node.children].sort((left, right) => (byId.get(right)?.size ?? 0) - (byId.get(left)?.size ?? 0))
      );
    }
    return ordered;
  }, [byId, props.result]);
  const visible = useMemo(() => {
    const search = props.search.trim().toLowerCase();
    const included = new Set<number>();

    if (search) {
      for (const node of props.result.nodes) {
        if (!node.name.toLowerCase().includes(search) && !node.path.toLowerCase().includes(search)) continue;
        let current: ScanNode | undefined = node;
        while (current) {
          included.add(current.id);
          current = current.parentId === null ? undefined : byId.get(current.parentId);
        }
      }
    }

    const rows: ScanNode[] = [];
    const visit = (id: number) => {
      const node = byId.get(id);
      if (!node) return;
      if (search && !included.has(id)) return;
      rows.push(node);
      if (!props.expanded.has(id)) return;
      for (const childId of childOrder.get(id) ?? node.children) visit(childId);
    };

    for (const rootId of props.result.rootIds) visit(rootId);
    return rows;
  }, [byId, childOrder, props.expanded, props.result, props.search]);
  const visibleIndex = useMemo(() => new Map(visible.map((node, index) => [node.id, index])), [visible]);
  const selectedIndex = props.selectedId === null ? -1 : (visibleIndex.get(props.selectedId) ?? -1);
  const virtual = useVirtualWindow(visible.length, TREE_ROW_HEIGHT);

  function selectedNode(): ScanNode | null {
    if (props.selectedId === null) return null;
    return byId.get(props.selectedId) ?? null;
  }

  function selectIndex(index: number) {
    const next = visible[index];
    if (!next) return;
    props.onSelect(next.id);
    virtual.scrollToIndex(index);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = selectedNode() ?? visible[0];
    if (!current) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectIndex(Math.min(visible.length - 1, Math.max(0, selectedIndex) + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectIndex(Math.max(0, Math.max(0, selectedIndex) - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (current.isDirectory && current.children.length > 0 && !props.expanded.has(current.id)) {
        props.onToggle(current.id);
      } else if (current.isDirectory && current.children.length > 0) {
        const firstVisibleChild = (childOrder.get(current.id) ?? current.children)
          .map((childId) => visibleIndex.get(childId))
          .find((index): index is number => index !== undefined);
        if (firstVisibleChild !== undefined) selectIndex(firstVisibleChild);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (current.isDirectory && props.expanded.has(current.id)) {
        props.onToggle(current.id);
      } else if (current.parentId !== null) {
        props.onSelect(current.parentId);
        virtual.scrollToIndex(visibleIndex.get(current.parentId) ?? selectedIndex);
      }
    } else if (event.key === "Enter" && current.isDirectory && current.children.length > 0) {
      event.preventDefault();
      props.onToggle(current.id);
    }
  }

  return (
    <div className="tree-list" role="tree" tabIndex={0} onKeyDown={handleKeyDown} ref={virtual.scrollRef}>
      <div className="virtual-spacer" style={{ height: virtual.totalHeight }}>
        {visible.slice(virtual.start, virtual.end).map((node, offset) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = props.expanded.has(node.id);
        return (
          <TreeRow
            key={node.id}
            node={node}
            expanded={isExpanded}
            hasChildren={hasChildren}
            selected={props.selectedId === node.id}
            top={(virtual.start + offset) * TREE_ROW_HEIGHT}
            onSelect={props.onSelect}
            onToggle={props.onToggle}
            onContextMenu={props.onContextMenu}
          />
        );
      })}
      </div>
    </div>
  );
}

function TreemapCell(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  index?: number;
}) {
  const width = props.width ?? 0;
  const height = props.height ?? 0;
  const x = props.x ?? 0;
  const y = props.y ?? 0;
  const color = CHART_COLORS[(props.index ?? 0) % CHART_COLORS.length];
  const maxChars = Math.max(0, Math.floor((width - 22) / 7));
  const label = maxChars > 4 ? `${props.name ?? ""}`.slice(0, maxChars) : "";
  const truncated = label.length < `${props.name ?? ""}`.length ? `${label.slice(0, Math.max(1, label.length - 1))}...` : label;
  const showName = width > 118 && height > 54 && truncated.length > 0;
  const showSize = width > 118 && height > 76;
  const clipId = `treemap-clip-${props.index ?? 0}-${Math.round(x)}-${Math.round(y)}`;

  return (
    <g>
      <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={Math.max(0, height - 4)} rx={5} fill={color} opacity={0.85} />
      <clipPath id={clipId}>
        <rect x={x + 8} y={y + 8} width={Math.max(0, width - 16)} height={Math.max(0, height - 16)} rx={4} />
      </clipPath>
      {showName && (
        <>
          <text x={x + 10} y={y + 24} fill="#071017" fontSize={12} fontWeight={700} clipPath={`url(#${clipId})`}>
            {truncated}
          </text>
          {showSize && (
            <text x={x + 10} y={y + 42} fill="#071017" fontSize={11} clipPath={`url(#${clipId})`}>
              {formatBytes(props.size ?? 0)}
            </text>
          )}
        </>
      )}
    </g>
  );
}

function ChartPanel({ result, mode, setMode }: { result: ScanResult | null; mode: ChartMode; setMode: (mode: ChartMode) => void }) {
  const rootId = result?.rootIds[0];
  const treemap = useMemo(() => (result && rootId !== undefined ? treemapData(result, rootId) : []), [result, rootId]);
  const extensions = useMemo(() => (result ? extensionSummary(result, 14) : []), [result]);
  const ages = useMemo(() => (result ? ageBuckets(result) : []), [result]);

  return (
    <section className="visual-panel">
      <div className="panel-head">
        <div className="segmented">
          <button className={mode === "treemap" ? "active" : ""} type="button" onClick={() => setMode("treemap")} title="Treemap">
            <Binary size={16} />
          </button>
          <button className={mode === "extensions" ? "active" : ""} type="button" onClick={() => setMode("extensions")} title="Extensions">
            <BarChart3 size={16} />
          </button>
          <button className={mode === "age" ? "active" : ""} type="button" onClick={() => setMode("age")} title="Age">
            <PieChartIcon size={16} />
          </button>
        </div>
      </div>
      <div className="chart-stage">
        {!result && <div className="empty-state">No scan loaded</div>}
        {result && mode === "treemap" && (
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={treemap} dataKey="size" stroke="transparent" content={<TreemapCell />} isAnimationActive={false} />
          </ResponsiveContainer>
        )}
        {result && mode === "extensions" && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={extensions} margin={{ top: 8, right: 12, bottom: 22, left: 8 }}>
              <XAxis dataKey="extension" stroke="#7f8ea3" fontSize={11} interval={0} angle={-35} textAnchor="end" height={52} />
              <YAxis stroke="#7f8ea3" fontSize={11} tickFormatter={formatBytes} width={64} />
              <Tooltip contentStyle={{ background: "#111923", border: "1px solid #2a3a50", color: "#e7edf7" }} formatter={(value) => formatBytes(Number(value))} />
              <Bar dataKey="bytes" radius={[5, 5, 0, 0]}>
                {extensions.map((entry, index) => (
                  <Cell key={entry.extension} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        {result && mode === "age" && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={ages} dataKey="bytes" nameKey="label" outerRadius="78%" innerRadius="48%" paddingAngle={2}>
                {ages.map((entry: AgeBucket, index) => (
                  <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#111923", border: "1px solid #2a3a50", color: "#e7edf7" }} formatter={(value) => formatBytes(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function DetailsTable({
  result,
  selectedId,
  search,
  onContextMenu
}: {
  result: ScanResult | null;
  selectedId: number | null;
  search: string;
  onContextMenu: (node: ScanNode, x: number, y: number) => void;
}) {
  const byId = useNodeMap(result);
  const selected = selectedId === null ? null : byId.get(selectedId);
  const files = useMemo(() => {
    if (!result) return [];
    const query = search.trim().toLowerCase();
    const candidates = selected?.isDirectory
      ? result.nodes.filter((node) => !node.isDirectory && node.path.toLowerCase().startsWith(selected.path.toLowerCase()))
      : selected && !selected.isDirectory
        ? [selected]
        : filesOnly(result);

    return candidates
      .filter((node) => !query || node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query))
      .sort((left, right) => right.size - left.size)
      .slice(0, 2000);
  }, [result, search, selected]);
  const virtual = useVirtualWindow(files.length, FILE_ROW_HEIGHT);

  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h2>Files</h2>
          <span>{files.length.toLocaleString()} visible</span>
        </div>
      </div>
      <div className="file-grid">
        <div className="file-grid-header">
          <span>Name</span>
          <span>Size</span>
          <span>Extension</span>
          <span>Modified</span>
          <span>Path</span>
        </div>
        <div className="table-scroll" ref={virtual.scrollRef}>
          <div className="virtual-spacer file-spacer" style={{ height: virtual.totalHeight }}>
            {files.slice(virtual.start, virtual.end).map((file, offset) => (
              <div
                className="file-row virtual-row"
                key={file.id}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onContextMenu(file, event.screenX, event.screenY);
                }}
                style={{ transform: `translateY(${(virtual.start + offset) * FILE_ROW_HEIGHT}px)` }}
              >
                <span className="file-cell">
                  <NodeIcon node={file} />
                  {file.name}
                </span>
                <span>{formatBytes(file.size)}</span>
                <span>{file.extension}</span>
                <span>{file.modifiedAt ? new Date(file.modifiedAt).toLocaleString() : ""}</span>
                <span className="path-cell">{file.path}</span>
              </div>
            ))}
          </div>
          {files.length === 0 && <div className="empty-state small">No files in view</div>}
        </div>
      </div>
    </section>
  );
}

function DuplicatePanel({
  groups,
  loading,
  onRun,
  onSaveIndex
}: {
  groups: DuplicateGroup[];
  loading: boolean;
  onRun: () => void;
  onSaveIndex: () => void;
}) {
  const wasted = groups.reduce((total, group) => total + group.wastedBytes, 0);
  return (
    <section className="side-panel">
      <div className="panel-head">
        <div>
          <h2>Duplicates</h2>
          <span>{formatBytes(wasted)} recoverable</span>
        </div>
        <IconButton title="Find duplicates" icon={loading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />} onClick={onRun} disabled={loading} />
      </div>
      <div className="duplicates-list">
        {groups.slice(0, 9).map((group) => (
          <div className="duplicate-group" key={group.key}>
            <strong>{formatBytes(group.wastedBytes)}</strong>
            <span>
              {group.files.length} copies · {formatBytes(group.size)}
            </span>
            <small>{group.files[0]?.name}</small>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="empty-action">
            <span>No duplicate groups loaded</span>
            <button type="button" onClick={onSaveIndex}>
              <Save size={15} />
              Save current index
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ComparePanel({ compare }: { compare: CompareResult | null }) {
  return (
    <section className="side-panel">
      <div className="panel-head">
        <div>
          <h2>Compare</h2>
          <span>{compare ? formatBytes(Math.abs(compare.totalDelta)) : "No index"}</span>
        </div>
        <History size={17} />
      </div>
      <div className="compare-list">
        {compare?.entries.slice(0, 8).map((entry) => (
          <div className={`compare-entry ${entry.delta >= 0 ? "gain" : "loss"}`} key={`${entry.status}:${entry.path}`}>
            <span>{entry.status}</span>
            <strong>{entry.delta >= 0 ? "+" : "-"}{formatBytes(Math.abs(entry.delta))}</strong>
            <small>{entry.path}</small>
          </div>
        ))}
        {!compare && <div className="empty-state small">No comparison</div>}
      </div>
    </section>
  );
}

function ScanStatusPanel({ progress, scanning, result }: { progress: ScanProgress | null; scanning: boolean; result: ScanResult | null }) {
  return (
    <section className="side-panel live-panel">
      <div className="panel-head">
        <div>
          <h2>{scanning ? "Scanning" : "Scan Status"}</h2>
          <span>{progress?.phase ?? "Ready"}</span>
        </div>
        {scanning ? <Loader2 className="spin" size={17} /> : <CheckCircle2 size={17} />}
      </div>
      <div className="live-body">
        <Metric label="Indexed" value={(progress?.scannedFiles ?? result?.totals.files ?? 0).toLocaleString()} tone="green" />
        <Metric label="Folders" value={(progress?.scannedFolders ?? result?.totals.folders ?? 0).toLocaleString()} tone="amber" />
        <Metric label="Bytes" value={formatBytes(progress?.scannedBytes ?? result?.totals.bytes ?? 0)} tone="cyan" />
        <div className="current-path">
          <span>Current</span>
          <strong>{progress?.currentPath ?? result?.roots[0] ?? "No active scan"}</strong>
        </div>
      </div>
    </section>
  );
}

function SelectionPanel({
  drives,
  scanning,
  progress,
  onPickFolders,
  onScanRoot,
  onLoadIndex
}: {
  drives: DriveInfo[];
  scanning: boolean;
  progress: ScanProgress | null;
  onPickFolders: () => void;
  onScanRoot: (root: string) => void;
  onLoadIndex: () => void;
}) {
  return (
    <section className="selection-stage">
      <div className="selection-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <Zap size={15} />
            Fast local indexing
          </div>
          <h2>Choose a folder or drive to begin.</h2>
          <p>OpenTree starts scanning immediately and streams indexed items into the workspace while the scan is still running.</p>
          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={onPickFolders} disabled={scanning}>
              <FolderOpen size={18} />
              Choose folder
            </button>
            <button className="secondary-action" type="button" onClick={onLoadIndex} disabled={scanning}>
              <FileArchive size={18} />
              Load index
            </button>
          </div>
        </div>
        <div className="drive-picker">
          <div className="panel-head compact">
            <div>
              <h2>Drives</h2>
              <span>{drives.length} available</span>
            </div>
            <HardDrive size={17} />
          </div>
          <div className="drive-grid">
            {drives.map((drive) => (
              <button key={drive.path} className="drive-card" type="button" onClick={() => onScanRoot(drive.path)} disabled={scanning}>
                <HardDrive size={20} />
                <strong>{drive.name}</strong>
                <span>{drive.path}</span>
              </button>
            ))}
            {drives.length === 0 && <div className="empty-state small">No drives found</div>}
          </div>
        </div>
      </div>
      {scanning && <ProgressBar progress={progress} />}
    </section>
  );
}

function TabBar({ activeTab, onChange }: { activeTab: AppTab; onChange: (tab: AppTab) => void }) {
  const tabs: Array<{ id: AppTab; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
    { id: "files", label: "Files", icon: <Files size={16} /> },
    { id: "duplicates", label: "Duplicates", icon: <Boxes size={16} /> },
    { id: "compare", label: "Compare", icon: <GitCompare size={16} /> },
    { id: "exports", label: "Exports", icon: <Download size={16} /> }
  ];

  return (
    <nav className="tabbar" aria-label="OpenTree sections">
      {tabs.map((tab) => (
        <button key={tab.id} className={activeTab === tab.id ? "active" : ""} type="button" onClick={() => onChange(tab.id)}>
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function ExportPanel({
  result,
  onSaveIndex,
  onExport,
  onCheckUpdates,
  update
}: {
  result: ScanResult | null;
  onSaveIndex: () => void;
  onExport: (format: ExportFormat) => void;
  onCheckUpdates: () => void;
  update: UpdateStatus;
}) {
  return (
    <section className="single-panel">
      <div className="panel-head">
        <div>
          <h2>Exports</h2>
          <span>{result ? "Reports and saved indexes" : "Run a scan first"}</span>
        </div>
        <Download size={18} />
      </div>
      <div className="export-cards">
        <button type="button" onClick={onSaveIndex} disabled={!result}>
          <Save size={22} />
          <strong>Save index</strong>
          <span>Store a scan for later comparison.</span>
        </button>
        <button type="button" onClick={() => onExport("json")} disabled={!result}>
          <FileJson size={22} />
          <strong>JSON</strong>
          <span>Raw structured scan data.</span>
        </button>
        <button type="button" onClick={() => onExport("csv")} disabled={!result}>
          <TableProperties size={22} />
          <strong>CSV</strong>
          <span>Rows for analysis tools.</span>
        </button>
        <button type="button" onClick={() => onExport("xlsx")} disabled={!result}>
          <FileSpreadsheet size={22} />
          <strong>XLSX</strong>
          <span>Spreadsheet workbook.</span>
        </button>
        <button type="button" onClick={() => onExport("html")} disabled={!result}>
          <FileText size={22} />
          <strong>HTML</strong>
          <span>Standalone report.</span>
        </button>
        <button type="button" onClick={() => onExport("pdf")} disabled={!result}>
          <Download size={22} />
          <strong>PDF</strong>
          <span>Printable summary.</span>
        </button>
        <button type="button" onClick={onCheckUpdates}>
          <RefreshCw size={22} />
          <strong>Updates</strong>
          <span>{update.message ?? update.state}</span>
        </button>
      </div>
    </section>
  );
}

export function App() {
  const api = openTreeApi();
  const [roots, setRoots] = useState<string[]>([]);
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("node_modules, .git, release, dist");
  const [maxDepth, setMaxDepth] = useState("");
  const [followSymlinks, setFollowSymlinks] = useState(false);
  const [concurrency, setConcurrency] = useState("16");
  const [search, setSearch] = useState("");
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [chartMode, setChartMode] = useState<ChartMode>("treemap");
  const [activeTab, setActiveTab] = useState<AppTab>("overview");
  const [folderPaneWidth, setFolderPaneWidth] = useState(420);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus>({ state: "idle" });
  const byId = useNodeMap(result);
  const selected = selectedId === null ? null : byId.get(selectedId);
  const deferredSelectedId = useDeferredValue(selectedId);
  const contentHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () =>
      api.onScanProgress((next) => {
        setProgress(next);
        if (next.partialResult) {
          setResult(next.partialResult);
        }
      }),
    [api]
  );
  useEffect(() => api.onUpdateStatus(setUpdate), [api]);

  useEffect(() => {
    void api.listDrives().then(setDrives).catch(() => setDrives([]));
  }, [api]);

  useEffect(() => {
    if (!result) return;
    setSelectedId((current) =>
      current !== null && result.nodes.some((node) => node.id === current) ? current : result.rootIds[0] ?? null
    );
    setExpanded((previous) => {
      const next = new Set(previous);
      for (const rootId of result.rootIds) next.add(rootId);
      return next;
    });
  }, [result]);

  useEffect(() => {
    const query = search.trim().toLowerCase();
    if (!query || !result) return;
    const byNodeId = new Map(result.nodes.map((node) => [node.id, node]));
    const matches = result.nodes.filter((node) => node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query));
    setExpanded((previous) => {
      const next = new Set(previous);
      for (const match of matches) {
        let parentId = match.parentId;
        while (parentId !== null) {
          next.add(parentId);
          parentId = byNodeId.get(parentId)?.parentId ?? null;
        }
      }
      return next;
    });
  }, [result, search]);

  async function chooseFolders() {
    const picked = await api.chooseFolders();
    if (picked.length > 0) await startScanForRoots(picked);
  }

  async function startScanForRoots(scanRoots: string[]) {
    if (scanRoots.length === 0) return;

    setRoots(scanRoots);
    setScanning(true);
    setResult(null);
    setSelectedId(null);
    setExpanded(new Set());
    setDuplicates([]);
    setCompare(null);
    setActiveTab("overview");
    try {
      const scan = await api.startScan({
        roots: scanRoots,
        include: splitPatterns(include),
        exclude: splitPatterns(exclude),
        maxDepth: maxDepth ? Number(maxDepth) : undefined,
        followSymlinks,
        concurrency: Number(concurrency) || 16
      });
      setResult(scan);
    } finally {
      setScanning(false);
    }
  }

  async function runScan() {
    if (roots.length === 0) {
      await chooseFolders();
      return;
    }
    await startScanForRoots(roots);
  }

  async function cancelScan() {
    await api.cancelScan();
    setScanning(false);
  }

  async function loadIndex() {
    const loaded = await api.loadIndex();
    if (loaded) {
      setRoots(loaded.roots);
      setResult(loaded);
      setScanning(false);
      setActiveTab("overview");
    }
  }

  const saveCurrentIndex = useCallback(() => {
    if (result) void api.saveIndex(result);
  }, [api, result]);

  const openItemContextMenu = useCallback(
    (node: ScanNode, x: number, y: number) => {
      setSelectedId(node.id);
      void api.showItemContextMenu({ path: node.path, x: Math.round(x), y: Math.round(y) });
    },
    [api]
  );

  async function compareWithIndex() {
    if (!result) return;
    setCompareLoading(true);
    try {
      const diff = await api.compareWithIndex();
      if (diff) setCompare(diff);
    } finally {
      setCompareLoading(false);
    }
  }

  async function runDuplicates() {
    if (!result) return;
    setDuplicatesLoading(true);
    try {
      setDuplicates(
        await api.findDuplicates({
          options: { hash: true, algorithm: "sha256", minSize: 1, concurrency: 4 }
        })
      );
    } finally {
      setDuplicatesLoading(false);
    }
  }

  async function exportAs(format: ExportFormat) {
    if (!result) return;
    await api.exportScan({ result, format });
  }

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function startPaneResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const bounds = contentHostRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const next = Math.round(moveEvent.clientX - bounds.left);
      setFolderPaneWidth(Math.min(Math.max(next, 280), Math.max(320, bounds.width - 360)));
    };
    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("resizing-panes");
    };

    document.body.classList.add("resizing-panes");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <HardDrive size={22} />
          </div>
          <div>
            <h1>OpenTree</h1>
            <span>{update.state === "downloaded" ? "Update ready" : "Folder analysis"}</span>
          </div>
        </div>

        <div className="sidebar-section primary-controls">
          <SidebarAction label="Choose and scan" icon={<FolderOpen size={17} />} onClick={chooseFolders} variant="primary" disabled={scanning} />
          <SidebarAction label="Rescan" icon={scanning ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />} onClick={runScan} disabled={scanning || roots.length === 0} />
          <SidebarAction label="Stop" icon={<CircleStop size={17} />} onClick={cancelScan} disabled={!scanning} variant="danger" />
        </div>

        <div className="sidebar-card">
          <div className="sidebar-label">
            <HardDrive size={14} />
            Target
          </div>
          <div className="roots">
            {roots.map((root) => (
              <div title={root} key={root}>
                {root}
              </div>
            ))}
            {roots.length === 0 && <div>No folder selected</div>}
          </div>
        </div>

        <div className="sidebar-card">
          <div className="sidebar-label">
            <Settings2 size={14} />
            Scan settings
          </div>
          <TextInput icon={<ListFilter size={15} />} label="Include" value={include} onChange={setInclude} placeholder="*.zip, *.mp4" />
          <TextInput icon={<ListFilter size={15} />} label="Exclude" value={exclude} onChange={setExclude} placeholder="node_modules, .git" />
          <div className="grid-fields">
            <TextInput icon={<Settings2 size={15} />} label="Depth" value={maxDepth} onChange={setMaxDepth} placeholder="all" />
            <TextInput icon={<Settings2 size={15} />} label="Threads" value={concurrency} onChange={setConcurrency} placeholder="16" />
          </div>
          <Toggle checked={followSymlinks} onChange={setFollowSymlinks} label="Follow links" />
        </div>

        <div className="sidebar-section utility-actions">
          <SidebarAction label="Load index" icon={<FileArchive size={16} />} onClick={loadIndex} />
          <SidebarAction label="Updates" icon={<Download size={16} />} onClick={() => void api.checkForUpdates()} />
        </div>

        {update.state === "downloaded" && (
          <button className="install-button" type="button" onClick={() => void api.installUpdate()}>
            <CheckCircle2 size={16} />
            Install update
          </button>
        )}

        {update.state === "error" && (
          <div className="warning">
            <AlertTriangle size={15} />
            {update.message}
          </div>
        )}

        <ProgressBar progress={progress} />
      </aside>

      <main className="main">
        <header className="topbar">
          <TextInput icon={<Search size={15} />} label="Search" value={search} onChange={setSearch} placeholder="name or path" />
          <div className="metrics">
            <Metric label="Size" value={formatBytes(result?.totals.bytes ?? 0)} tone="cyan" />
            <Metric label="Files" value={(result?.totals.files ?? 0).toLocaleString()} tone="green" />
            <Metric label="Folders" value={(result?.totals.folders ?? 0).toLocaleString()} tone="amber" />
            <Metric label="Time" value={result ? formatDuration(result.totals.durationMs) : "0 ms"} tone="rose" />
          </div>
        </header>

        <div className={`workspace ${!result ? "selection-workspace" : ""}`}>
          {!result ? (
            <SelectionPanel
              drives={drives}
              scanning={scanning}
              progress={progress}
              onPickFolders={chooseFolders}
              onScanRoot={(root) => void startScanForRoots([root])}
              onLoadIndex={loadIndex}
            />
          ) : (
            <>
              <TabBar activeTab={activeTab} onChange={setActiveTab} />
              <div className="tab-content">
                {activeTab === "overview" && (
                  <div className="overview-grid">
                    <ChartPanel result={result} mode={chartMode} setMode={setChartMode} />
                    <ScanStatusPanel progress={progress} scanning={scanning} result={result} />
                    <section className="tree-panel">
                      <div className="panel-head">
                        <div>
                          <h2>{selected?.name ?? "Folders"}</h2>
                          <span>{selected ? formatBytes(selected.size) : "No selection"}</span>
                        </div>
                      </div>
                      <TreeRows
                        result={result}
                        selectedId={selectedId}
                        expanded={expanded}
                        search={search}
                        onSelect={setSelectedId}
                        onToggle={toggleExpanded}
                        onContextMenu={openItemContextMenu}
                      />
                    </section>
                  </div>
                )}

                {activeTab === "files" && (
                  <div
                    ref={contentHostRef}
                    className="content-grid resizable-content-grid"
                    style={{ gridTemplateColumns: `${folderPaneWidth}px 10px minmax(0, 1fr)` }}
                  >
                    <section className="tree-panel">
                      <div className="panel-head">
                        <div>
                          <h2>{selected?.name ?? "Folders"}</h2>
                          <span>{selected ? formatBytes(selected.size) : "No selection"}</span>
                        </div>
                      </div>
                      <TreeRows
                        result={result}
                        selectedId={selectedId}
                        expanded={expanded}
                        search={search}
                        onSelect={setSelectedId}
                        onToggle={toggleExpanded}
                        onContextMenu={openItemContextMenu}
                      />
                    </section>
                    <div
                      className="resize-handle"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize folder and file panes"
                      onPointerDown={startPaneResize}
                    />
                    <DetailsTable result={result} selectedId={deferredSelectedId} search={search} onContextMenu={openItemContextMenu} />
                  </div>
                )}

                {activeTab === "duplicates" && (
                  <div className="tab-single">
                    <DuplicatePanel groups={duplicates} loading={duplicatesLoading} onRun={runDuplicates} onSaveIndex={saveCurrentIndex} />
                  </div>
                )}

                {activeTab === "compare" && (
                  <div className="tab-single">
                    <section className="single-panel">
                      <div className="panel-head">
                        <div>
                          <h2>Compare</h2>
                          <span>{compare ? formatBytes(Math.abs(compare.totalDelta)) : "Choose a saved index"}</span>
                        </div>
                        <IconButton
                          title="Compare index"
                          icon={compareLoading ? <Loader2 className="spin" size={16} /> : <GitCompare size={16} />}
                          onClick={compareWithIndex}
                          disabled={!result || compareLoading}
                        />
                      </div>
                      <div className="compare-list roomy">
                        {compare?.entries.map((entry) => (
                          <div className={`compare-entry ${entry.delta >= 0 ? "gain" : "loss"}`} key={`${entry.status}:${entry.path}`}>
                            <span>{entry.status}</span>
                            <strong>
                              {entry.delta >= 0 ? "+" : "-"}
                              {formatBytes(Math.abs(entry.delta))}
                            </strong>
                            <small>{entry.path}</small>
                          </div>
                        ))}
                        {!compare && (
                          <div className="empty-action">
                            <span>No comparison loaded</span>
                            <button type="button" onClick={saveCurrentIndex}>
                              <Save size={15} />
                              Save current index
                            </button>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === "exports" && (
                  <div className="tab-single">
                    <ExportPanel
                      result={result}
                      onSaveIndex={saveCurrentIndex}
                      onExport={(format) => void exportAs(format)}
                      onCheckUpdates={() => void api.checkForUpdates()}
                      update={update}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
