import { parentPort } from "node:worker_threads";
import type { DuplicateOptions, ScanOptions, ScanResult } from "../shared/types";
import { findDuplicateFiles } from "./duplicates";
import { scanFolders } from "./scanner";

type WorkerRequest =
  | { type: "scan"; options: ScanOptions }
  | { type: "duplicates"; result: ScanResult; options: DuplicateOptions };

if (!parentPort) {
  throw new Error("scanner.worker must be executed as a worker thread");
}

parentPort.on("message", async (message: WorkerRequest) => {
  try {
    if (message.type === "scan") {
      const result = await scanFolders(message.options, {
        onProgress: (progress) => parentPort?.postMessage({ type: "progress", progress })
      });
      parentPort?.postMessage({ type: "complete", result });
      return;
    }

    const groups = await findDuplicateFiles(message.result, message.options);
    parentPort?.postMessage({ type: "duplicates", groups });
  } catch (error) {
    const typed = error as Error;
    parentPort?.postMessage({ type: "error", message: typed.message, stack: typed.stack });
  }
});
