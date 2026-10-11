/**
 * Does Nykst's impact analysis point at the files engineers really changed together?
 *
 *   bun scripts/eval-cochange.ts <repo-dir> [commits=300]
 *
 * For each recent commit that touched 2-25 analyzed source files, every changed file is used
 * in turn as the "seed" (the file an engineer starts editing). We then ask which of the OTHER
 * files in that commit each predictor would have surfaced:
 *   siblings   files in the same folder (what you find by browsing)
 *   direct     files that import the seed, or are imported by it (what a grep finds)
 *   impact     everything that transitively imports the seed + its direct imports (get_impact)
 *   cochange   files that changed together with the seed in OLDER commits (history only)
 *   combined   impact + cochange
 * Co-change is the usual stand-in for "needed to change too"; it is not the same as "broke".
 * The graph is built from HEAD, so files that no longer exist are ignored.
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { analyzeRepository, wantsContent } from "../src/lib/analysis/engine.server";
import { indexAnalysis, impactOf } from "../src/lib/analysis/impact";

const root = process.argv[2] ?? ".";
const commitLimit = Number(process.argv[3] ?? 300);

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
const known = new Set(analysis.files.map((file) => file.path));
const total = known.size;

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
const commits: string[][] = [];
for (const block of log.split("@@").slice(1)) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  commits.push(lines.slice(1).filter((path) => known.has(path)));
}
commits.reverse(); // oldest first, so "older commits" are already processed

const dirOf = (path: string) => path.split("/").slice(0, -1).join("/");
const byDir = new Map<string, string[]>();
for (const path of known) byDir.set(dirOf(path), [...(byDir.get(dirOf(path)) ?? []), path]);

type Predictor = "siblings" | "direct" | "base" | "impact10" | "history10" | "nykst" | "base+nykst";
const NAMES: Predictor[] = [
  "siblings",
  "direct",
  "base",
  "impact10",
  "history10",
  "nykst",
  "base+nykst",
];
type Stat = {
  hits: number;
  peers: number;
  hitsFar: number;
  peersFar: number;
  anyHit: number;
  cases: number;
  size: number;
  baseline: number;
};
const stats = Object.fromEntries(
  NAMES.map((name) => [
    name,
    {
      hits: 0,
      peers: 0,
      hitsFar: 0,
      peersFar: 0,
      anyHit: 0,
      cases: 0,
      size: 0,
      baseline: 0,
    } as Stat,
  ]),
) as Record<Predictor, Stat>;

const cochange = new Map<string, Map<string, number>>();
let evaluated = 0;
let commitsUsed = 0;
const TOP = 10;

for (const changed of commits) {
  const set = [...new Set(changed)];
  const usable = set.length >= 2 && set.length <= 25;
  if (usable) {
    commitsUsed += 1;
    for (const seed of set) {
      const peers = set.filter((path) => path !== seed);
      const direct = new Set<string>([
        ...(index.dependents.get(seed) ?? []).map((edge) => edge.path),
        ...(index.dependencies.get(seed) ?? []).map((edge) => edge.path),
      ]);
      // what get_impact lists first: nearest importers (breadth-first order)
      const impact10 = new Set<string>(
        impactOf(index, [seed])
          .impacted.slice(0, TOP)
          .map((item) => item.path),
      );
      // what the history section lists: files changed together before, seen at least twice
      const history10 = new Set<string>(
        [...(cochange.get(seed) ?? new Map<string, number>()).entries()]
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, TOP)
          .map(([path]) => path),
      );
      const siblings = new Set((byDir.get(dirOf(seed)) ?? []).filter((path) => path !== seed));
      const base = new Set([...siblings, ...direct]);
      const nykst = new Set([...direct, ...impact10, ...history10]);
      const predicted: Record<Predictor, Set<string>> = {
        siblings,
        direct,
        base,
        impact10,
        history10,
        nykst,
        "base+nykst": new Set([...base, ...nykst]),
      };
      for (const name of NAMES) {
        const p = predicted[name];
        p.delete(seed);
        const s = stats[name];
        const hit = peers.filter((peer) => p.has(peer));
        const far = peers.filter((peer) => dirOf(peer) !== dirOf(seed));
        s.hits += hit.length;
        s.peers += peers.length;
        s.hitsFar += far.filter((peer) => p.has(peer)).length;
        s.peersFar += far.length;
        s.anyHit += hit.length > 0 ? 1 : 0;
        s.cases += 1;
        s.size += p.size;
        s.baseline += p.size / total;
      }
      evaluated += 1;
    }
  }
  // learn history only after predicting this commit, and ignore bulk commits (formatting, renames)
  if (usable)
    for (const a of set)
      for (const b of set)
        if (a !== b) {
          const map = cochange.get(a) ?? new Map<string, number>();
          map.set(b, (map.get(b) ?? 0) + 1);
          cochange.set(a, map);
        }
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
console.log(`\nrepo: ${root}`);
console.log(`analyzed source files: ${total}, import edges: ${analysis.stats.internalEdges}`);
console.log(
  `commits examined: ${commits.length}, usable (2-25 source files): ${commitsUsed}, seed cases: ${evaluated}\n`,
);
console.log(
  "predictor    recall | other-folder recall | any peer found | files shown | random recall at same size",
);
for (const name of NAMES) {
  const s = stats[name];
  console.log(
    `${name.padEnd(11)} ${pct(s.hits, s.peers).padStart(7)} | ${pct(s.hitsFar, s.peersFar).padStart(19)} | ${pct(s.anyHit, s.cases).padStart(14)} | ${(s.size / Math.max(s.cases, 1)).toFixed(1).padStart(11)} | ${pct(s.baseline, s.cases).padStart(8)}`,
  );
}
