import type { AnalyzedFile, RepoAnalysis } from "./types";

/**
 * Resolves a symbol imported from a barrel file to the file that actually
 * declares it. Chains are followed transitively and bounded, so a cycle in the
 * re-export graph can never hang the analyzer.
 */
export interface ExportOrigin {
  /** repository path of the module that declares the symbol */
  path: string;
  /** the declared name in that module */
  name: string;
  /** true when every hop was a type-only re-export */
  typeOnly: boolean;
  /** barrel files traversed, closest to the importer first */
  via: string[];
}

const MAX_REEXPORT_DEPTH = 12;

const cache = new WeakMap<RepoAnalysis, Map<string, Map<string, ExportOrigin | null>>>();

function importsTarget(file: AnalyzedFile, specifier: string) {
  return file.imports.find((ref) => ref.specifier === specifier && ref.target)?.target;
}

function originFor(
  files: Map<string, AnalyzedFile>,
  path: string,
  name: string,
  visited: Set<string>,
  via: string[],
  typeOnly: boolean,
): ExportOrigin | null {
  if (visited.size >= MAX_REEXPORT_DEPTH) return null;
  const key = `${path}\u0000${name}`;
  if (visited.has(key)) return null;
  visited.add(key);
  const file = files.get(path);
  if (!file) return null;

  if (file.exports.includes(name)) {
    const declared = file.symbols?.find(
      (symbol) => symbol.name === name && symbol.kind !== "re-export",
    );
    // A named `export` without a local declaration is either a re-export or a
    // default assignment; only a declared symbol is a real origin.
    if (declared) return { path, name, typeOnly, via };
  }

  for (const reExport of file.reExports ?? []) {
    if (reExport.exportedName !== name) continue;
    if (reExport.importedName === "*") continue;
    const target = importsTarget(file, reExport.specifier);
    if (!target) continue;
    const resolved = originFor(
      files,
      target,
      reExport.importedName,
      visited,
      [...via, path],
      typeOnly || reExport.typeOnly,
    );
    if (resolved) return resolved;
  }

  for (const reExport of file.reExports ?? []) {
    if (reExport.exportedName !== "*") continue;
    const target = importsTarget(file, reExport.specifier);
    if (!target) continue;
    const resolved = originFor(
      files,
      target,
      name,
      visited,
      [...via, path],
      typeOnly || reExport.typeOnly,
    );
    if (resolved) return resolved;
  }

  return null;
}

/** Cached, deterministic origin lookup for one analysis snapshot. */
export function resolveExportOrigin(
  analysis: RepoAnalysis,
  path: string,
  name: string,
): ExportOrigin | null {
  let perAnalysis = cache.get(analysis);
  if (!perAnalysis) {
    perAnalysis = new Map();
    cache.set(analysis, perAnalysis);
  }
  let perFile = perAnalysis.get(path);
  if (!perFile) {
    perFile = new Map();
    perAnalysis.set(path, perFile);
  }
  if (perFile.has(name)) return perFile.get(name) ?? null;
  const files = new Map(analysis.files.map((file) => [file.path, file]));
  const resolved = originFor(files, path, name, new Set(), [], false);
  perFile.set(name, resolved);
  return resolved;
}
