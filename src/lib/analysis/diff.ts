import { chainFor, impactOf, indexAnalysis, type ImpactReport } from "./impact";
import type { RepoAnalysis } from "./types";

/**
 * Deterministic blast-radius review for a pull request diff.
 *
 * The report is built from the same reverse import graph and Tarjan cycles the
 * MCP tools use. It never guesses a dependency from a filename and never emits a
 * test name that the graph did not reach.
 */

export type RiskTier = "Low" | "Medium" | "High" | "Critical";

export interface DiffResource {
  id: string;
  name: string;
  kind: string;
  definedIn: string[];
  usedBy: number;
}

export interface DiffBlastRadius {
  changed: string[];
  known: string[];
  unknown: string[];
  risk: RiskTier;
  impact: ImpactReport;
  direct: { path: string; line: number; imports: string; typeOnly: boolean }[];
  transitive: { path: string; depth: number; via: string; line: number; typeOnly: boolean }[];
  entrypoints: { path: string; role: string; chain: string[] }[];
  tests: string[];
  coverageGap: boolean;
  resources: DiffResource[];
  services: string[];
  cycles: { members: string[]; touchesChange: boolean }[];
}

function riskOf(report: ImpactReport): RiskTier {
  if (report.level === "Critical") return "Critical";
  if (report.level === "High") return "High";
  if (report.level === "Moderate") return "Medium";
  return "Low";
}

export function computeDiffBlastRadius(
  analysis: RepoAnalysis,
  changedPaths: string[],
): DiffBlastRadius {
  const index = indexAnalysis(analysis);
  const changed = [...new Set(changedPaths.map((path) => path.replace(/^\.?\//, "")))].sort();
  const known = changed.filter((path) => index.files.has(path));
  const unknown = changed.filter((path) => !index.files.has(path));
  const impact = impactOf(index, known);
  const changedSet = new Set(known);

  const resourceMap = new Map<string, DiffResource>();
  for (const path of known) {
    for (const use of index.files.get(path)?.resources ?? []) {
      const resource = index.resources.get(use.id);
      const entry = resourceMap.get(use.id) ?? {
        id: use.id,
        name: resource?.name ?? use.id.slice(use.id.indexOf(":") + 1),
        kind: resource?.kind ?? use.id.slice(0, use.id.indexOf(":")),
        definedIn: resource?.definedIn ?? [],
        usedBy: resource?.uses.length ?? 0,
      };
      resourceMap.set(use.id, entry);
    }
  }

  const services = new Set<string>();
  for (const path of known)
    for (const id of index.files.get(path)?.services ?? []) services.add(id);

  const cycles = analysis.cycles
    .map((members) => ({
      members,
      touchesChange: members.some((path) => changedSet.has(path)),
    }))
    .sort((a, b) => Number(b.touchesChange) - Number(a.touchesChange));

  const risk = riskOf(impact);
  return {
    changed,
    known,
    unknown,
    risk,
    impact,
    direct: impact.direct.map((item) => ({
      path: item.path,
      line: item.line,
      imports: item.via,
      typeOnly: item.typeOnly,
    })),
    transitive: impact.impacted.map((item) => ({
      path: item.path,
      depth: item.depth,
      via: item.via,
      line: item.line,
      typeOnly: item.typeOnly,
    })),
    entrypoints: impact.entrypoints.map((item) => ({
      path: item.path,
      role: item.role,
      chain: chainFor(impact, item.path),
    })),
    tests: impact.tests.map((item) => item.path).sort(),
    coverageGap: (risk === "High" || risk === "Critical") && impact.tests.length === 0,
    resources: [...resourceMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    services: [...services].sort(),
    cycles,
  };
}

function riskBadge(risk: RiskTier) {
  if (risk === "Critical") return "`CRITICAL`";
  if (risk === "High") return "`HIGH`";
  if (risk === "Medium") return "`MEDIUM`";
  return "`LOW`";
}

function code(path: string) {
  return `\`${path.replace(/`/g, "")}\``;
}

/**
 * GitHub-flavored Markdown review body. The marker is stable so the bot can
 * update its own comment instead of posting a second one.
 */
export function formatBlastRadiusMarkdown(
  report: DiffBlastRadius,
  meta: { repository?: string; pullNumber?: number } = {},
) {
  const lines: string[] = [];
  lines.push("<!-- nykst:blast-radius -->");
  lines.push("## Nykst blast radius");
  lines.push("");
  const subject = meta.repository
    ? `${meta.repository}${meta.pullNumber ? `#${meta.pullNumber}` : ""}`
    : "this change";
  lines.push(
    `**Risk ${report.risk}** ${riskBadge(report.risk)} for ${subject}: ${report.known.length} changed file(s), ${report.impact.runtimeCount} runtime dependent(s), ${report.entrypoints.length} entrypoint(s), ${report.tests.length} covering test file(s).`,
  );
  lines.push("");

  if (report.coverageGap) {
    lines.push(
      "> [!WARNING]",
      "> **Coverage gate:** a High or Critical blast radius has no covering test file reachable in the import graph. Add a test before merging.",
      "",
    );
  }
  if (report.unknown.length) {
    lines.push(
      `> [!NOTE]`,
      `> Not analyzed: ${report.unknown.map(code).join(", ")}. These paths are not JavaScript, TypeScript, Python, Go or Rust sources in the snapshot.`,
      "",
    );
  }

  lines.push("### Changed files");
  lines.push("");
  for (const path of report.changed) {
    const file = report.known.includes(path) ? "analyzed" : "not analyzed";
    lines.push(`- ${code(path)} (${file})`);
  }
  lines.push("");

  lines.push("### Direct dependents");
  lines.push("");
  if (report.direct.length) {
    lines.push("| File | Import line | Imports | Kind |");
    lines.push("| :--- | ---: | :--- | :--- |");
    for (const item of report.direct.slice(0, 40))
      lines.push(
        `| ${code(item.path)} | ${item.line} | ${code(item.imports)} | ${item.typeOnly ? "type only" : "runtime"} |`,
      );
  } else {
    lines.push("No file imports the changed paths directly in the compiled graph.");
  }
  lines.push("");

  const transitive = report.transitive.filter((item) => item.depth > 1);
  if (transitive.length) {
    lines.push("<details>");
    lines.push(`<summary>Transitive dependents (${transitive.length})</summary>`);
    lines.push("");
    lines.push("| File | Hops | Reached through | Line |");
    lines.push("| :--- | ---: | :--- | ---: |");
    for (const item of transitive.slice(0, 80))
      lines.push(`| ${code(item.path)} | ${item.depth} | ${code(item.via)} | ${item.line} |`);
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  lines.push("### Entrypoints reached");
  lines.push("");
  if (report.entrypoints.length) {
    for (const item of report.entrypoints.slice(0, 20))
      lines.push(`- ${code(item.path)} (${item.role}): ${item.chain.map(code).join(" -> ")}`);
  } else {
    lines.push("No route or API entrypoint is reachable through runtime imports.");
  }
  lines.push("");

  lines.push("### Database and service lineage");
  lines.push("");
  if (report.resources.length) {
    for (const resource of report.resources)
      lines.push(
        `- ${code(resource.id)} defined in ${resource.definedIn.length ? resource.definedIn.map(code).join(", ") : "no analyzed migration"}, used by ${resource.usedBy} file(s)`,
      );
  } else {
    lines.push("No table, RPC, model or bucket call is attached to the changed files.");
  }
  if (report.services.length)
    lines.push(`- External services: ${report.services.map(code).join(", ")}`);
  lines.push("");

  lines.push("### Cycles");
  lines.push("");
  if (report.cycles.length) {
    for (const cycle of report.cycles.slice(0, 10))
      lines.push(
        `- ${cycle.touchesChange ? "Touches this change" : "Unrelated"}: ${cycle.members.map(code).join(" -> ")}`,
      );
  } else {
    lines.push("No runtime cycle exists in the compiled graph.");
  }
  lines.push("");

  lines.push("### Covering tests");
  lines.push("");
  if (report.tests.length) {
    for (const path of report.tests.slice(0, 30)) lines.push(`- ${code(path)}`);
  } else {
    lines.push("No test file is reachable from the changed paths through runtime imports.");
  }
  lines.push("");

  lines.push(
    `<sub>Computed by Nykst from a committed snapshot. Every path and line above comes from the compiled import graph; no model was used.</sub>`,
  );
  return `${lines.join("\n")}\n`;
}
