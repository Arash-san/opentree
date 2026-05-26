import type { ElectronApi } from "../../shared/types";

declare global {
  interface Window {
    openTree?: ElectronApi;
  }
}

export {};
