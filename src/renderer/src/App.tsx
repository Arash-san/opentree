import {
  AlertTriangle,
  BarChart3,
  Binary,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Download,
  FileArchive,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GitCompare,
  HardDrive,
  History,
  ListFilter,
  Loader2,
  PieChart as PieChartIcon,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  TableProperties
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  ElectronApi,
  ExportFormat,
  ScanNode,
  ScanProgress,
  ScanResult,
  UpdateStatus
} from "../../shared/types";

type ChartMode = "treemap" | "extensions" | "age";

const CHART_COLORS = ["#55d6be", "#68a8ff", "#f3b44e", "#e66d92", "#8f7aff", "#a3e635", "#fb7185"];

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

function TreeRows(props: {
  result: ScanResult;
  selectedId: number | null;
  expanded: Set<number>;
  search: string;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
}) {
  const byId = useNodeMap(props.result);
  const visible = useMemo(() => {
    const search = props.search.trim().toLowerCase();
    if (search) {
      return props.result.nodes
        .filter((node) => node.name.toLowerCase().includes(search) || node.path.toLowerCase().includes(search))
        .sort((left, right) => right.size - left.size)
        .slice(0, 500);
    }

    const rows: ScanNode[] = [];
    const visit = (id: number) => {
      const node = byId.get(id);
      if (!node || rows.length > 800) return;
      rows.push(node);
      if (!props.expanded.has(id)) return;
      for (const childId of [...node.children].sort((left, right) => (byId.get(right)?.size ?? 0) - (byId.get(left)?.size ?? 0))) {
        visit(childId);
      }
    };

    for (const rootId of props.result.rootIds) visit(rootId);
    return rows;
  }, [byId, props.expanded, props.result, props.search]);

  return (
    <div className="tree-list">
      {visible.map((node) => {
        const hasChildren = node.children.length > 0;
        return (
          <button
            className={`tree-row ${props.selectedId === node.id ? "selected" : ""}`}
            type="button"
            key={node.id}
            onClick={() => props.onSelect(node.id)}
            style={{ paddingLeft: `${12 + Math.min(node.depth, 12) * 14}px` }}
          >
            <span
              className="tree-toggle"
              onClick={(event) => {
                event.stopPropagation();
                if (hasChildren) props.onToggle(node.id);
              }}
            >
              {hasChildren ? props.expanded.has(node.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span />}
            </span>
            <span className="tree-name">{node.name}</span>
            <span className="tree-size">{formatBytes(node.size)}</span>
          </button>
        );
      })}
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
  const showText = width > 84 && height > 38;

  return (
    <g>
      <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={Math.max(0, height - 4)} rx={5} fill={color} opacity={0.85} />
      {showText && (
        <>
          <text x={x + 10} y={y + 20} fill="#071017" fontSize={12} fontWeight={700}>
            {props.name}
          </text>
          <text x={x + 10} y={y + 36} fill="#071017" fontSize={11}>
            {formatBytes(props.size ?? 0)}
          </text>
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

function DetailsTable({ result, selectedId, search }: { result: ScanResult | null; selectedId: number | null; search: string }) {
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
      .slice(0, 500);
  }, [result, search, selected]);

  return (
    <section className="table-panel">
      <div className="panel-head">
        <div>
          <h2>Files</h2>
          <span>{files.length.toLocaleString()} visible</span>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Extension</th>
              <th>Modified</th>
              <th>Path</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <td>{file.name}</td>
                <td>{formatBytes(file.size)}</td>
                <td>{file.extension}</td>
                <td>{file.modifiedAt ? new Date(file.modifiedAt).toLocaleString() : ""}</td>
                <td className="path-cell">{file.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DuplicatePanel({
  groups,
  loading,
  onRun
}: {
  groups: DuplicateGroup[];
  loading: boolean;
  onRun: () => void;
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
        {groups.length === 0 && <div className="empty-state small">No duplicate groups</div>}
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

export function App() {
  const api = openTreeApi();
  const [roots, setRoots] = useState<string[]>([]);
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("node_modules, .git, release, dist");
  const [maxDepth, setMaxDepth] = useState("");
  const [followSymlinks, setFollowSymlinks] = useState(false);
  const [concurrency, setConcurrency] = useState("16");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [chartMode, setChartMode] = useState<ChartMode>("treemap");
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [update, setUpdate] = useState<UpdateStatus>({ state: "idle" });
  const byId = useNodeMap(result);
  const selected = selectedId === null ? null : byId.get(selectedId);

  useEffect(() => api.onScanProgress(setProgress), [api]);
  useEffect(() => api.onUpdateStatus(setUpdate), [api]);

  useEffect(() => {
    if (!result) return;
    setSelectedId(result.rootIds[0] ?? null);
    setExpanded(new Set(result.rootIds));
  }, [result]);

  async function chooseFolders() {
    const picked = await api.chooseFolders();
    if (picked.length > 0) setRoots(picked);
  }

  async function runScan() {
    let scanRoots = roots;
    if (scanRoots.length === 0) {
      scanRoots = await api.chooseFolders();
      setRoots(scanRoots);
    }
    if (scanRoots.length === 0) return;

    setScanning(true);
    setDuplicates([]);
    setCompare(null);
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

  async function cancelScan() {
    await api.cancelScan();
    setScanning(false);
  }

  async function loadIndex() {
    const loaded = await api.loadIndex();
    if (loaded) setResult(loaded);
  }

  async function compareWithIndex() {
    if (!result) return;
    const diff = await api.compareWithIndex(result);
    if (diff) setCompare(diff);
  }

  async function runDuplicates() {
    if (!result) return;
    setDuplicatesLoading(true);
    try {
      setDuplicates(
        await api.findDuplicates({
          result,
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

  function toggleExpanded(id: number) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

        <div className="toolbar">
          <IconButton title="Choose folders" icon={<FolderOpen size={17} />} onClick={chooseFolders} variant="primary" />
          <IconButton title="Start scan" icon={scanning ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />} onClick={runScan} disabled={scanning} />
          <IconButton title="Stop scan" icon={<CircleStop size={17} />} onClick={cancelScan} disabled={!scanning} variant="danger" />
        </div>

        <div className="roots">
          {roots.map((root) => (
            <div title={root} key={root}>
              {root}
            </div>
          ))}
          {roots.length === 0 && <div>No folder selected</div>}
        </div>

        <TextInput icon={<ListFilter size={15} />} label="Include" value={include} onChange={setInclude} placeholder="*.zip, *.mp4" />
        <TextInput icon={<ListFilter size={15} />} label="Exclude" value={exclude} onChange={setExclude} placeholder="node_modules, .git" />
        <div className="grid-fields">
          <TextInput icon={<Settings2 size={15} />} label="Depth" value={maxDepth} onChange={setMaxDepth} placeholder="all" />
          <TextInput icon={<Settings2 size={15} />} label="Threads" value={concurrency} onChange={setConcurrency} placeholder="16" />
        </div>
        <Toggle checked={followSymlinks} onChange={setFollowSymlinks} label="Follow links" />

        <div className="action-grid">
          <IconButton title="Save index" icon={<Save size={16} />} onClick={() => result && void api.saveIndex(result)} disabled={!result} />
          <IconButton title="Load index" icon={<FileArchive size={16} />} onClick={loadIndex} />
          <IconButton title="Compare index" icon={<GitCompare size={16} />} onClick={compareWithIndex} disabled={!result} />
          <IconButton title="Check updates" icon={<Download size={16} />} onClick={() => void api.checkForUpdates()} />
        </div>

        <div className="export-row">
          <IconButton title="Export JSON" icon={<FileJson size={16} />} onClick={() => exportAs("json")} disabled={!result} />
          <IconButton title="Export CSV" icon={<TableProperties size={16} />} onClick={() => exportAs("csv")} disabled={!result} />
          <IconButton title="Export XLSX" icon={<FileSpreadsheet size={16} />} onClick={() => exportAs("xlsx")} disabled={!result} />
          <IconButton title="Export HTML" icon={<FileText size={16} />} onClick={() => exportAs("html")} disabled={!result} />
          <IconButton title="Export PDF" icon={<Download size={16} />} onClick={() => exportAs("pdf")} disabled={!result} />
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

        <div className="workspace">
          <div className="visual-grid">
            <ChartPanel result={result} mode={chartMode} setMode={setChartMode} />
            <DuplicatePanel groups={duplicates} loading={duplicatesLoading} onRun={runDuplicates} />
            <ComparePanel compare={compare} />
          </div>

          <div className="content-grid">
            <section className="tree-panel">
              <div className="panel-head">
                <div>
                  <h2>{selected?.name ?? "Folders"}</h2>
                  <span>{selected ? formatBytes(selected.size) : "No selection"}</span>
                </div>
              </div>
              {result ? (
                <TreeRows
                  result={result}
                  selectedId={selectedId}
                  expanded={expanded}
                  search={search}
                  onSelect={setSelectedId}
                  onToggle={toggleExpanded}
                />
              ) : (
                <div className="empty-state">No scan loaded</div>
              )}
            </section>
            <DetailsTable result={result} selectedId={selectedId} search={search} />
          </div>
        </div>
      </main>
    </div>
  );
}
