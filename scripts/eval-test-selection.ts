/**
 * Would "run only the tests Nykst says are affected" have been safe and cheaper?
 *
 *   bun scripts/eval-test-selection.ts <repo-dir> [commits=400]
 *
 * For recent commits that changed both source files and test files, take the changed source
 * files as the "change" and select tests that transitively import them (Nykst's impact set).
 * Ground truth is the test files the author changed in the same commit, a stand-in for "the
 * tests that mattered". We report how many of those were selected and how much of the whole
 * suite had to run, next to two cheap baselines. Co-change is not the same as "would have
 * failed", so treat recall as an upper-bound-ish proxy, not a guarantee.
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { analyzeRepository, wantsContent } from "../src/lib/analysis/engine.server";
import { impactOf, indexAnalysis } from "../src/lib/analysis/impact";

const root = process.argv[2] ?? ".";
const commitLimit = Number(process.argv[3] ?? 400);

const paths: string[] = [];
const contents = new Map<string, string>();
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    if (entry === ".git" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(full);
    else {
      const path = relative(root, full);
      paths.push(path);
      if (wantsContent(path, stat.size)) contents.set(path, readFileSync(full, "utf8"));
    }
  }
};
walk(root);
const analysis = await analyzeRepository({ ref: "HEAD", paths, contents });
const index = indexAnalysis(analysis);
const role = new Map(analysis.files.map((file) => [file.path, file.role]));
const allTests = analysis.files.filter((file) => file.role === "test").map((file) => file.path);
const testSet = new Set(allTests);

const log = execFileSync(
  "git",
  [
    "-C",
    root,
    "log",
    "--no-merges",
    "--no-renames",
    `-n${commitLimit}`,
    "--name-only",
    "--format=@@%H",
  ],
  { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
);

const dirOf = (path: string) => path.split("/").slice(0, -1).join("/");
type Row = { recall: number; share: number; any: boolean };
const rows: Record<"nykst" | "runtimeOnly" | "sameFolder" | "sameFolderOrBelow", Row[]> = {
  nykst: [],
  runtimeOnly: [],
  sameFolder: [],
  sameFolderOrBelow: [],
};

let usable = 0;
for (const block of log.split("@@").slice(1)) {
  const changed = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1)
    .filter((path) => role.has(path));
  if (changed.length > 40) continue; // bulk edits say nothing about which tests matter
  const source = changed.filter((path) => role.get(path) !== "test");
  const truth = changed.filter((path) => testSet.has(path));
  if (!source.length || !truth.length) continue;
  usable += 1;

  const closure = impactOf(index, source);
  const selected = new Set(
    closure.impacted.filter((item) => testSet.has(item.path)).map((item) => item.path),
  );
  const runtimeSelected = new Set(
    closure.impacted
      .filter((item) => testSet.has(item.path) && !item.typeOnly)
      .map((item) => item.path),
  );
  const folders = new Set(source.map(dirOf));
  const sameFolder = new Set(allTests.filter((test) => folders.has(dirOf(test))));
  const folderOrBelow = new Set(
    allTests.filter((test) =>
      [...folders].some((folder) => dirOf(test) === folder || dirOf(test).startsWith(`${folder}/`)),
    ),
  );
  const score = (picked: Set<string>): Row => ({
    recall: truth.filter((test) => picked.has(test)).length / truth.length,
    share: picked.size / Math.max(allTests.length, 1),
    any: truth.some((test) => picked.has(test)),
  });
  rows.nykst.push(score(selected));
  rows.runtimeOnly.push(score(runtimeSelected));
  rows.sameFolder.push(score(sameFolder));
  rows.sameFolderOrBelow.push(score(folderOrBelow));
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
};
const pct = (value: number) => `${(100 * value).toFixed(1)}%`;

console.log(`\nrepo: ${root}`);
console.log(
  `test files in suite: ${allTests.length} of ${analysis.stats.analyzedFiles} source files`,
);
console.log(`commits that changed code and tests (<=40 files): ${usable}\n`);
console.log(
  "selection             | changed tests found | at least one found | share of suite run (mean / median)",
);
for (const [name, list] of Object.entries(rows)) {
  console.log(
    `${name.padEnd(21)} | ${pct(mean(list.map((r) => r.recall))).padStart(19)} | ${pct(mean(list.map((r) => (r.any ? 1 : 0)))).padStart(18)} | ${pct(mean(list.map((r) => r.share))).padStart(7)} / ${pct(median(list.map((r) => r.share)))}`,
  );
}
console.log("run everything        |              100.0% |             100.0% |  100.0% / 100.0%");
