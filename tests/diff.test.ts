import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { diffLines, diffStats, unifiedDiff } from "../src/lib/diff";

describe("diffLines", () => {
  test("finds the minimal edits", () => {
    const lines = diffLines("a\nb\nc\nd\n", "a\nB\nc\nd\ne\n");
    expect(lines.filter((l) => l.type !== " ").map((l) => l.type + l.text)).toEqual([
      "-b",
      "+B",
      "+e",
    ]);
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1 });
  });
  test("identical texts have no changes", () => {
    expect(diffLines("x\ny\n", "x\ny\n").every((l) => l.type === " ")).toBe(true);
    expect(unifiedDiff("a.ts", "x\n", "x\n")).toBe("");
  });
  test("a missing final newline counts as a change", () => {
    const lines = diffLines("a\nb", "a\nb\n");
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1 });
  });
});

/** Apply the patch with the real `git apply` in a scratch repository and compare the result. */
function applyWithGit(
  files: Record<string, string>,
  change: { path: string; before: string | null; after: string | null }[],
) {
  const dir = mkdtempSync(join("/tmp", "nykst-diff-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const patch = change.map((item) => unifiedDiff(item.path, item.before, item.after)).join("");
  writeFileSync(join(dir, "change.patch"), patch);
  execFileSync("git", ["apply", "--check", "change.patch"], { cwd: dir });
  execFileSync("git", ["apply", "change.patch"], { cwd: dir });
  return { dir, patch };
}

describe("unifiedDiff produces patches that git apply accepts", () => {
  const long = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n") + "\n";

  test("modify with several separate hunks", () => {
    const after = long
      .replace("line 3\n", "line three\n")
      .replace("line 30\n", "line 30\nextra\n")
      .replace("line 55\n", "");
    const { dir } = applyWithGit({ "src/a.ts": long }, [{ path: "src/a.ts", before: long, after }]);
    expect(readFileSync(join(dir, "src/a.ts"), "utf8")).toBe(after);
  });
  test("create a new file in a new folder", () => {
    const { dir } = applyWithGit({ "keep.txt": "x\n" }, [
      { path: "src/new/file.ts", before: null, after: "export const a = 1;\n" },
    ]);
    expect(readFileSync(join(dir, "src/new/file.ts"), "utf8")).toBe("export const a = 1;\n");
  });
  test("delete a file", () => {
    const { dir } = applyWithGit({ "gone.ts": "bye\n", "keep.txt": "x\n" }, [
      { path: "gone.ts", before: "bye\n", after: null },
    ]);
    expect(existsSync(join(dir, "gone.ts"))).toBe(false);
  });
  test("files without a trailing newline, in every combination", () => {
    for (const [before, after] of [
      ["a\nb", "a\nc"],
      ["a\nb", "a\nb\n"],
      ["a\nb\n", "a\nb"],
      ["a\nb\n", "a\nb\nc"],
    ] as const) {
      const { dir } = applyWithGit({ "f.txt": before }, [{ path: "f.txt", before, after }]);
      expect(readFileSync(join(dir, "f.txt"), "utf8")).toBe(after);
    }
  });
  test("a change at the very start and the very end", () => {
    const before = "first\nmiddle\nlast\n";
    const after = "FIRST\nmiddle\nLAST\n";
    const { dir } = applyWithGit({ "f.txt": before }, [{ path: "f.txt", before, after }]);
    expect(readFileSync(join(dir, "f.txt"), "utf8")).toBe(after);
  });
  test("emptying a file and filling an empty file", () => {
    for (const [before, after] of [
      ["a\nb\n", ""],
      ["", "a\nb\n"],
    ] as const) {
      const { dir } = applyWithGit({ "f.txt": before }, [{ path: "f.txt", before, after }]);
      expect(readFileSync(join(dir, "f.txt"), "utf8")).toBe(after);
    }
  });
  test("several files in one patch", () => {
    const { dir } = applyWithGit({ "a.txt": "1\n2\n", "b.txt": "x\n" }, [
      { path: "a.txt", before: "1\n2\n", after: "1\n2\n3\n" },
      { path: "b.txt", before: "x\n", after: null },
      { path: "c.txt", before: null, after: "new\n" },
    ]);
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("1\n2\n3\n");
    expect(existsSync(join(dir, "b.txt"))).toBe(false);
    expect(readFileSync(join(dir, "c.txt"), "utf8")).toBe("new\n");
  });
});
