import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { spawn } from "node:child_process";
import { access, stat, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type {
  CompareResult,
  DuplicateGroup,
  DuplicateOptions,
  ExportFormat,
  ItemContextMenuRequest,
  ScanOptions,
  ScanResult,
  UpdateStatus
} from "../shared/types";
import { exportHtml, exportScan } from "./exporters";
import {
  itemContextMenuEntries,
  type ItemContextMenuActionId,
  type ItemContextMenuIcon,
  type ShellVerbMenuEntry
} from "./item-context-menu";

let mainWindow: BrowserWindow | null = null;
let activeScanWorker: Worker | null = null;
let latestScanResult: ScanResult | null = null;
const shellVerbCache = new Map<string, ShellVerbMenuEntry[]>();
let cachedWinRarPath: string | null | undefined;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function workerPath(): string {
  return path.join(__dirname, "scanner.worker.js");
}

function sendUpdate(status: UpdateStatus): void {
  mainWindow?.webContents.send("update:status", status);
}

async function listSystemDrives(): Promise<Array<{ path: string; name: string }>> {
  if (process.platform !== "win32") {
    return [{ path: "/", name: "System Root" }];
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const checks = await Promise.all(
    letters.map(async (letter) => {
      const drivePath = `${letter}:\\`;
      try {
        await access(drivePath);
        return { path: drivePath, name: `${letter}: Drive` };
      } catch {
        return null;
      }
    })
  );

  return checks.filter((drive): drive is { path: string; name: string } => drive !== null);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 740,
    backgroundColor: "#0b1016",
    title: "OpenTree",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function runWorker<T>(payload: object, expectedType: string, sender?: Electron.WebContents): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath());
    let settled = false;

    worker.on("message", (message) => {
      if (message.type === "progress") {
        sender?.send("scan:progress", message.progress);
        return;
      }

      if (message.type === "error") {
        settled = true;
        void worker.terminate();
        reject(new Error(message.message));
        return;
      }

      if (message.type === expectedType) {
        settled = true;
        void worker.terminate();
        resolve((message.result ?? message.groups ?? message.compare) as T);
      }
    });

    worker.on("error", (error) => {
      if (!settled) reject(error);
    });

    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });

    worker.postMessage(payload);
  });
}

function configureUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => sendUpdate({ state: "checking" }));
  autoUpdater.on("update-available", (info) =>
    sendUpdate({ state: "available", version: info.version, message: "A new version is available." })
  );
  autoUpdater.on("update-not-available", (info) =>
    sendUpdate({ state: "not-available", version: info.version, message: "OpenTree is up to date." })
  );
  autoUpdater.on("download-progress", (progress) =>
    sendUpdate({ state: "downloading", percent: progress.percent, message: `${Math.round(progress.percent)}%` })
  );
  autoUpdater.on("update-downloaded", (info) =>
    sendUpdate({ state: "downloaded", version: info.version, message: "Update ready to install." })
  );
  autoUpdater.on("error", (error) => sendUpdate({ state: "error", message: error.message }));
}

async function showOpenDialog(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  if (mainWindow) return dialog.showOpenDialog(mainWindow, options);
  return dialog.showOpenDialog(options);
}

async function showSaveDialog(options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
  if (mainWindow) return dialog.showSaveDialog(mainWindow, options);
  return dialog.showSaveDialog(options);
}

async function iconForPath(itemPath: string): Promise<Electron.NativeImage | undefined> {
  try {
    const icon = await app.getFileIcon(itemPath, { size: "small" });
    return icon.isEmpty() ? undefined : icon;
  } catch {
    return undefined;
  }
}

async function firstAccessible(paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next well-known install path.
    }
  }
  return null;
}

async function winRarPath(): Promise<string | null> {
  if (cachedWinRarPath !== undefined) return cachedWinRarPath;
  cachedWinRarPath = await firstAccessible([
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "WinRAR", "WinRAR.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "WinRAR", "WinRAR.exe")
  ]);
  return cachedWinRarPath;
}

async function toolIcon(icon: ItemContextMenuIcon): Promise<Electron.NativeImage | undefined> {
  if (icon === "archive") {
    const executable = await winRarPath();
    return executable ? iconForPath(executable) : undefined;
  }

  if (icon === "terminal") {
    return iconForPath(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
  }

  if (icon === "editor") {
    const executable = await firstAccessible([
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Notepad++", "notepad++.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Notepad++", "notepad++.exe")
    ]);
    return executable ? iconForPath(executable) : undefined;
  }

  return undefined;
}

function spawnDetached(command: string, args: string[], options: { hidden?: boolean; cwd?: string } = {}): void {
  const child = spawn(command, args, {
    cwd: options.cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: options.hidden ?? true
  });
  child.unref();
}

function powerShellArgs(script: string, scriptArgs: string[], options: { noExit?: boolean } = {}): string[] {
  const encodedArgs = Buffer.from(JSON.stringify(scriptArgs), "utf8").toString("base64");
  const bootstrap = [
    "$ProgressPreference = 'SilentlyContinue'",
    `$OpenTreeArgsJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedArgs}'))`,
    "$OpenTreeParsedArgs = ConvertFrom-Json -InputObject $OpenTreeArgsJson",
    "$args = @($OpenTreeParsedArgs)",
    script
  ].join("; ");
  const encodedCommand = Buffer.from(bootstrap, "utf16le").toString("base64");
  const base = options.noExit ? ["-NoExit", "-NoLogo"] : ["-NoProfile"];
  return [...base, "-Sta", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedCommand];
}

function runPowerShell(script: string, args: string[], timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      powerShellArgs(script, args),
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("PowerShell timed out"));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || `PowerShell exited with code ${code ?? "unknown"}`));
    });
  });
}

function shellVerbCacheKey(itemPath: string, isDirectory: boolean): string {
  if (isDirectory) return "directory";
  return `file:${path.extname(itemPath).toLowerCase() || "(none)"}`;
}

async function shellVerbsForPath(itemPath: string, isDirectory: boolean): Promise<ShellVerbMenuEntry[]> {
  if (process.platform !== "win32") return [];
  const cacheKey = shellVerbCacheKey(itemPath, isDirectory);
  const cached = shellVerbCache.get(cacheKey);
  if (cached) return cached;

  const script = String.raw`
    $ErrorActionPreference = "Stop"
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $target = Get-Item -LiteralPath $args[0] -Force
    $shell = New-Object -ComObject Shell.Application
    $folderPath = if ($target.PSIsContainer) { $target.Parent.FullName } else { $target.DirectoryName }
    $folder = $shell.Namespace($folderPath)
    $folderItem = if ($folder) { $folder.ParseName($target.Name) } else { $null }
    $items = @()
    if ($folderItem) {
      foreach ($verb in $folderItem.Verbs()) {
        $name = [string]$verb.Name
        if (-not [string]::IsNullOrWhiteSpace($name)) {
          $items += [pscustomobject]@{ name = $name; label = $name }
        }
      }
    }
    @($items) | ConvertTo-Json -Compress
  `;

  try {
    const output = (await runPowerShell(script, [itemPath])).trim();
    if (!output) return [];
    const parsed = JSON.parse(output) as ShellVerbMenuEntry[] | ShellVerbMenuEntry;
    const verbs = Array.isArray(parsed) ? parsed : [parsed];
    shellVerbCache.set(cacheKey, verbs);
    return verbs;
  } catch {
    shellVerbCache.set(cacheKey, []);
    return [];
  }
}

function invokeShellVerb(itemPath: string, verbName: string): void {
  const script = String.raw`
    $ErrorActionPreference = "Stop"
    $target = Get-Item -LiteralPath $args[0] -Force
    $verbName = $args[1]
    $shell = New-Object -ComObject Shell.Application
    $folderPath = if ($target.PSIsContainer) { $target.Parent.FullName } else { $target.DirectoryName }
    $folder = $shell.Namespace($folderPath)
    if ($folder) {
      $folderItem = $folder.ParseName($target.Name)
      if ($folderItem) {
        foreach ($verb in $folderItem.Verbs()) {
          if ([string]$verb.Name -eq $verbName) {
            $verb.DoIt()
            break
          }
        }
      }
    }
  `;
  spawnDetached("powershell.exe", powerShellArgs(script, [itemPath, verbName]));
}

function openTerminalAt(itemPath: string, isDirectory: boolean): void {
  const targetPath = isDirectory ? itemPath : path.dirname(itemPath);
  spawnDetached("powershell.exe", powerShellArgs("Set-Location -LiteralPath $args[0]", [targetPath], { noExit: true }), {
    hidden: false
  });
}

function showItemProperties(itemPath: string): void {
  const script = [
    "$shell = New-Object -ComObject Shell.Application",
    "$item = Get-Item -LiteralPath $args[0]",
    "$folderPath = if ($item.PSIsContainer) { $item.Parent.FullName } else { $item.DirectoryName }",
    "$folder = $shell.Namespace($folderPath)",
    "if ($folder) { $folderItem = $folder.ParseName($item.Name); if ($folderItem) { $folderItem.InvokeVerb('properties') } }"
  ].join("; ");
  spawnDetached("powershell.exe", powerShellArgs(script, [itemPath]));
}

function archiveOutputPath(itemPath: string, extension = ".rar"): string {
  const parsed = path.parse(itemPath);
  return path.join(parsed.dir, `${parsed.base}${extension}`);
}

function archiveExtractFolder(itemPath: string): string {
  const parsed = path.parse(itemPath);
  return path.join(parsed.dir, parsed.name);
}

async function runWinRarAction(action: ItemContextMenuActionId, itemPaths: string[]): Promise<void> {
  const executable = await winRarPath();
  const first = itemPaths[0];
  if (!executable || !first) return;

  if (action === "winrar-open") {
    spawnDetached(executable, [first], { hidden: false });
  } else if (action === "winrar-extract-files") {
    spawnDetached(executable, ["x", first], { cwd: path.dirname(first), hidden: false });
  } else if (action === "winrar-extract-here") {
    spawnDetached(executable, ["x", first, `${path.dirname(first)}\\`], { hidden: false });
  } else if (action === "winrar-extract-folder") {
    spawnDetached(executable, ["x", first, `${archiveExtractFolder(first)}\\`], { hidden: false });
  } else if (action === "winrar-add-archive") {
    spawnDetached(executable, ["a", archiveOutputPath(first), ...itemPaths], { cwd: path.dirname(first), hidden: false });
  } else if (action === "winrar-add-named") {
    spawnDetached(executable, ["a", archiveOutputPath(first), ...itemPaths], { cwd: path.dirname(first), hidden: false });
  }
}

function runItemContextAction(action: ItemContextMenuActionId, itemPaths: string[], isDirectory: boolean): void {
  const itemPath = itemPaths[0];
  if (!itemPath) return;

  if (action === "open") {
    for (const selectedPath of itemPaths.slice(0, 10)) void shell.openPath(selectedPath);
  } else if (action === "open-terminal") {
    openTerminalAt(itemPath, isDirectory);
  } else if (action === "show-in-folder") {
    shell.showItemInFolder(itemPath);
  } else if (action === "copy-path") {
    clipboard.writeText(itemPaths.join("\n"));
  } else if (action === "copy-name") {
    clipboard.writeText(path.basename(itemPath) || itemPath);
  } else if (action === "trash") {
    for (const selectedPath of itemPaths) void shell.trashItem(selectedPath);
  } else if (action === "properties") {
    showItemProperties(itemPath);
  } else {
    void runWinRarAction(action, itemPaths);
  }
}

async function showItemContextMenu(payload: ItemContextMenuRequest, webContents: Electron.WebContents): Promise<void> {
  const window = BrowserWindow.fromWebContents(webContents) ?? mainWindow ?? undefined;
  const itemPaths = (payload.paths?.length ? payload.paths : [payload.path]).filter(Boolean);
  const itemPath = itemPaths[0];
  if (!itemPath) return;

  const stats = await stat(itemPath);
  const isDirectory = stats.isDirectory();
  const shellVerbs = itemPaths.length === 1 ? await shellVerbsForPath(itemPath, isDirectory) : [];
  const hasWinRar = Boolean(await winRarPath());
  const itemIcon = itemPaths.length === 1 ? await iconForPath(itemPath) : undefined;
  const folderIcon = await iconForPath(isDirectory ? itemPath : path.dirname(itemPath));
  const icons: Record<ItemContextMenuIcon, Electron.NativeImage | undefined> = {
    item: itemIcon,
    folder: folderIcon ?? itemIcon,
    terminal: await toolIcon("terminal"),
    archive: await toolIcon("archive"),
    editor: await toolIcon("editor"),
    tool: undefined
  };

  const menu = Menu.buildFromTemplate(
    itemContextMenuEntries(itemPaths, { isDirectory, shellVerbs, hasWinRar }).map((entry) => {
      if (entry.type === "separator") return { type: "separator" };
      if (entry.type === "shell-verb") {
        return {
          label: entry.label,
          icon: entry.icon ? icons[entry.icon] : undefined,
          click: () => invokeShellVerb(itemPath, entry.verb)
        };
      }
      return {
        label: entry.label,
        icon: entry.icon ? icons[entry.icon] : undefined,
        click: () => runItemContextAction(entry.id, itemPaths, isDirectory)
      };
    })
  );
  menu.popup({ window });
}

function registerIpc(): void {
  ipcMain.handle("dialog:chooseFolders", async () => {
    const response = await showOpenDialog({
      properties: ["openDirectory", "multiSelections"]
    });
    return response.canceled ? [] : response.filePaths;
  });

  ipcMain.handle("system:listDrives", async () => listSystemDrives());

  ipcMain.handle("scan:start", async (event, options: ScanOptions) => {
    if (activeScanWorker) {
      await activeScanWorker.terminate();
      activeScanWorker = null;
    }

    return new Promise<ScanResult>((resolve, reject) => {
      const worker = new Worker(workerPath());
      activeScanWorker = worker;
      let settled = false;

      worker.on("message", (message) => {
        if (message.type === "progress") {
          if (message.progress.partialResult) latestScanResult = message.progress.partialResult as ScanResult;
          event.sender.send("scan:progress", message.progress);
          return;
        }

        if (message.type === "complete") {
          settled = true;
          activeScanWorker = null;
          latestScanResult = message.result as ScanResult;
          void worker.terminate();
          resolve(message.result as ScanResult);
          return;
        }

        if (message.type === "error") {
          settled = true;
          activeScanWorker = null;
          void worker.terminate();
          reject(new Error(message.message));
        }
      });

      worker.on("error", (error) => {
        activeScanWorker = null;
        reject(error);
      });

      worker.on("exit", (code) => {
        activeScanWorker = null;
        if (!settled && code !== 0) reject(new Error(`Scan worker stopped with exit code ${code}`));
      });

      worker.postMessage({ type: "scan", options });
    });
  });

  ipcMain.handle("scan:cancel", async () => {
    if (activeScanWorker) {
      await activeScanWorker.terminate();
      activeScanWorker = null;
    }
  });

  ipcMain.handle("scan:saveIndex", async (_event, result: ScanResult) => {
    const response = await showSaveDialog({
      defaultPath: "opentree-scan.oftindex",
      filters: [{ name: "OpenTree index", extensions: ["oftindex"] }]
    });
    if (response.canceled || !response.filePath) return null;
    await writeFile(response.filePath, JSON.stringify(result, null, 2), "utf8");
    return response.filePath;
  });

  ipcMain.handle("scan:loadIndex", async () => {
    const response = await showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "OpenTree index", extensions: ["oftindex", "json"] }]
    });
    if (response.canceled || !response.filePaths[0]) return null;
    const content = await readFile(response.filePaths[0], "utf8");
    latestScanResult = JSON.parse(content) as ScanResult;
    return latestScanResult;
  });

  ipcMain.handle("scan:compareWithIndex", async (event): Promise<CompareResult | null> => {
    if (!latestScanResult) return null;
    const response = await showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "OpenTree index", extensions: ["oftindex", "json"] }]
    });
    if (response.canceled || !response.filePaths[0]) return null;
    return runWorker<CompareResult>(
      { type: "compare", previousPath: response.filePaths[0], current: latestScanResult },
      "compare",
      event.sender
    );
  });

  ipcMain.handle("scan:duplicates", async (event, payload: { options: DuplicateOptions }) => {
    if (!latestScanResult) return [];
    return runWorker<DuplicateGroup[]>(
      { type: "duplicates", result: latestScanResult, options: payload.options },
      "duplicates",
      event.sender
    );
  });

  ipcMain.handle("shell:itemContextMenu", async (event, payload: ItemContextMenuRequest) => {
    if (!payload?.path) return;
    try {
      await showItemContextMenu(payload, event.sender);
    } catch {
      const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined;
      Menu.buildFromTemplate([
        {
          label: "Copy path",
          click: () => clipboard.writeText(payload.path)
        }
      ]).popup({ window });
    }
  });

  ipcMain.handle("scan:export", async (_event, payload: { result: ScanResult; format: ExportFormat }) => {
    const extension = payload.format;
    const response = await showSaveDialog({
      defaultPath: `opentree-report.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    });
    if (response.canceled || !response.filePath) return null;

    if (payload.format === "pdf") {
      const reportWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
      await reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(exportHtml(payload.result))}`);
      const pdf = await reportWindow.webContents.printToPDF({ landscape: true, printBackground: true });
      reportWindow.destroy();
      await writeFile(response.filePath, pdf);
      return response.filePath;
    }

    const output = exportScan(payload.result, payload.format);
    await writeFile(response.filePath, output);
    return response.filePath;
  });

  ipcMain.handle("updates:check", async () => {
    if (!app.isPackaged) {
      sendUpdate({ state: "not-available", message: "Update checks run in packaged builds." });
      return;
    }
    await autoUpdater.checkForUpdatesAndNotify();
  });

  ipcMain.handle("updates:install", async () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  configureUpdater();
  registerIpc();
  createWindow();

  if (app.isPackaged) {
    void autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => void autoUpdater.checkForUpdatesAndNotify(), 6 * 60 * 60 * 1000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
