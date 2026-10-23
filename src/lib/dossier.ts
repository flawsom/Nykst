/**
 * Everything the dossier renders, computed from the analyzed graph instead of
 * re-parsed text. Every row carries the file and the line it came from, so the
 * UI can turn each one into a click-to-code target.
 */

import { indexAnalysis } from "./analysis/impact";
import { columnDriftFindings } from "./analysis/sql";
import type { RepoAnalysis } from "./analysis/types";

export type DossierRowKind =
  "importer" | "dependent" | "entrypoint" | "test" | "resource" | "drift" | "symbol";

export interface DossierRow {
  path: string;
  line?: number;
  label: string;
  detail?: string;
  kind: DossierRowKind;
}

export interface DossierSection {
  id: "importers" | "dependents" | "entrypoints" | "resources" | "drift" | "symbols";
  title: string;
  subtitle: string;
  rows: DossierRow[];
  /** total rows before the display cap */
  total: number;
}

export interface DossierOptions {
  limit?: number;
}

const MAX = 60;

export function buildNodeDossier(
  analysis: RepoAnalysis | null | undefined,
  paths: string[],
  options: DossierOptions = {},
): DossierSection[] {
  if (!analysis) return [];
  const limit = Math.max(1, options.limit ?? MAX);
  const index = indexAnalysis(analysis);
  const seeds = [...new Set(paths.filter((path) => index.files.has(path)))];
  if (!seeds.length) return [];

  /* --------------------------- direct importers --------------------------- */
  const direct = new Map<string, DossierRow>();
  for (const path of seeds) {
    for (const edge of index.dependents.get(path) ?? []) {
      if (seeds.includes(edge.path)) continue;
      const key = `${edge.path}:${edge.line}`;
      if (direct.has(key)) continue;
      const importer = index.files.get(edge.path);
      direct.set(key, {
        path: edge.path,
        line: edge.line,
        label: edge.path,
        kind: "importer",
        detail: `${edge.typeOnly ? "type-only import" : "runtime import"} of ${path}${importer?.role ? ` · ${importer.role}` : ""}`,
      });
    }
  }

  /* -------------------------- transitive reverse -------------------------- */
  const queue = [...seeds];
  const seen = new Set(seeds);
  const transitive: DossierRow[] = [];
  for (let head = 0; head < queue.length; head += 1) {
    for (const edge of index.dependents.get(queue[head]!) ?? []) {
      if (seen.has(edge.path)) continue;
      seen.add(edge.path);
      queue.push(edge.path);
      transitive.push({
        path: edge.path,
        line: edge.line,
        label: edge.path,
        kind: "dependent",
        detail: `reaches ${queue[head]}${edge.typeOnly ? " (type-only)" : ""}`,
      });
    }
  }

  /* ------------------------------ entrypoints ----------------------------- */
  const entrypoints: DossierRow[] = [];
  const tests: DossierRow[] = [];
  for (const path of seen) {
    const file = index.files.get(path);
    if (!file) continue;
    if (file.role === "route" || file.role === "api")
      entrypoints.push({
        path,
        label: path,
        kind: "entrypoint",
        detail: `${file.role} handler reached from this node`,
      });
    if (file.role === "test")
      tests.push({ path, label: path, kind: "test", detail: "test file covering this node" });
  }

  /* ------------------------------ data layer ------------------------------ */
  const seedSet = new Set(seeds);
  const resources: DossierRow[] = [];
  for (const resource of analysis.resources) {
    const uses = resource.uses.filter((use) => seedSet.has(use.path));
    if (!uses.length && !resource.definedIn.some((path) => seedSet.has(path))) continue;
    for (const use of uses)
      resources.push({
        path: use.path,
        line: use.line,
        label: `${resource.kind} ${resource.name}`,
        kind: "resource",
        detail: `${resource.kind} ${resource.name} · ${resource.service}${resource.columns?.length ? ` · ${resource.columns.length} columns` : ""}`,
      });
  }

  const drift: DossierRow[] = [];
  for (const finding of columnDriftFindings(analysis)) {
    for (const reference of finding.references) {
      if (!seedSet.has(reference.path)) continue;
      drift.push({
        path: reference.path,
        line: reference.line,
        label: `${finding.table}.${finding.column}`,
        kind: "drift",
        detail: finding.message,
      });
    }
  }

  /* ------------------------------- signatures ----------------------------- */
  const symbols: DossierRow[] = [];
  for (const path of seeds) {
    const file = index.files.get(path);
    for (const symbol of file?.symbols ?? [])
      symbols.push({
        path,
        line: symbol.line,
        label: symbol.name,
        kind: "symbol",
        detail: [
          symbol.kind,
          symbol.arity !== undefined ? `${symbol.arity} params` : null,
          symbol.returnType ? `-> ${symbol.returnType}` : null,
          symbol.typeProperties?.length ? `${symbol.typeProperties.length} properties` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    if (!file?.symbols?.length)
      for (const name of file?.exports.slice(0, 20) ?? [])
        symbols.push({ path, label: name, kind: "symbol", detail: "exported name" });
  }

  const rows = (items: DossierRow[]) =>
    items.sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0));

  const section = (
    id: DossierSection["id"],
    title: string,
    subtitle: string,
    items: DossierRow[],
  ): DossierSection => {
    const sorted = rows(items);
    return {
      id,
      title,
      subtitle,
      rows: sorted.slice(0, limit),
      total: sorted.length,
    };
  };

  return [
    section("importers", "Direct Importers (file:line)", "Files that import this node today", [
      ...direct.values(),
    ]),
    section(
      "dependents",
      "Transitive Call Chain",
      "Everything that breaks if this node changes",
      transitive,
    ),
    section(
      "entrypoints",
      "Affected API Routes & Pages",
      "Page routes and API handlers downstream",
      entrypoints,
    ),
    section(
      "resources",
      "SQL Tables & Column Contracts",
      "Tables, functions and buckets touched here",
      resources,
    ),
    section(
      "drift",
      "SQL Column Contract Drift",
      "Literal column references that disagree with the DDL",
      drift,
    ),
    section("symbols", "Exported signatures", "What other files are allowed to call", symbols),
  ];
}
