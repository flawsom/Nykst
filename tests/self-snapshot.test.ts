import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoAnalysis } from "../src/lib/analysis/types";

const snapshot = JSON.parse(
  readFileSync("src/lib/analysis/self-snapshot.json", "utf8"),
) as RepoAnalysis;

describe("self analysis snapshot", () => {
  test("covers the real source tree", () => {
    expect(snapshot.stats.sourceFiles).toBeGreaterThanOrEqual(100);
    expect(snapshot.stats.internalEdges).toBeGreaterThanOrEqual(250);
    expect(snapshot.files.length).toBe(snapshot.stats.sourceFiles);
  });

  test("every analyzed path still exists", () => {
    const missing = snapshot.files.filter((file) => !existsSync(file.path)).map((file) => file.path);
    expect(missing).toEqual([]);
  });

  test("no source file is missing from the snapshot", () => {
    const analyzed = new Set(snapshot.files.map((file) => file.path));
    const walked: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) walked.push(path);
      }
    };
    walk("src");
    expect(walked.filter((path) => !analyzed.has(path))).toEqual([]);
  });

  test("carries the evidence the hosted app renders", () => {
    expect(snapshot.cycles).toEqual([]);
    expect(snapshot.resources.length).toBeGreaterThan(0);
    expect(snapshot.services.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(snapshot.generatedAt))).toBe(false);
  });
});
