import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { autoUpdater } from "electron-updater";
import { access, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type {
  CompareResult,
  DuplicateGroup,
  DuplicateOptions,
  ExportFormat,
  ScanOptions,
  ScanResult,
  UpdateStatus
} from "../shared/types";
import { exportHtml, exportScan } from "./exporters";

let mainWindow: BrowserWindow | null = null;
let activeScanWorker: Worker | null = null;
let latestScanResult: ScanResult | null = null;

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
