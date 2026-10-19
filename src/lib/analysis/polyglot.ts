import type { FileRole, ImportKind } from "./types";
import type { ParsedSource, RawImport } from "./parse.server";

/**
 * Lightweight, deterministic adapters for Python, Go and Rust. They extract the
 * same structural facts the TypeScript parser produces so that imports from
 * these languages enter the same adjacency list, Tarjan pass and impact walk.
 *
 * These are static extractors, not a full language front end. Every edge has a
 * line and an honest resolution result; nothing is inferred from filenames when
 * more than one candidate would match.
 */

export type PolyglotLanguage = "py" | "go" | "rust";

const PYTHON_STDLIB = new Set([
  "abc",
  "argparse",
  "asyncio",
  "base64",
  "collections",
  "contextlib",
  "copy",
  "csv",
  "dataclasses",
  "datetime",
  "decimal",
  "enum",
  "functools",
  "glob",
  "hashlib",
  "hmac",
  "http",
  "importlib",
  "inspect",
  "io",
  "itertools",
  "json",
  "logging",
  "math",
  "os",
  "pathlib",
  "pickle",
  "queue",
  "random",
  "re",
  "shutil",
  "signal",
  "socket",
  "sqlite3",
  "ssl",
  "statistics",
  "string",
  "subprocess",
  "sys",
  "tempfile",
  "threading",
  "time",
  "traceback",
  "types",
  "typing",
  "unittest",
  "urllib",
  "uuid",
  "warnings",
  "weakref",
  "xml",
  "zipfile",
]);

const RUST_BUILTIN = new Set(["std", "core", "alloc", "crate", "self", "super"]);

const URL_PATTERN = /^https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/:?#]|$)/i;

export function polyglotLanguageOf(path: string): PolyglotLanguage | null {
  if (path.endsWith(".py")) return "py";
  if (path.endsWith(".go")) return "go";
  if (path.endsWith(".rs")) return "rust";
  return null;
}

function lineOf(content: string, index: number) {
  return content.slice(0, index).split("\n").length;
}

function addImport(
  imports: RawImport[],
  seen: Set<string>,
  specifier: string,
  line: number,
  dynamic = false,
) {
  if (!specifier) return;
  const key = `${specifier}|${line}`;
  if (seen.has(key)) return;
  seen.add(key);
  imports.push({ specifier, line, typeOnly: false, dynamic });
}

function collectUrls(content: string, urls: { host: string; line: number }[]) {
  for (const match of content.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/:?#]|$)/gi)) {
    const host = match[1];
    if (host) urls.push({ host: host.toLowerCase(), line: lineOf(content, match.index ?? 0) });
  }
}

function collectEndpoints(
  content: string,
  endpoints: { path: string; line: number; protocol: "http" | "grpc" }[],
) {
  const seen = new Set<string>();
  for (const match of content.matchAll(/(["'])(\/[A-Za-z0-9_\-./{}:$]*)\1/g)) {
    const path = match[2]!;
    if (path === "/" || path.length > 200 || /\.[a-z0-9]{2,5}$/i.test(path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    endpoints.push({ path, line: lineOf(content, match.index ?? 0), protocol: "http" });
  }
}

function pythonImports(content: string) {
  const imports: RawImport[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of content.split("\n").entries()) {
    const line = index + 1;
    const text = raw.replace(/#.*$/, "");
    const from = /^\s*from\s+([.\w]+)\s+import\s+([^;]+)/.exec(text);
    if (from) {
      const module = from[1]!;
      const names = from[2]!
        .split(",")
        .map((name) =>
          name
            .trim()
            .split(/\s+as\s+/)[0]!
            .trim(),
        )
        .filter(Boolean);
      if (/^\.+$/.test(module) && names.length)
        for (const name of names) addImport(imports, seen, `${module}${name}`, line);
      else addImport(imports, seen, module, line);
      continue;
    }
    const direct = /^\s*import\s+([^;]+)/.exec(text);
    if (direct)
      for (const part of direct[1]!.split(",")) {
        const specifier = part
          .trim()
          .split(/\s+as\s+/)[0]!
          .trim();
        if (specifier) addImport(imports, seen, specifier, line);
      }
    const dynamic = /import_module\(\s*["']([^"']+)["']/.exec(text);
    if (dynamic) addImport(imports, seen, dynamic[1]!, line, true);
  }
  return imports;
}

function pythonSource(path: string, content: string): ParsedSource {
  const lines = content.split("\n");
  const functions: string[] = [];
  const classes: string[] = [];
  const exports = new Set<string>();
  const envVars: { name: string; line: number }[] = [];
  const endpoints: { path: string; line: number; protocol: "http" | "grpc" }[] = [];

  for (const [index, raw] of lines.entries()) {
    const text = raw.replace(/#.*$/, "");
    if (!/^\s/.test(text)) {
      const fn = /^(?:async\s+)?def\s+([A-Za-z_]\w*)/.exec(text);
      if (fn) {
        functions.push(fn[1]!);
        if (!fn[1]!.startsWith("_")) exports.add(fn[1]!);
      }
      const cls = /^class\s+([A-Za-z_]\w*)/.exec(text);
      if (cls) {
        classes.push(cls[1]!);
        if (!cls[1]!.startsWith("_")) exports.add(cls[1]!);
      }
      const assignment = /^([A-Za-z_]\w*)\s*(?::[^=]+)?=/.exec(text);
      if (assignment && !fn && !cls) exports.add(assignment[1]!);
    }
    for (const match of text.matchAll(
      /(?:os\.getenv|os\.environ\.get|environ\.get)\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
    ))
      envVars.push({ name: match[1]!, line: index + 1 });
    for (const match of text.matchAll(/os\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g))
      envVars.push({ name: match[1]!, line: index + 1 });
  }

  const urls: { host: string; line: number }[] = [];
  collectUrls(content, urls);
  collectEndpoints(content, endpoints);
  return {
    imports: pythonImports(content),
    exports: [...exports],
    functions: [...new Set(functions)],
    classes: [...new Set(classes)],
    envVars,
    urls,
    dataCalls: [],
    endpoints,
    symbols: [],
    columnRefs: [],
    loc: lines.filter((line) => line.trim()).length,
  };
}

function goImports(content: string) {
  const imports: RawImport[] = [];
  const seen = new Set<string>();
  const lines = content.split("\n");
  let inBlock = false;
  for (const [index, raw] of lines.entries()) {
    const text = raw.replace(/\/\/.*$/, "").trim();
    if (/^import\s*\($/.test(text)) {
      inBlock = true;
      continue;
    }
    if (inBlock && text === ")") {
      inBlock = false;
      continue;
    }
    if (inBlock) {
      const match = /^(?:[\w.]+\s+)?["']([^"']+)["']/.exec(text);
      if (match) addImport(imports, seen, match[1]!, index + 1);
      continue;
    }
    const single = /^import\s+(?:[\w.]+\s+)?["']([^"']+)["']/.exec(text);
    if (single) addImport(imports, seen, single[1]!, index + 1);
  }
  return imports;
}

function goSource(path: string, content: string): ParsedSource {
  const lines = content.split("\n");
  const functions: string[] = [];
  const classes: string[] = [];
  const exports = new Set<string>();
  const envVars: { name: string; line: number }[] = [];
  const endpoints: { path: string; line: number; protocol: "http" | "grpc" }[] = [];

  for (const [index, raw] of lines.entries()) {
    const text = raw.replace(/\/\/.*$/, "");
    const fn = /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/.exec(text);
    if (fn) {
      functions.push(fn[1]!);
      if (/^[A-Z]/.test(fn[1]!)) exports.add(fn[1]!);
    }
    const type = /^type\s+([A-Za-z_]\w*)\s+(?:struct|interface|func|\[|map)/.exec(text);
    if (type) {
      classes.push(type[1]!);
      if (/^[A-Z]/.test(type[1]!)) exports.add(type[1]!);
    }
    for (const match of text.matchAll(/(?:os\.Getenv|os\.LookupEnv)\(\s*"([A-Z][A-Z0-9_]*)"/g))
      envVars.push({ name: match[1]!, line: index + 1 });
  }

  const urls: { host: string; line: number }[] = [];
  collectUrls(content, urls);
  collectEndpoints(content, endpoints);
  return {
    imports: goImports(content),
    exports: [...exports],
    functions: [...new Set(functions)],
    classes: [...new Set(classes)],
    envVars,
    urls,
    dataCalls: [],
    endpoints,
    symbols: [],
    columnRefs: [],
    loc: lines.filter((line) => line.trim()).length,
  };
}

function rustImports(content: string) {
  const imports: RawImport[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of content.split("\n").entries()) {
    const text = raw.replace(/\/\/.*$/, "").trim();
    const use = /^(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);/.exec(text);
    if (use) {
      const path = use[1]!.replace(/\s+/g, "");
      const root = path.split("::")[0]!;
      addImport(
        imports,
        seen,
        root === "crate" || root === "self" || root === "super" ? path : root,
        index + 1,
      );
    }
    const mod = /^(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/.exec(text);
    if (mod) addImport(imports, seen, `mod:${mod[1]}`, index + 1);
    const external = /^extern\s+crate\s+([A-Za-z_]\w*)\s*;/.exec(text);
    if (external) addImport(imports, seen, external[1]!, index + 1);
  }
  return imports;
}

function rustSource(path: string, content: string): ParsedSource {
  const lines = content.split("\n");
  const functions: string[] = [];
  const classes: string[] = [];
  const exports = new Set<string>();
  const envVars: { name: string; line: number }[] = [];
  const endpoints: { path: string; line: number; protocol: "http" | "grpc" }[] = [];

  for (const [index, raw] of lines.entries()) {
    const text = raw.replace(/\/\/.*$/, "");
    const fn = /^(pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/.exec(text);
    if (fn) {
      functions.push(fn[2]!);
      if (fn[1]) exports.add(fn[2]!);
    }
    const item = /^(pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|union|type)\s+([A-Za-z_]\w*)/.exec(
      text,
    );
    if (item) {
      classes.push(item[2]!);
      if (item[1]) exports.add(item[2]!);
    }
    for (const match of text.matchAll(/env::var\(\s*"([A-Z][A-Z0-9_]*)"/g))
      envVars.push({ name: match[1]!, line: index + 1 });
    for (const match of text.matchAll(/env!\(\s*"([A-Z][A-Z0-9_]*)"/g))
      envVars.push({ name: match[1]!, line: index + 1 });
  }

  const urls: { host: string; line: number }[] = [];
  collectUrls(content, urls);
  collectEndpoints(content, endpoints);
  return {
    imports: rustImports(content),
    exports: [...exports],
    functions: [...new Set(functions)],
    classes: [...new Set(classes)],
    envVars,
    urls,
    dataCalls: [],
    endpoints,
    symbols: [],
    columnRefs: [],
    loc: lines.filter((line) => line.trim()).length,
  };
}

export function parsePolyglot(path: string, content: string): ParsedSource {
  if (path.endsWith(".py")) return pythonSource(path, content);
  if (path.endsWith(".go")) return goSource(path, content);
  return rustSource(path, content);
}

export interface PolyglotResolution {
  kind: ImportKind;
  target?: string;
}

function uniqueSuffix(paths: Set<string>, suffix: string): string | null {
  const matches = [...paths].filter(
    (candidate) => candidate === suffix || candidate.endsWith(`/${suffix}`),
  );
  return matches.length === 1 ? matches[0]! : null;
}

function dirname(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function pythonTarget(modules: string, paths: Set<string>) {
  if (!modules) return null;
  return (
    uniqueSuffix(paths, `${modules}.py`) ?? uniqueSuffix(paths, `${modules}/__init__.py`) ?? null
  );
}

function resolvePython(path: string, specifier: string, paths: Set<string>): PolyglotResolution[] {
  const dots = /^\.+/.exec(specifier)?.[0].length ?? 0;
  if (dots) {
    let base = dirname(path);
    for (let step = 1; step < dots; step += 1) base = dirname(base);
    const rest = specifier.slice(dots);
    const module = rest.replace(/\./g, "/");
    const direct = module ? `${base}/${module}` : base;
    const target = pythonTarget(direct, paths);
    if (target) return [{ kind: "internal", target }];
    if (module) return [{ kind: "unresolved", target: `${base}/${module}.py` }];
    return [{ kind: "unresolved" }];
  }
  const root = specifier.split(".")[0]!;
  if (PYTHON_STDLIB.has(root)) return [{ kind: "builtin", target: root }];
  const module = specifier.replace(/\./g, "/");
  const target = pythonTarget(module, paths);
  if (target) return [{ kind: "internal", target }];
  return [{ kind: "external", target: root }];
}

function resolveGo(
  path: string,
  specifier: string,
  paths: Set<string>,
  goModule: string | undefined,
): PolyglotResolution[] {
  if (!specifier.includes(".")) return [{ kind: "builtin", target: specifier.split("/")[0]! }];
  if (goModule) {
    const normalized = goModule.replace(/\/$/, "");
    if (specifier === normalized || specifier.startsWith(`${normalized}/`)) {
      const dir = specifier.slice(normalized.length).replace(/^\//, "");
      const targets = [...paths]
        .filter(
          (candidate) =>
            candidate.endsWith(".go") &&
            !candidate.endsWith("_test.go") &&
            (dir === "" ? true : candidate.startsWith(`${dir}/`)),
        )
        .sort();
      if (!targets.length) return [{ kind: "unresolved", target: `${dir}/*.go` }];
      return targets.map((target) => ({ kind: "internal" as const, target }));
    }
  }
  return [{ kind: "external", target: specifier }];
}

function rustModuleCandidates(base: string, module: string) {
  const joined = [base, module.replace(/::/g, "/")].filter(Boolean).join("/");
  return [`${joined}.rs`, `${joined}/mod.rs`];
}

function rustCrateRoot(path: string) {
  const marker = "/src/";
  const index = path.indexOf(marker);
  if (index !== -1) return path.slice(0, index + marker.length - 1);
  return path.startsWith("src/") ? "src" : dirname(path);
}

function resolveRust(path: string, specifier: string, paths: Set<string>): PolyglotResolution[] {
  if (specifier.startsWith("mod:")) {
    const name = specifier.slice(4);
    for (const candidate of rustModuleCandidates(dirname(path), name))
      if (paths.has(candidate)) return [{ kind: "internal", target: candidate }];
    return [{ kind: "unresolved", target: `${dirname(path)}/${name}.rs` }];
  }
  const segments = specifier.split("::").filter(Boolean);
  const root = segments[0]!;
  if (root === "crate") {
    const crateRoot = rustCrateRoot(path);
    for (let length = segments.length - 1; length >= 1; length -= 1) {
      const module = segments.slice(1, length + 1).join("::");
      for (const candidate of rustModuleCandidates(crateRoot, module))
        if (paths.has(candidate)) return [{ kind: "internal", target: candidate }];
    }
    return [{ kind: "unresolved", target: `${crateRoot}/${segments.slice(1).join("/")}.rs` }];
  }
  if (root === "self" || root === "super") {
    let base = dirname(path);
    let index = 1;
    if (root === "super") {
      base = dirname(base);
      index = 1;
    }
    for (let length = segments.length - 1; length >= index; length -= 1) {
      const module = segments.slice(index, length + 1).join("::");
      for (const candidate of rustModuleCandidates(base, module))
        if (paths.has(candidate)) return [{ kind: "internal", target: candidate }];
    }
    return [{ kind: "unresolved", target: base }];
  }
  if (RUST_BUILTIN.has(root)) return [{ kind: "builtin", target: root }];
  return [{ kind: "external", target: root }];
}

/** Resolves one raw polyglot specifier to zero or more repository targets. */
export function resolvePolyglotImport(
  path: string,
  specifier: string,
  paths: Set<string>,
  goModule?: string,
): PolyglotResolution[] {
  if (path.endsWith(".py")) return resolvePython(path, specifier, paths);
  if (path.endsWith(".go")) return resolveGo(path, specifier, paths, goModule);
  return resolveRust(path, specifier, paths);
}

export function polyglotRole(path: string): FileRole {
  const name = path.split("/").pop() ?? path;
  if (path.endsWith(".py")) {
    if (/(^|\/)(tests?|__tests__)\/|(^|\/)test_[^/]*\.py$|_test\.py$/.test(path)) return "test";
    if (/(^|\/)(manage|wsgi|asgi|main|app)\.py$/.test(path)) return "server";
    if (/(^|\/)routes?\//.test(path)) return "route";
    if (/(^|\/)(scripts?|tools?)\//.test(path)) return "script";
    if (/(^|\/)(types?|schemas?)\//.test(path)) return "types";
    return "lib";
  }
  if (path.endsWith(".go")) {
    if (name.endsWith("_test.go")) return "test";
    if (/(^|\/)cmd\//.test(path) || name === "main.go") return "server";
    if (/(^|\/)(internal\/)?(handlers?|api|routes?)\//.test(path)) return "api";
    if (/(^|\/)types?\//.test(path)) return "types";
    return "lib";
  }
  if (/(^|\/)(tests?)\/|(^|\/)test_[^/]*\.rs$/.test(path)) return "test";
  if (/(^|\/)main\.rs$|(^|\/)bin\//.test(path)) return "server";
  if (/(^|\/)(handlers?|api|routes?)\//.test(path)) return "api";
  return "lib";
}

export { URL_PATTERN };
