import { describe, expect, test } from "bun:test";
import {
  candidateFiles,
  parseGeneratedChange,
  parsePicked,
  safeEditPath,
} from "../src/lib/analysis/generate";
import { analyzeFixture } from "./helpers";

describe("parseGeneratedChange", () => {
  test("reads summary, files and deletions", () => {
    const parsed = parseGeneratedChange(
      [
        "<<<SUMMARY>>>",
        "Added a flag.",
        "<<<END>>>",
        "<<<FILE src/a.ts>>>",
        "export const a = 1;",
        "<<<END>>>",
        "<<<DELETE src/old.ts>>>",
      ].join("\n"),
    );
    expect(parsed.summary).toBe("Added a flag.");
    expect(parsed.edits).toEqual([
      { path: "src/a.ts", content: "export const a = 1;\n" },
      { path: "src/old.ts", content: null },
    ]);
    expect(parsed.problems).toEqual([]);
  });
  test("strips a fence around a file and keeps inner fences", () => {
    const parsed = parseGeneratedChange("<<<FILE a.md>>>\n```md\nhello\n```\n<<<END>>>");
    expect(parsed.edits[0]!.content).toBe("hello\n");
  });
  test("ignores unsafe paths and cut-off files, and reports them", () => {
    const parsed = parseGeneratedChange(
      "<<<FILE ../etc/passwd>>>\nx\n<<<END>>>\n<<<FILE src/b.ts>>>\nnever closed",
    );
    expect(parsed.edits).toEqual([]);
    expect(parsed.problems.length).toBe(2);
  });
  test("keeps the first of duplicate paths", () => {
    const parsed = parseGeneratedChange(
      "<<<FILE a.ts>>>\n1\n<<<END>>>\n<<<FILE a.ts>>>\n2\n<<<END>>>",
    );
    expect(parsed.edits.map((e) => e.content)).toEqual(["1\n"]);
  });
});

describe("safeEditPath", () => {
  test("accepts repo-relative paths only", () => {
    expect(safeEditPath("./src/a.ts")).toBe("src/a.ts");
    expect(safeEditPath("/abs/a.ts")).toBe("abs/a.ts"); // a leading slash is read as repo-relative
    expect(safeEditPath("src/../a.ts")).toBeNull();
    expect(safeEditPath("")).toBeNull();
  });
});

describe("candidateFiles and parsePicked", () => {
  test("ranks files whose path or exports match the task", async () => {
    const analysis = await analyzeFixture({
      "src/billing/invoice.ts": "export function createInvoice() {}",
      "src/auth/login.ts": "export function login() {}",
      "src/util.ts": "export const x = 1;",
    });
    expect(candidateFiles(analysis, "add tax to invoice creation")[0]).toBe(
      "src/billing/invoice.ts",
    );
    expect(candidateFiles(analysis, "the and for")).toEqual([]);
    const allowed = new Set(["src/auth/login.ts"]);
    expect(parsePicked("1. src/auth/login.ts\nsrc/nope.ts", allowed)).toEqual([
      "src/auth/login.ts",
    ]);
  });
});
