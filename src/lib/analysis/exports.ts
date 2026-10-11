import type { AnalyzedFile, ExportSig } from "./types";

type Files = Map<string, AnalyzedFile>;

export interface ExportSet {
  names: Set<string>;
  /** false when a re-export could not be followed (external or unresolved target) */
  complete: boolean;
}

/**
 * Every name a module exports, following `export * from "./x"` through the repository.
 * `default` is only exported when the module itself declares it (export * skips default).
 */
export function exportsOf(files: Files, path: string, seen = new Set<string>()): ExportSet {
  const file = files.get(path);
  if (!file || seen.has(path)) return { names: new Set(), complete: !!file };
  seen.add(path);
  const names = new Set<string>();
  let complete = true;
  for (const name of file.exports) {
    if (!name.startsWith("* from ")) names.add(name);
  }
  for (const ref of file.imports) {
    if (!ref.reexportAll) continue;
    if (ref.kind !== "internal" || !ref.target) {
      complete = false;
      continue;
    }
    const inner = exportsOf(files, ref.target, seen);
    if (!inner.complete) complete = false;
    for (const name of inner.names) if (name !== "default") names.add(name);
  }
  return { names, complete };
}

/**
 * Follows re-exports to the file that actually declares `name`, so a call to a function
 * imported through a barrel file is checked against the real signature.
 */
export function exportOrigin(
  files: Files,
  path: string,
  name: string,
  depth = 0,
): { path: string; sig: ExportSig } | null {
  const file = files.get(path);
  if (!file || depth > 6) return null;
  const sig = file.exportSigs[name];
  if (sig && sig.kind !== "reexport") return { path, sig };
  for (const ref of file.imports) {
    if (ref.kind !== "internal" || !ref.target) continue;
    const direct = sig && sig.kind === "reexport" && ref.names.includes(name);
    if (direct || (ref.reexportAll && name !== "default")) {
      const origin = exportOrigin(files, ref.target, name, depth + 1);
      if (origin) return origin;
    }
  }
  return null;
}
