/**
 * Fails when a public number or tool-count claim drifts from the committed
 * snapshot or the executable MCP catalog.
 *
 *   bun run check:claims
 *
 * This is the local guard behind PRD FR-NUM-01 (one snapshot drives every
 * surface) and FR-MCP-01 (one tool list drives every mention). It deliberately
 * checks the README text people quote, not a summary computed at render time.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOLS } from "../src/lib/analysis/tools";

const snapshot = JSON.parse(readFileSync("src/lib/analysis/self-snapshot.json", "utf8")) as {
  stats: { sourceFiles: number; loc: number; internalEdges: number; unresolvedImports: number };
  cycles: unknown[];
  resources: unknown[];
  services: unknown[];
};
const readme = readFileSync("README.md", "utf8");
const schema = JSON.parse(readFileSync("docs/mcp-tools.json", "utf8")) as {
  toolCount: number;
  tools: unknown;
};
const statsModule = JSON.parse(
  readFileSync("src/lib/analysis/self-snapshot-stats.json", "utf8"),
) as Record<string, number | string>;

const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};
const stats = snapshot.stats;

check(
  readme.includes(`**${stats.sourceFiles} files, ${stats.loc.toLocaleString("en-US")} LOC**`),
  `README must state the snapshot size: ${stats.sourceFiles} files, ${stats.loc.toLocaleString("en-US")} LOC.`,
);
check(
  readme.includes(`${stats.internalEdges.toLocaleString("en-US")}, zero unresolved`),
  `README must state ${stats.internalEdges.toLocaleString("en-US")} internal edges with zero unresolved imports.`,
);
check(stats.unresolvedImports === 0, "The committed snapshot has unresolved imports; refresh it.");
check(
  readme.includes(`**${snapshot.cycles.length}**`),
  `README must state ${snapshot.cycles.length} cycles.`,
);

const row = (label: string) => {
  const match = new RegExp(`\\| ${label}\\s*\\| \\*\\*(\\d+)\\*\\*`).exec(readme);
  return match ? Number(match[1]) : null;
};
check(
  row("SQL and data resources") === snapshot.resources.length,
  `README SQL resource row must be ${snapshot.resources.length}.`,
);
check(
  row("External services") === snapshot.services.length,
  `README external service row must be ${snapshot.services.length}.`,
);

check(
  readme.includes("11 read-only tools") &&
    readme.includes("Eleven read-only MCP tools") &&
    readme.includes("Eleven MCP tools") &&
    readme.includes("now eleven"),
  "README must say eleven tools in the matrix, layers, structure and roadmap.",
);
for (const tool of TOOLS)
  check(readme.includes(tool.name), `README is missing the MCP tool ${tool.name}.`);

check(!readme.includes("\u200b"), "README still contains a zero-width space.");
check(!readme.includes("\u2014"), "README still contains an em dash.");

// The same count can be hard-coded in UI copy. Catch it at the source instead
// of waiting for a visitor to compare two screens.
const sourceFiles: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(path);
  }
};
walk("src");
for (const path of sourceFiles) {
  const text = readFileSync(path, "utf8");
  check(
    !/\b10\s+(?:read-only|Read-Only|readOnlyHint)\b|\bten\s+read-only\b/i.test(text),
    `${path} still says ten or 10 read-only tools; use TOOLS.length.`,
  );
}

check(
  statsModule.sourceFiles === stats.sourceFiles &&
    statsModule.loc === stats.loc &&
    statsModule.internalEdges === stats.internalEdges &&
    statsModule.unresolvedImports === stats.unresolvedImports,
  "src/lib/analysis/self-snapshot-stats.json is stale; run bun run snapshot:self.",
);

check(schema.toolCount === TOOLS.length, "docs/mcp-tools.json toolCount is stale.");
check(
  JSON.stringify(schema.tools) === JSON.stringify(TOOLS),
  "docs/mcp-tools.json is stale; run bun run mcp:schema.",
);

if (failures.length) {
  console.error(
    `Claim check failed with ${failures.length} mismatch${failures.length === 1 ? "" : "es"}:`,
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      sourceFiles: stats.sourceFiles,
      loc: stats.loc,
      internalEdges: stats.internalEdges,
      tools: TOOLS.length,
      claims: "ok",
    },
    null,
    2,
  ),
);
