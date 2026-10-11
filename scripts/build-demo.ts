/**
 * Builds the read-only demo snapshot from a local checkout of a public repository.
 *
 *   git clone https://github.com/shadcn-ui/taxonomy.git /tmp/taxonomy
 *   bun scripts/build-demo.ts /tmp/taxonomy shadcn-ui/taxonomy
 *
 * Everything in it is real: the analysis, the history from `git log`, the findings, and one
 * recorded change that was actually run through the checker (a rename of a widely imported
 * export). Output: public/demo/snapshot.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { analyzeRepository } from "../src/lib/analysis/engine.server";
import { computeFindings } from "../src/lib/analysis/findings";
import { impactOf, indexAnalysis } from "../src/lib/analysis/impact";
import { verifyChange } from "../src/lib/analysis/verify.server";
import { unifiedDiff } from "../src/lib/diff";
import { gitHistory, readRepo } from "./lib/local-repo";

const root = process.argv[2];
const name = process.argv[3];
if (!root || !name) {
  console.error("usage: bun scripts/build-demo.ts <checkout> <owner/name>");
  process.exit(1);
}
const sha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const when = execFileSync("git", ["-C", root, "log", "-1", "--format=%aI"], {
  encoding: "utf8",
}).trim();

const { paths, contents } = readRepo(root);
const analysis = await analyzeRepository({ ref: sha, paths, contents });
const history = {
  generatedAt: when,
  commits: gitHistory(root, 200),
  pullRequests: [],
  limitations: [
    "Demo history comes from `git log` of the public repository: commits only, no pull requests.",
  ],
};
const findings = computeFindings(analysis, history);

// Recorded change: rename the exported function with the most importers, then run the checker.
const index = indexAnalysis(analysis);
const candidates: { path: string; name: string; importers: number }[] = [];
for (const file of analysis.files) {
  const text = contents.get(file.path);
  if (!text || file.role === "test") continue;
  for (const exported of file.exports) {
    if (!new RegExp(`export\\s+(async\\s+)?function\\s+${exported}\\b`).test(text)) continue;
    const importers = analysis.files.filter((other) =>
      other.imports.some((ref) => ref.target === file.path && ref.names.includes(exported)),
    ).length;
    if (importers >= 3) candidates.push({ path: file.path, name: exported, importers });
  }
}
candidates.sort((a, b) => b.importers - a.importers || a.path.localeCompare(b.path));
const pick = candidates[0];
let recorded: unknown;
if (pick) {
  const before = contents.get(pick.path)!;
  const renamed = `${pick.name}V2`;
  const after = before.replace(
    new RegExp(`(export\\s+(?:async\\s+)?function\\s+)${pick.name}\\b`),
    `$1${renamed}`,
  );
  const report = await verifyChange(analysis, [{ path: pick.path, content: after }]);
  const files = [{ path: pick.path, status: "modified" as const, before, after }];
  recorded = {
    title: `Rename ${pick.name}() to ${renamed}()`,
    description: `A one-line rename in ${pick.path}. ${pick.importers} files import ${pick.name}; the checker finds every one that would stop working.`,
    files,
    report,
    patch: unifiedDiff(pick.path, before, after),
  };
  console.log(
    `recorded change: ${pick.name} in ${pick.path} -> ${report.verdict}, ${report.counts.errors} errors`,
  );
}

const snapshot = {
  repository_full_name: name,
  created_at: when,
  payload: { analysis, history, findings, recorded },
};
mkdirSync("public/demo", { recursive: true });
const out = JSON.stringify(snapshot);
writeFileSync("public/demo/snapshot.json", out);
const level = (path: string) => impactOf(index, [path]).level;
console.log(
  `${name}@${sha.slice(0, 7)}: ${analysis.files.length} files, ${history.commits.length} commits, ${findings.length} findings, ${(out.length / 1024).toFixed(0)} KB`,
);
if (pick) console.log(`impact of ${pick.path}: ${level(pick.path)}`);
