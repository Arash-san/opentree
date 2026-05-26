import { contextBridge, ipcRenderer } from "electron";
import type { DuplicateOptions, ElectronApi, ExportFormat, ScanOptions, ScanProgress, ScanResult, UpdateStatus } from "../shared/types";

const api: ElectronApi = {
  chooseFolders: () => ipcRenderer.invoke("dialog:chooseFolders"),
  startScan: (options: ScanOptions) => ipcRenderer.invoke("scan:start", options),
  cancelScan: () => ipcRenderer.invoke("scan:cancel"),
  exportScan: (payload: { result: ScanResult; format: ExportFormat }) => ipcRenderer.invoke("scan:export", payload),
  saveIndex: (result: ScanResult) => ipcRenderer.invoke("scan:saveIndex", result),
  loadIndex: () => ipcRenderer.invoke("scan:loadIndex"),
  compareWithIndex: (current: ScanResult) => ipcRenderer.invoke("scan:compareWithIndex", current),
  findDuplicates: (payload: { result: ScanResult; options: DuplicateOptions }) => ipcRenderer.invoke("scan:duplicates", payload),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress) => callback(progress);
    ipcRenderer.on("scan:progress", listener);
    return () => ipcRenderer.removeListener("scan:progress", listener);
  },
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  }
};

contextBridge.exposeInMainWorld("openTree", api);
