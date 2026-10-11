/** bun scripts/findings-local.ts <repo-dir> [commits=300]: what the findings engine says about a checkout. */
import { analyzeRepository } from "../src/lib/analysis/engine.server";
import { computeFindings } from "../src/lib/analysis/findings";
import { gitHistory, readRepo } from "./lib/local-repo";

const root = process.argv[2] ?? ".";
const { paths, contents } = readRepo(root);
const analysis = await analyzeRepository({ ref: "local", paths, contents });
const history = {
  generatedAt: new Date().toISOString(),
  commits: gitHistory(root, Number(process.argv[3] ?? 300)),
  pullRequests: [],
  limitations: [],
};
const findings = computeFindings(analysis, history);
console.log(
  `\n${root.split("/").slice(-1)[0]}: ${analysis.stats.analyzedFiles} files, ${history.commits.length} commits -> ${findings.length} findings`,
);
const byKind = new Map<string, typeof findings>();
for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
for (const [kind, list] of byKind) {
  const sev = ["high", "medium", "low"]
    .map((s) => `${list.filter((f) => f.severity === s).length}${s[0]}`)
    .join("/");
  console.log(`  ${kind.padEnd(20)} ${String(list.length).padStart(3)} (${sev})`);
  for (const f of list.slice(0, 2)) console.log(`      - ${f.title.slice(0, 100)}`);
}
