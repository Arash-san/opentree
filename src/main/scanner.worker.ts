import { parentPort } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import type { DuplicateOptions, ScanOptions, ScanResult } from "../shared/types";
import { compareScans } from "./compare";
import { findDuplicateFiles } from "./duplicates";
import { scanFolders } from "./scanner";

type WorkerRequest =
  | { type: "scan"; options: ScanOptions }
  | { type: "duplicates"; result: ScanResult; options: DuplicateOptions }
  | { type: "compare"; previousPath: string; current: ScanResult };

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

    if (message.type === "duplicates") {
      const groups = await findDuplicateFiles(message.result, message.options);
      parentPort?.postMessage({ type: "duplicates", groups });
      return;
    }

    const previous = JSON.parse(await readFile(message.previousPath, "utf8")) as ScanResult;
    const compare = compareScans(previous, message.current);
    parentPort?.postMessage({ type: "compare", compare });
  } catch (error) {
    const typed = error as Error;
    parentPort?.postMessage({ type: "error", message: typed.message, stack: typed.stack });
  }
});
