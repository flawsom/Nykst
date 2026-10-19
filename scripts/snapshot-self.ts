/**
 * Compiles this repository and writes the analysis the hosted app serves.
 *
 * The production bundle ships without a source tree, so `/api/analysis/self`
 * cannot walk `src/` there. Run this script after changing source files:
 *
 *   bun run snapshot:self
 *
 * The route falls back to this snapshot whenever the running server cannot see
 * a real source tree.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeRepository, MAX_SOURCE_BYTES, wantsContent } from "../src/lib/analysis/engine.server";

const IGNORED = new Set([
  ".git",
  "node_modules",
  "dist",
  ".output",
  ".vercel",
  ".wrangler",
  ".tanstack",
  ".nitro",
  "coverage",
  "playwright-report",
  "test-results",
  "BUFFY_TASK_OUTPUT",
]);

const root = process.cwd();
const paths: string[] = [];
const contents = new Map<string, string>();
let skipped = 0;

function walk(dir: string, prefix = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!prefix && IGNORED.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED.has(entry.name)) continue;
      walk(join(dir, entry.name), rel);
      continue;
    }
    if (!entry.isFile()) continue;
    const full = join(dir, entry.name);
    const size = statSync(full).size;
    paths.push(rel);
    if (wantsContent(rel, size)) contents.set(rel, readFileSync(full, "utf8"));
    else if (size > MAX_SOURCE_BYTES) skipped += 1;
  }
}

walk(root);

const analysis = await analyzeRepository({
  ref: "self-snapshot",
  paths: paths.sort(),
  contents,
  skipped,
});

const out = join(root, "src/lib/analysis/self-snapshot.json");
if (!existsSync(join(root, "src"))) {
  console.error("Run this from the repository root.");
  process.exit(1);
}
writeFileSync(out, `${JSON.stringify(analysis)}\n`);

console.log(
  JSON.stringify(
    {
      out,
      bytes: statSync(out).size,
      sourceFiles: analysis.stats.sourceFiles,
      internalEdges: analysis.stats.internalEdges,
      unresolvedImports: analysis.stats.unresolvedImports,
      loc: analysis.stats.loc,
      cycles: analysis.cycles.length,
      resources: analysis.resources.length,
      services: analysis.services.length,
    },
    null,
    2,
  ),
);
