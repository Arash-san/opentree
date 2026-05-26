import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanFolders } from "../src/main/scanner";

const created: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "opentree-"));
  created.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("scanFolders", () => {
  it("builds a nested folder index with aggregate sizes", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "media"));
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(root, "media", "clip.bin"), Buffer.alloc(2048));
    await writeFile(path.join(root, "docs", "notes.txt"), "hello");

    const result = await scanFolders({ roots: [root], concurrency: 4 });

    expect(result.totals.bytes).toBe(2053);
    expect(result.totals.files).toBe(2);
    expect(result.totals.folders).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(result.nodes.find((node) => node.name === "media")?.size).toBe(2048);
  });

  it("applies include and exclude patterns while preserving folders", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "keep"));
    await mkdir(path.join(root, "skip"));
    await writeFile(path.join(root, "keep", "report.txt"), "included");
    await writeFile(path.join(root, "keep", "raw.tmp"), "ignored");
    await writeFile(path.join(root, "skip", "report.txt"), "excluded");

    const result = await scanFolders({
      roots: [root],
      include: ["*.txt"],
      exclude: ["skip"],
      concurrency: 2
    });

    expect(result.totals.files).toBe(1);
    expect(result.nodes.some((node) => node.name === "raw.tmp")).toBe(false);
    expect(result.nodes.some((node) => node.name === "skip")).toBe(false);
    expect(result.totals.bytes).toBe("included".length);
  });

  it("emits partial indexes while scanning", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "live"));
    await writeFile(path.join(root, "live", "ready.txt"), "visible");
    const partials: number[] = [];

    await scanFolders(
      { roots: [root], concurrency: 2 },
      {
        onProgress: (progress) => {
          if (progress.partialResult) {
            partials.push(progress.partialResult.nodes.length);
          }
        }
      }
    );

    expect(partials.length).toBeGreaterThan(0);
    expect(Math.max(...partials)).toBeGreaterThan(0);
  });

  it("honors maxDepth for deep trees", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "a", "b"), { recursive: true });
    await writeFile(path.join(root, "a", "b", "deep.txt"), "deep");
    await writeFile(path.join(root, "a", "surface.txt"), "surface");

    const result = await scanFolders({ roots: [root], maxDepth: 2, concurrency: 2 });

    expect(result.nodes.some((node) => node.name === "surface.txt")).toBe(true);
    expect(result.nodes.some((node) => node.name === "deep.txt")).toBe(false);
    expect(result.totals.bytes).toBe("surface".length);
  });

  it("reports inaccessible roots as scan errors", async () => {
    const root = path.join(os.tmpdir(), `opentree-missing-${Date.now()}`);
    const result = await scanFolders({ roots: [root], concurrency: 1 });

    expect(result.totals.errors).toBe(1);
    expect(result.errors[0]?.path).toBe(root);
  });
});
