import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { DuplicateFile, DuplicateGroup, DuplicateOptions, ScanNode, ScanResult } from "../shared/types";

interface CandidateFile {
  path: string;
  name: string;
  size: number;
  modifiedAt: string | null;
}

function fileCandidates(result: ScanResult, minSize: number): CandidateFile[] {
  return result.nodes
    .filter((node): node is ScanNode => !node.isDirectory && node.size >= minSize)
    .map((node) => ({
      path: node.path,
      name: node.name,
      size: node.size,
      modifiedAt: node.modifiedAt
    }));
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

function hashFile(filePath: string, algorithm: "sha256" | "md5"): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(values[index]);
      }
    })
  );

  return results;
}

function toDuplicateGroups(groups: Map<string, DuplicateFile[]>): DuplicateGroup[] {
  return [...groups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([key, files]) => ({
      key,
      size: files[0]?.size ?? 0,
      wastedBytes: Math.max(0, (files.length - 1) * (files[0]?.size ?? 0)),
      files: files.sort((left, right) => left.path.localeCompare(right.path))
    }))
    .sort((left, right) => right.wastedBytes - left.wastedBytes);
}

export async function findDuplicateFiles(
  result: ScanResult,
  options: DuplicateOptions = {}
): Promise<DuplicateGroup[]> {
  const minSize = options.minSize ?? 1;
  const hash = options.hash ?? true;
  const algorithm = options.algorithm ?? "sha256";
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 12));
  const candidates = fileCandidates(result, minSize);
  const sameSize = [...groupBy(candidates, (file) => String(file.size)).values()].filter((files) => files.length > 1);

  if (!hash) {
    return toDuplicateGroups(
      groupBy(
        sameSize.flat().map((file) => ({ ...file, hash: undefined })),
        (file) => `${file.size}:${file.name.toLowerCase()}`
      )
    );
  }

  const hashedFiles = await mapWithConcurrency(sameSize.flat(), concurrency, async (file) => ({
    ...file,
    hash: await hashFile(file.path, algorithm)
  }));

  return toDuplicateGroups(groupBy(hashedFiles, (file) => `${file.size}:${file.hash}`));
}
