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
  id: "importers" | "dependents" | "entrypoints" | "tests" | "resources" | "drift" | "symbols";
  title: string;
  subtitle: string;
  rows: DossierRow[];
  /** total rows before the display cap */
  total: number;
  /** what a row actually counts, so call-site rows are never shown as files or tables */
  rowKind: string;
  /** distinct entities behind the rows (files, data resources, symbols) */
  distinct: number;
  /** what those distinct entities are, so the number is never mislabelled */
  distinctLabel: string;
  emptyLabel: string;
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
  const seenSymbols = new Set<string>();
  const addSymbol = (row: DossierRow) => {
    const key = `${row.path}\u0000${row.label}\u0000${row.line ?? 0}`;
    if (seenSymbols.has(key)) return;
    seenSymbols.add(key);
    symbols.push(row);
  };
  for (const path of seeds) {
    const file = index.files.get(path);
    for (const symbol of file?.symbols ?? []) {
      const name = symbol.name.trim();
      addSymbol({
        path,
        line: symbol.line,
        // A blank cell must never look like a complete row. Name the gap and
        // keep the reason in the detail, so a reviewer can chase it.
        label: name || "name unavailable",
        kind: "symbol",
        detail: [
          symbol.kind,
          symbol.arity !== undefined ? `${symbol.arity} params` : null,
          symbol.returnType ? `-> ${symbol.returnType}` : null,
          symbol.typeProperties?.length ? `${symbol.typeProperties.length} properties` : null,
          name ? null : "parser could not derive a symbol name",
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
    if (!file?.symbols?.length)
      for (const name of file?.exports.slice(0, 20) ?? [])
        addSymbol({
          path,
          label: name.trim() || "name unavailable",
          kind: "symbol",
          detail: name.trim() ? "exported name" : "export list contains an empty name",
        });
  }

  const rows = (items: DossierRow[]) =>
    items.sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0));

  const section = (
    id: DossierSection["id"],
    title: string,
    subtitle: string,
    items: DossierRow[],
    rowKind: string,
    emptyLabel: string,
  ): DossierSection => {
    const sorted = rows(items);
    // "Distinct" is only ever shown with what it counts, so a table count can
    // never be mistaken for a count of the places in code that use it.
    const distinctLabel =
      id === "symbols" ? "named pieces" : id === "resources" ? "tables or buckets" : "files";
    return {
      id,
      title,
      subtitle,
      rows: sorted.slice(0, limit),
      total: sorted.length,
      rowKind,
      distinct: new Set(
        sorted.map((row) => (id === "resources" || id === "symbols" ? row.label : row.path)),
      ).size,
      distinctLabel,
      emptyLabel,
    };
  };

  return [
    section(
      "importers",
      "Files that use this file",
      "Directly, with the exact line in each file",
      [...direct.values()],
      "places in code",
      "No file uses this one directly in this saved map.",
    ),
    section(
      "dependents",
      "Files affected further down the chain",
      "Step 2: affected through another file that uses it",
      transitive,
      "different files",
      "Nothing else is affected through another file in this saved map.",
    ),
    section(
      "entrypoints",
      "Screens and API pages affected",
      "What a user or another app would see break if this changes",
      entrypoints,
      "different files",
      "No screen or API page reaches this item in this saved map.",
    ),
    section(
      "tests",
      "Tests that check this",
      "Test files that use this file, directly or through another file. Being listed is not a pass.",
      tests,
      "different files",
      "No test file was found for this in this saved map. Treat a change here as riskier.",
    ),
    section(
      "resources",
      "Database tables and fields used",
      "Places in code that use a table, with the different tables behind them",
      resources,
      "places in code",
      "No database table, function or bucket is used by this item.",
    ),
    section(
      "drift",
      "Database mismatches",
      "Code asks for a field the design does not have, or the other way round",
      drift,
      "places in code",
      "No database mismatch was found against the official design.",
    ),
    section(
      "symbols",
      "Named pieces inside this file",
      "What other files are allowed to use",
      symbols,
      "named pieces",
      "No named piece other files can use was found in this file.",
    ),
  ];
}
