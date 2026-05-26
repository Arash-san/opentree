import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { spawn } from "node:child_process";
import { access, mkdir, writeFile, readFile } from "node:fs/promises";
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

let mainWindow: BrowserWindow | null = null;
let activeScanWorker: Worker | null = null;
let latestScanResult: ScanResult | null = null;
let windowsContextMenuScriptPath: string | null = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const WINDOWS_CONTEXT_MENU_SCRIPT = String.raw`
param(
  [Parameter(Mandatory=$true)][string]$Path,
  [int]$X = -1,
  [int]$Y = -1,
  [string]$Hwnd = "0"
)

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class OpenTreeShellContextMenu
{
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CMINVOKECOMMANDINFOEX
    {
        public int cbSize;
        public uint fMask;
        public IntPtr hwnd;
        public IntPtr lpVerb;
        [MarshalAs(UnmanagedType.LPStr)] public string lpParameters;
        [MarshalAs(UnmanagedType.LPStr)] public string lpDirectory;
        public int nShow;
        public uint dwHotKey;
        public IntPtr hIcon;
        [MarshalAs(UnmanagedType.LPStr)] public string lpTitle;
        public IntPtr lpVerbW;
        [MarshalAs(UnmanagedType.LPWStr)] public string lpParametersW;
        [MarshalAs(UnmanagedType.LPWStr)] public string lpDirectoryW;
        [MarshalAs(UnmanagedType.LPWStr)] public string lpTitleW;
        public POINT ptInvoke;
    }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214E6-0000-0000-C000-000000000046")]
    public interface IShellFolder
    {
        void ParseDisplayName(IntPtr hwnd, IntPtr pbc, [MarshalAs(UnmanagedType.LPWStr)] string pszDisplayName, ref uint pchEaten, out IntPtr ppidl, ref uint pdwAttributes);
        void EnumObjects(IntPtr hwnd, int grfFlags, out IntPtr ppenumIDList);
        void BindToObject(IntPtr pidl, IntPtr pbc, ref Guid riid, out IntPtr ppv);
        void BindToStorage(IntPtr pidl, IntPtr pbc, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int CompareIDs(IntPtr lParam, IntPtr pidl1, IntPtr pidl2);
        void CreateViewObject(IntPtr hwndOwner, ref Guid riid, out IntPtr ppv);
        void GetAttributesOf(uint cidl, IntPtr[] apidl, ref uint rgfInOut);
        void GetUIObjectOf(IntPtr hwndOwner, uint cidl, IntPtr[] apidl, ref Guid riid, IntPtr rgfReserved, out IntPtr ppv);
        void GetDisplayNameOf(IntPtr pidl, uint uFlags, out IntPtr pName);
        void SetNameOf(IntPtr hwnd, IntPtr pidl, [MarshalAs(UnmanagedType.LPWStr)] string pszName, uint uFlags, out IntPtr ppidlOut);
    }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214e4-0000-0000-c000-000000000046")]
    public interface IContextMenu
    {
        [PreserveSig] int QueryContextMenu(IntPtr hmenu, uint indexMenu, uint idCmdFirst, uint idCmdLast, uint uFlags);
        void InvokeCommand(ref CMINVOKECOMMANDINFOEX pici);
        void GetCommandString(UIntPtr idcmd, uint uflags, IntPtr reserved, StringBuilder commandstring, int cch);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHParseDisplayName(string pszName, IntPtr pbc, out IntPtr ppidl, uint sfgaoIn, out uint psfgaoOut);

    [DllImport("shell32.dll")]
    private static extern int SHBindToParent(IntPtr pidl, ref Guid riid, out IShellFolder ppv, out IntPtr ppidlLast);

    [DllImport("ole32.dll")]
    private static extern void CoTaskMemFree(IntPtr pv);

    [DllImport("user32.dll")]
    private static extern IntPtr CreatePopupMenu();

    [DllImport("user32.dll")]
    private static extern bool DestroyMenu(IntPtr hMenu);

    [DllImport("user32.dll")]
    private static extern uint TrackPopupMenuEx(IntPtr hmenu, uint fuFlags, int x, int y, IntPtr hwnd, IntPtr lptpm);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    private const uint CMF_NORMAL = 0x00000000;
    private const uint TPM_RIGHTBUTTON = 0x0002;
    private const uint TPM_RETURNCMD = 0x0100;
    private const uint CMIC_MASK_UNICODE = 0x00004000;
    private const int SW_SHOWNORMAL = 1;

    public static void Show(string itemPath, int x, int y, string hwndText)
    {
        IntPtr pidl;
        uint attrs;
        int hr = SHParseDisplayName(itemPath, IntPtr.Zero, out pidl, 0, out attrs);
        if (hr != 0 || pidl == IntPtr.Zero) throw new COMException("SHParseDisplayName failed", hr);

        try
        {
            Guid shellFolderGuid = new Guid("000214E6-0000-0000-C000-000000000046");
            IShellFolder parent;
            IntPtr childPidl;
            hr = SHBindToParent(pidl, ref shellFolderGuid, out parent, out childPidl);
            if (hr != 0) throw new COMException("SHBindToParent failed", hr);

            Guid contextMenuGuid = new Guid("000214e4-0000-0000-c000-000000000046");
            IntPtr contextMenuPtr;
            parent.GetUIObjectOf(IntPtr.Zero, 1, new IntPtr[] { childPidl }, ref contextMenuGuid, IntPtr.Zero, out contextMenuPtr);

            IContextMenu contextMenu = (IContextMenu)Marshal.GetObjectForIUnknown(contextMenuPtr);
            try
            {
                IntPtr menu = CreatePopupMenu();
                try
                {
                    contextMenu.QueryContextMenu(menu, 0, 1, 0x7FFF, CMF_NORMAL);
                    if (x < 0 || y < 0)
                    {
                        POINT cursor;
                        GetCursorPos(out cursor);
                        x = cursor.X;
                        y = cursor.Y;
                    }

                    IntPtr hwnd = IntPtr.Zero;
                    long parsed;
                    if (long.TryParse(hwndText, out parsed)) hwnd = new IntPtr(parsed);
                    if (hwnd != IntPtr.Zero) SetForegroundWindow(hwnd);

                    uint command = TrackPopupMenuEx(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, x, y, hwnd, IntPtr.Zero);
                    if (command > 0)
                    {
                        CMINVOKECOMMANDINFOEX invoke = new CMINVOKECOMMANDINFOEX();
                        invoke.cbSize = Marshal.SizeOf(typeof(CMINVOKECOMMANDINFOEX));
                        invoke.fMask = CMIC_MASK_UNICODE;
                        invoke.hwnd = hwnd;
                        invoke.lpVerb = new IntPtr(command - 1);
                        invoke.lpVerbW = new IntPtr(command - 1);
                        invoke.nShow = SW_SHOWNORMAL;
                        invoke.ptInvoke = new POINT { X = x, Y = y };
                        contextMenu.InvokeCommand(ref invoke);
                    }
                }
                finally
                {
                    DestroyMenu(menu);
                }
            }
            finally
            {
                Marshal.ReleaseComObject(contextMenu);
                Marshal.Release(contextMenuPtr);
            }
        }
        finally
        {
            CoTaskMemFree(pidl);
        }
    }
}
"@

[OpenTreeShellContextMenu]::Show($Path, $X, $Y, $Hwnd)
`;

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

function nativeWindowHandleText(webContents?: Electron.WebContents): string {
  const window = webContents ? BrowserWindow.fromWebContents(webContents) : mainWindow;
  const handle = window?.getNativeWindowHandle();
  if (!handle || handle.length === 0) return "0";
  return handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : String(handle.readUInt32LE(0));
}

async function ensureWindowsContextMenuScript(): Promise<string> {
  if (windowsContextMenuScriptPath) return windowsContextMenuScriptPath;
  const directory = path.join(app.getPath("userData"), "native");
  await mkdir(directory, { recursive: true });
  windowsContextMenuScriptPath = path.join(directory, "windows-shell-context-menu.ps1");
  await writeFile(windowsContextMenuScriptPath, WINDOWS_CONTEXT_MENU_SCRIPT, "utf8");
  return windowsContextMenuScriptPath;
}

async function showNativeItemContextMenu(payload: ItemContextMenuRequest, webContents: Electron.WebContents): Promise<boolean> {
  if (process.platform !== "win32") return false;
  const scriptPath = await ensureWindowsContextMenuScript();
  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-Sta",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-Path",
      payload.path,
      "-X",
      String(payload.x),
      "-Y",
      String(payload.y),
      "-Hwnd",
      nativeWindowHandleText(webContents)
    ],
    { detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();
  return true;
}

function showFallbackItemContextMenu(itemPath: string, webContents: Electron.WebContents): void {
  const window = BrowserWindow.fromWebContents(webContents) ?? mainWindow ?? undefined;
  const menu = Menu.buildFromTemplate([
    {
      label: "Open",
      click: () => void shell.openPath(itemPath)
    },
    {
      label: "Show in folder",
      click: () => shell.showItemInFolder(itemPath)
    },
    { type: "separator" },
    {
      label: "Copy path",
      click: () => clipboard.writeText(itemPath)
    }
  ]);
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
      const nativeMenuShown = await showNativeItemContextMenu(payload, event.sender);
      if (!nativeMenuShown) showFallbackItemContextMenu(payload.path, event.sender);
    } catch {
      showFallbackItemContextMenu(payload.path, event.sender);
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
