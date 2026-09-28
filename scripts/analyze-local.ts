/**
 * Runs the repository analysis engine against a local checkout, for development.
 *   bun scripts/analyze-local.ts [dir] [--json out.json]
 */
import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  analyzeRepository,
  MAX_SOURCE_BYTES,
  wantsContent,
} from "../src/lib/analysis/engine.server";
import { isSourcePath } from "../src/lib/analysis/resolve";

const root = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : process.cwd();
const jsonOut = process.argv.includes("--json")
  ? process.argv[process.argv.indexOf("--json") + 1]
  : null;

const paths: string[] = [];
const contents = new Map<string, string>();
let skipped = 0;
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
      else if (isSourcePath(path) && stat.size > MAX_SOURCE_BYTES) skipped += 1;
    }
  }
};
walk(root);
const analysis = analyzeRepository({ ref: "local", paths, contents, skipped });
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(analysis));
console.log(JSON.stringify(analysis.stats, null, 2));
console.log("packages", analysis.packages);
console.log(
  "services",
  analysis.services.map(
    (s) => `${s.name}(${s.files.length}) pkgs=${s.packages.join(",")} env=${s.envVars.join(",")}`,
  ),
);
console.log(
  "resources",
  analysis.resources
    .slice(0, 30)
    .map((r) => `${r.id} uses=${r.uses.length} def=${r.definedIn.length}`),
);
console.log("cycles", analysis.cycles.slice(0, 5));
console.log(
  "unresolved",
  analysis.files
    .flatMap((f) =>
      f.imports.filter((i) => i.kind === "unresolved").map((i) => `${f.path}: ${i.specifier}`),
    )
    .slice(0, 20),
);
console.log(
  "roles",
  Object.entries(
    analysis.files.reduce<Record<string, number>>(
      (acc, f) => ((acc[f.role] = (acc[f.role] ?? 0) + 1), acc),
      {},
    ),
  ),
);
console.log("limitations", analysis.limitations);
