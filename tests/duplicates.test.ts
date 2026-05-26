import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findDuplicateFiles } from "../src/main/duplicates";
import { scanFolders } from "../src/main/scanner";

const created: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "opentree-dupes-"));
  created.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("findDuplicateFiles", () => {
  it("groups files by matching content hash", async () => {
    const root = await tempDir();
    await writeFile(path.join(root, "one.bin"), Buffer.from("same-content"));
    await writeFile(path.join(root, "two.bin"), Buffer.from("same-content"));
    await writeFile(path.join(root, "three.bin"), Buffer.from("same-length!"));

    const result = await scanFolders({ roots: [root] });
    const groups = await findDuplicateFiles(result, { hash: true, algorithm: "sha256" });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.files.map((file) => file.name).sort()).toEqual(["one.bin", "two.bin"]);
    expect(groups[0]?.wastedBytes).toBe(Buffer.from("same-content").length);
  });

  it("respects the minimum size filter", async () => {
    const root = await tempDir();
    await writeFile(path.join(root, "a.txt"), "x");
    await writeFile(path.join(root, "b.txt"), "x");

    const result = await scanFolders({ roots: [root] });
    const groups = await findDuplicateFiles(result, { minSize: 2 });

    expect(groups).toHaveLength(0);
  });
});
