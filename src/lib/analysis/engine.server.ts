import {
  catalogEntry,
  serviceForEnv,
  serviceForFile,
  serviceForHost,
  serviceForPackage,
} from "./catalog";
import { parseJsonc, parseSource, type ParsedSource } from "./parse.server";
import {
  dirname,
  ImportResolver,
  isSourcePath,
  joinPath,
  type AliasScope,
  type PackageManifest,
} from "./resolve";
import {
  ANALYSIS_VERSION,
  type AnalyzedFile,
  type DataResource,
  type ExternalService,
  type FileRole,
  type RepoAnalysis,
  type ResourceUse,
} from "./types";

export const MAX_SOURCE_BYTES = 400_000;

/** Which files the engine needs the contents of, besides the full path list. */
export function wantsContent(path: string, size: number) {
  if (size > MAX_SOURCE_BYTES) return false;
  if (isSourcePath(path)) return true;
  if (/(^|\/)package\.json$/.test(path) && !path.includes("node_modules/")) return true;
  if (/(^|\/)[jt]sconfig[^/]*\.json$/.test(path) && !path.includes("node_modules/")) return true;
  if (/(^|\/)migrations\/[^/]+\.sql$/.test(path)) return true;
  if (/(^|\/)schema\.prisma$/.test(path)) return true;
  return false;
}

function languageOf(path: string): AnalyzedFile["language"] {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".jsx")) return "jsx";
  if (/\.[mc]?ts$/.test(path)) return "ts";
  return "js";
}

function roleOf(path: string, parsed: ParsedSource): FileRole {
  const name = path.split("/").pop() ?? path;
  if (/\.gen\.[jt]sx?$|(^|\/)generated\//.test(path)) return "generated";
  // TanStack/Remix flat routes such as routes/api.ai.test.ts are endpoints, not tests.
  if (/(^|\/)routes\/api\./.test(path)) return "api";
  if (
    /\.(test|spec|e2e)\.[cm]?[jt]sx?$/.test(name) ||
    /(^|\/)(__tests__|tests?|e2e|cypress|playwright)\//.test(path)
  )
    return "test";
  if (/(^|\/)scripts?\//.test(path)) return "script";
  if (/^[^/]*\.config\.[cm]?[jt]s$|(^|\/)[^/]+\.config\.[cm]?[jt]s$/.test(path)) return "config";
  if (
    /(^|\/)(pages\/api|app\/api)\/|(^|\/)routes\/api[./]|(^|\/)api\/|(^|\/)route\.[jt]s$/.test(path)
  )
    return "api";
  if (/(^|\/)(routes|pages)\/|(^|\/)app\/.*(page|layout)\.[jt]sx?$/.test(path)) return "route";
  if (/\.server\.[jt]sx?$|(^|\/)server\//.test(path)) return "server";
  if (/^use[A-Z]/.test(name) || /(^|\/)hooks\//.test(path)) return "hook";
  if (/(^|\/)types?\//.test(path) || /(^|\/)types\.[jt]s$/.test(path)) return "types";
  if (
    /\.[jt]sx$/.test(path) ||
    (/(^|\/)components?\//.test(path) && parsed.exports.some((e) => /^[A-Z]/.test(e)))
  )
    return "component";
  return "lib";
}

function aliasScopes(configs: Map<string, Record<string, unknown>>): AliasScope[] {
  const resolveExtends = (path: string, depth = 0): Record<string, unknown> => {
    const config = configs.get(path) ?? {};
    const extendsValue = config["extends"];
    const parents = (Array.isArray(extendsValue) ? extendsValue : [extendsValue]).filter(
      (value): value is string => typeof value === "string" && value.startsWith("."),
    );
    let compilerOptions: Record<string, unknown> = {};
    let baseDir = dirname(path);
    for (const parent of parents) {
      if (depth > 4) break;
      let parentPath = joinPath(dirname(path), parent);
      if (!parentPath.endsWith(".json")) parentPath += ".json";
      const inherited = resolveExtends(parentPath, depth + 1);
      compilerOptions = {
        ...compilerOptions,
        ...((inherited["compilerOptions"] as Record<string, unknown>) ?? {}),
      };
      if (inherited["__baseDir"] !== undefined) baseDir = String(inherited["__baseDir"]);
    }
    const own = (config["compilerOptions"] as Record<string, unknown>) ?? {};
    if (own["paths"] || own["baseUrl"]) baseDir = dirname(path);
    return { compilerOptions: { ...compilerOptions, ...own }, __baseDir: baseDir };
  };

  const byDir = new Map<string, AliasScope>();
  for (const path of configs.keys()) {
    const resolved = resolveExtends(path);
    const options = resolved["compilerOptions"] as Record<string, unknown>;
    const paths = options["paths"] as Record<string, unknown> | undefined;
    const configDir = String(resolved["__baseDir"] ?? dirname(path));
    const baseUrl =
      typeof options["baseUrl"] === "string" ? joinPath(configDir, options["baseUrl"]) : configDir;
    const dir = dirname(path);
    const scope = byDir.get(dir) ?? { dir, aliases: [] };
    for (const [pattern, targets] of Object.entries(paths ?? {})) {
      if (!Array.isArray(targets)) continue;
      scope.aliases.push({
        pattern,
        targets: targets
          .filter((t): t is string => typeof t === "string")
          .map((t) => joinPath(baseUrl, t)),
      });
    }
    if (typeof options["baseUrl"] === "string")
      scope.aliases.push({ pattern: "*", targets: [`${baseUrl}/*`] });
    byDir.set(dir, scope);
  }
  return [...byDir.values()].map((scope) => ({
    ...scope,
    // Exact and longer patterns first, the catch-all baseUrl mapping last.
    aliases: scope.aliases.sort((a, b) =>
      a.pattern === "*" ? 1 : b.pattern === "*" ? -1 : b.pattern.length - a.pattern.length,
    ),
  }));
}

function sqlResources(path: string, sql: string) {
  const found: { kind: "table" | "rpc"; name: string }[] = [];
  const clean = sql.replace(/--.*$/gm, "");
  for (const match of clean.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi,
  ))
    found.push({ kind: "table", name: match[1]!.toLowerCase() });
  for (const match of clean.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi,
  ))
    found.push({ kind: "rpc", name: match[1]!.toLowerCase() });
  return found.map((item) => ({ ...item, path }));
}

/** Receivers that call `.from("x")` but are never a database client. */
const NON_DB_RECEIVER =
  /^(Array|Buffer|Uint8Array|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|Float32Array|Float64Array|Object|Set|Map|Promise|String|Readable|Observable|Blob|File|Response|Headers|Iterator|rxjs|z|Rx)$/;

export interface AnalyzeInput {
  ref: string;
  /** every file path in the repository tree */
  paths: string[];
  /** contents for files selected with wantsContent() */
  contents: Map<string, string>;
  skipped?: number;
}

export function analyzeRepository({
  ref,
  paths,
  contents,
  skipped = 0,
}: AnalyzeInput): RepoAnalysis {
  const started = Date.now();
  const pathSet = new Set(paths);
  const limitations: string[] = [];

  const manifests: PackageManifest[] = [];
  const configs = new Map<string, Record<string, unknown>>();
  const sqlDefinitions: ReturnType<typeof sqlResources> = [];
  const prismaModels: { name: string; path: string }[] = [];
  for (const [path, text] of contents) {
    if (/(^|\/)package\.json$/.test(path)) {
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        manifests.push({
          dir: dirname(path),
          ...(typeof json["name"] === "string" ? { name: json["name"] } : {}),
          ...(typeof json["main"] === "string" ? { main: json["main"] } : {}),
          ...(typeof json["module"] === "string" ? { module: json["module"] } : {}),
          ...(typeof json["types"] === "string" ? { types: json["types"] } : {}),
          ...(typeof json["source"] === "string" ? { source: json["source"] } : {}),
          ...(json["exports"] !== undefined ? { exports: json["exports"] } : {}),
        });
      } catch {
        limitations.push(`${path} is not valid JSON and was ignored.`);
      }
    } else if (/[jt]sconfig[^/]*\.json$/.test(path)) {
      const config = parseJsonc(text);
      if (config) configs.set(path, config);
      else limitations.push(`${path} could not be parsed; its path aliases were ignored.`);
    } else if (path.endsWith(".sql")) {
      sqlDefinitions.push(...sqlResources(path, text));
    } else if (path.endsWith("schema.prisma")) {
      for (const match of text.matchAll(/^\s*model\s+(\w+)\s*\{/gm))
        prismaModels.push({ name: match[1]!, path });
    }
  }

  const resolver = new ImportResolver(pathSet, manifests, aliasScopes(configs));
  const packageDirs = manifests.map((m) => m.dir).sort((a, b) => b.length - a.length);
  const packageDirOf = (path: string) =>
    packageDirs.find((dir) => dir === "" || path.startsWith(`${dir}/`)) ?? "";

  const sourcePaths = [...contents.keys()].filter(isSourcePath).sort();
  const parsed = new Map<string, ParsedSource>();
  for (const path of sourcePaths) {
    try {
      parsed.set(path, parseSource(path, contents.get(path)!));
    } catch (error) {
      limitations.push(
        `${path} could not be parsed (${error instanceof Error ? error.message : "unknown error"}).`,
      );
    }
  }

  const services = new Map<string, ExternalService>();
  const service = (id: string) => {
    let entry = services.get(id);
    if (!entry) {
      const catalog = catalogEntry(id)!;
      entry = {
        id,
        name: catalog.name,
        category: catalog.category,
        packages: [],
        envVars: [],
        files: [],
        evidence: [],
      };
      services.set(id, entry);
    }
    return entry;
  };
  const addEvidence = (id: string, path: string, reason: string, line?: number) => {
    const entry = service(id);
    if (!entry.files.includes(path)) entry.files.push(path);
    if (entry.evidence.length < 200)
      entry.evidence.push({ path, reason, ...(line ? { line } : {}) });
  };

  const files: AnalyzedFile[] = [];
  const envIndex = new Map<string, Set<string>>();
  const externalPackages = new Set<string>();
  let unresolved = 0;

  for (const path of sourcePaths) {
    const source = parsed.get(path);
    if (!source) continue;
    const fileServices = new Set<string>();
    const imports = source.imports.map((raw) => {
      const resolved = resolver.resolve(path, raw.specifier);
      if (resolved.kind === "unresolved") unresolved += 1;
      if (resolved.kind === "external" && resolved.target) {
        externalPackages.add(resolved.target);
        const id = serviceForPackage(resolved.target);
        if (id) {
          fileServices.add(id);
          const entry = service(id);
          if (!entry.packages.includes(resolved.target)) entry.packages.push(resolved.target);
          addEvidence(id, path, `imports "${raw.specifier}"`, raw.line);
        }
      }
      return {
        specifier: raw.specifier,
        line: raw.line,
        kind: resolved.kind,
        ...(resolved.target ? { target: resolved.target } : {}),
        typeOnly: raw.typeOnly,
        dynamic: raw.dynamic,
      };
    });
    for (const url of source.urls) {
      const id = serviceForHost(url.host);
      if (!id) continue;
      fileServices.add(id);
      addEvidence(id, path, `calls https://${url.host}`, url.line);
    }
    const envVars = [...new Set(source.envVars.map((env) => env.name))];
    for (const env of source.envVars) {
      const names = envIndex.get(env.name) ?? new Set<string>();
      names.add(path);
      envIndex.set(env.name, names);
      const id = serviceForEnv(env.name);
      if (!id) continue;
      fileServices.add(id);
      const entry = service(id);
      if (!entry.envVars.includes(env.name)) entry.envVars.push(env.name);
      addEvidence(id, path, `reads ${env.name}`, env.line);
    }
    files.push({
      path,
      language: languageOf(path),
      loc: source.loc,
      packageDir: packageDirOf(path),
      role: roleOf(path, source),
      imports,
      exports: source.exports.slice(0, 100),
      functions: [...new Set(source.functions)].slice(0, 100),
      classes: [...new Set(source.classes)].slice(0, 50),
      envVars,
      services: [...fileServices],
      resources: [],
    });
  }

  for (const path of paths) {
    const id = serviceForFile(path);
    if (id && !isSourcePath(path)) addEvidence(id, path, "configuration file present");
  }

  // Data resources: tables and functions defined in migrations, used through a client.
  const resources = new Map<string, DataResource>();
  const resource = (kind: DataResource["kind"], name: string, owner: string) => {
    const id = `${kind}:${name}`;
    let entry = resources.get(id);
    if (!entry) {
      entry = { id, kind, name, service: owner, definedIn: [], uses: [] };
      resources.set(id, entry);
    }
    return entry;
  };
  for (const definition of sqlDefinitions) {
    const entry = resource(
      definition.kind,
      definition.name,
      services.has("supabase") ? "supabase" : "postgres",
    );
    if (!entry.definedIn.includes(definition.path)) entry.definedIn.push(definition.path);
  }
  for (const model of prismaModels) {
    const entry = resource(
      "model",
      model.name.charAt(0).toLowerCase() + model.name.slice(1),
      "prisma",
    );
    if (!entry.definedIn.includes(model.path)) entry.definedIn.push(model.path);
  }
  const usesSupabase = services.has("supabase");
  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const [path, source] of parsed) {
    const file = byPath.get(path);
    if (!file) continue;
    const uses: ResourceUse[] = [];
    for (const call of source.dataCalls) {
      if (call.method === "prisma") {
        uses.push({ id: resource("model", call.name, "prisma").id, line: call.line });
        continue;
      }
      if (NON_DB_RECEIVER.test(call.receiver) || /^[A-Z]\w*$/.test(call.receiver)) continue;
      const looksLikeClient = /supabase|client|admin|\bdb\b|\bsb\b/i.test(call.receiver);
      const known = resources.has(
        `${call.method === "rpc" ? "rpc" : "table"}:${call.name.toLowerCase()}`,
      );
      if (!usesSupabase || (!looksLikeClient && !known)) continue;
      const kind = call.method === "rpc" ? "rpc" : call.method === "storage" ? "bucket" : "table";
      uses.push({
        id: resource(kind, kind === "bucket" ? call.name : call.name.toLowerCase(), "supabase").id,
        line: call.line,
      });
    }
    file.resources = uses;
    for (const use of uses) resources.get(use.id)!.uses.push({ path, line: use.line });
  }

  // Cycles between runtime (non type-only) imports, via Tarjan's strongly connected components.
  const adjacency = new Map<string, string[]>();
  for (const file of files)
    adjacency.set(
      file.path,
      file.imports
        .filter((i) => i.kind === "internal" && !i.typeOnly && i.target)
        .map((i) => i.target!),
    );
  const cycles: string[][] = [];
  {
    let index = 0;
    const indices = new Map<string, number>();
    const low = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const strongConnect = (start: string) => {
      // Iterative Tarjan to stay safe on deep import chains.
      const work: { node: string; next: number }[] = [{ node: start, next: 0 }];
      indices.set(start, index);
      low.set(start, index);
      index += 1;
      stack.push(start);
      onStack.add(start);
      while (work.length) {
        const frame = work[work.length - 1]!;
        const neighbours = adjacency.get(frame.node) ?? [];
        if (frame.next < neighbours.length) {
          const next = neighbours[frame.next++]!;
          if (!adjacency.has(next)) continue;
          if (!indices.has(next)) {
            indices.set(next, index);
            low.set(next, index);
            index += 1;
            stack.push(next);
            onStack.add(next);
            work.push({ node: next, next: 0 });
          } else if (onStack.has(next)) {
            low.set(frame.node, Math.min(low.get(frame.node)!, indices.get(next)!));
          }
          continue;
        }
        work.pop();
        const parent = work[work.length - 1];
        if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
        if (low.get(frame.node) === indices.get(frame.node)) {
          const component: string[] = [];
          let member: string | undefined;
          do {
            member = stack.pop()!;
            onStack.delete(member);
            component.push(member);
          } while (member !== frame.node);
          if (component.length > 1) cycles.push(component.sort());
        }
      }
    };
    for (const path of adjacency.keys()) if (!indices.has(path)) strongConnect(path);
  }

  const internalEdges = files.reduce(
    (sum, file) => sum + file.imports.filter((i) => i.kind === "internal").length,
    0,
  );
  if (unresolved)
    limitations.push(
      `${unresolved} import(s) could not be resolved to a file or package; they are listed per file.`,
    );
  if (skipped)
    limitations.push(
      `${skipped} source file(s) were skipped because they exceed ${Math.round(MAX_SOURCE_BYTES / 1000)} KB.`,
    );
  limitations.push(
    "Only JavaScript/TypeScript sources are analyzed; other languages appear in the tree without dependency edges.",
    "Imports built from runtime strings (e.g. import(variable)) and framework conventions such as file-based routing are not visible as edges.",
  );

  return {
    version: ANALYSIS_VERSION,
    generatedAt: new Date().toISOString(),
    method: "typescript-ast",
    ref,
    packages: resolver.workspacePackages,
    files,
    services: [...services.values()].sort((a, b) => b.files.length - a.files.length),
    resources: [...resources.values()].sort(
      (a, b) => b.uses.length - a.uses.length || a.name.localeCompare(b.name),
    ),
    envVars: [...envIndex.entries()]
      .map(([name, set]) => ({ name, files: [...set].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    cycles: cycles.sort((a, b) => b.length - a.length).slice(0, 25),
    stats: {
      treeFiles: paths.length,
      sourceFiles: paths.filter(isSourcePath).length,
      analyzedFiles: files.length,
      internalEdges,
      externalPackages: externalPackages.size,
      unresolvedImports: unresolved,
      skippedFiles: skipped,
      loc: files.reduce((sum, file) => sum + file.loc, 0),
      durationMs: Date.now() - started,
    },
    limitations,
  };
}
