import {
  catalogEntry,
  serviceForEnv,
  serviceForFile,
  serviceForHost,
  serviceForPackage,
} from "./catalog";
import { dataCallTargets } from "./data-calls";
import { findCycles } from "./cycles";
import { exportOrigin } from "./exports";
import { loadParser, parseJsonc, parseSource, type ParsedSource } from "./parse.server";
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
  type CallSite,
  type DataResource,
  type ExternalService,
  type FileRole,
  type ImportRef,
  type PackageDeps,
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

/** Imported names with the line of each one, kept only when some are on another line. */
function namesOf(
  bindings: { imported: string; line?: number | undefined }[],
  statementLine: number,
) {
  const first = new Map<string, number>();
  for (const binding of bindings)
    if (!first.has(binding.imported)) first.set(binding.imported, binding.line ?? statementLine);
  const names = [...first.keys()];
  const lines = [...first.values()];
  return lines.some((line) => line !== statementLine) ? { names, nameLines: lines } : { names };
}

export interface ServiceHit {
  id: string;
  reason: string;
  line?: number;
  /** package name that proved the service */
  pkg?: string;
  /** environment variable that proved the service */
  env?: string;
}

export interface DescribedFile {
  file: AnalyzedFile;
  hits: ServiceHit[];
  externalPackages: string[];
  unresolved: number;
}

/**
 * Turns one parsed source file into its analysis record: resolved imports, call sites of
 * imported functions, module-scope env reads and the external services it touches. Shared by
 * the whole-repository analysis and by the checker for generated code.
 */
export function describeFile(
  path: string,
  source: ParsedSource,
  resolver: ImportResolver,
  packageDir: string,
): DescribedFile {
  const hits: ServiceHit[] = [];
  const externalPackages: string[] = [];
  const serviceIds = new Set<string>();
  let unresolved = 0;
  const importedFunction = new Map<string, { target: string; imported: string }>();
  const namespaceTarget = new Map<string, string>();

  const imports: ImportRef[] = source.imports.map((raw) => {
    const resolved = resolver.resolve(path, raw.specifier);
    if (resolved.kind === "unresolved") unresolved += 1;
    if (resolved.kind === "external" && resolved.target) {
      externalPackages.push(resolved.target);
      const id = serviceForPackage(resolved.target);
      if (id) {
        serviceIds.add(id);
        hits.push({
          id,
          reason: `imports "${raw.specifier}"`,
          line: raw.line,
          pkg: resolved.target,
        });
      }
    }
    if (resolved.kind === "internal" && resolved.target && !raw.typeOnly)
      for (const binding of raw.bindings) {
        if (binding.imported === "*") {
          if (binding.local !== "*") namespaceTarget.set(binding.local, resolved.target);
        } else
          importedFunction.set(binding.local, {
            target: resolved.target,
            imported: binding.imported,
          });
      }
    return {
      specifier: raw.specifier,
      line: raw.line,
      kind: resolved.kind,
      ...(resolved.target ? { target: resolved.target } : {}),
      typeOnly: raw.typeOnly,
      dynamic: raw.dynamic,
      ...namesOf(raw.bindings, raw.line),
      ...(raw.reexportAll ? { reexportAll: true } : {}),
    };
  });

  for (const url of source.urls) {
    const id = serviceForHost(url.host);
    if (!id) continue;
    serviceIds.add(id);
    hits.push({ id, reason: `calls https://${url.host}`, line: url.line });
  }
  for (const env of source.envVars) {
    const id = serviceForEnv(env.name);
    if (!id) continue;
    serviceIds.add(id);
    hits.push({ id, reason: `reads ${env.name}`, line: env.line, env: env.name });
  }

  const calls: CallSite[] = [];
  for (const call of source.calls) {
    const base = { args: call.args, ...(call.spread ? { spread: true } : {}), line: call.line };
    if (call.member) {
      const target = namespaceTarget.get(call.local);
      if (target) calls.push({ target, name: call.member, ...base });
    } else {
      const hit = importedFunction.get(call.local);
      if (hit) calls.push({ target: hit.target, name: hit.imported, ...base });
    }
  }

  const moduleScopeEnv = [
    ...new Map(
      source.envVars
        .filter((env) => env.moduleScope)
        .map((env) => [`${env.name}:${env.line}`, { name: env.name, line: env.line }] as const),
    ).values(),
  ].slice(0, 30);

  const file: AnalyzedFile = {
    path,
    language: languageOf(path),
    loc: source.loc,
    packageDir,
    role: roleOf(path, source),
    imports,
    exports: source.exports.slice(0, 100),
    exportSigs: Object.fromEntries(Object.entries(source.exportSigs).slice(0, 100)),
    functions: [...new Set(source.functions)].slice(0, 100),
    classes: [...new Set(source.classes)].slice(0, 50),
    envVars: [...new Set(source.envVars.map((env) => env.name))],
    moduleScopeEnv,
    calls,
    services: [...serviceIds],
    resources: [],
  };
  return { file, hits, externalPackages, unresolved };
}

export interface AnalyzeInput {
  ref: string;
  /** every file path in the repository tree */
  paths: string[];
  /** contents for files selected with wantsContent() */
  contents: Map<string, string>;
  skipped?: number;
}

export async function analyzeRepository(input: AnalyzeInput): Promise<RepoAnalysis> {
  await loadParser();
  return analyzeLoaded(input);
}

function analyzeLoaded({ ref, paths, contents, skipped = 0 }: AnalyzeInput): RepoAnalysis {
  const started = Date.now();
  const pathSet = new Set(paths);
  const limitations: string[] = [];

  const manifests: PackageManifest[] = [];
  const packageDeps: PackageDeps[] = [];
  const configs = new Map<string, Record<string, unknown>>();
  const sqlDefinitions: ReturnType<typeof sqlResources> = [];
  const prismaModels: { name: string; path: string }[] = [];
  for (const [path, text] of contents) {
    if (/(^|\/)package\.json$/.test(path)) {
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        const deps = new Set<string>();
        for (const field of [
          "dependencies",
          "devDependencies",
          "peerDependencies",
          "optionalDependencies",
        ]) {
          const group = json[field];
          if (group && typeof group === "object")
            for (const name of Object.keys(group)) deps.add(name);
        }
        packageDeps.push({
          dir: dirname(path),
          ...(typeof json["name"] === "string" ? { name: json["name"] } : {}),
          deps: [...deps].sort(),
        });
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

  const scopes = aliasScopes(configs);
  const resolver = new ImportResolver(pathSet, manifests, scopes);
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
    const described = describeFile(path, source, resolver, packageDirOf(path));
    unresolved += described.unresolved;
    for (const pkg of described.externalPackages) externalPackages.add(pkg);
    for (const hit of described.hits) {
      const entry = service(hit.id);
      if (hit.pkg && !entry.packages.includes(hit.pkg)) entry.packages.push(hit.pkg);
      if (hit.env && !entry.envVars.includes(hit.env)) entry.envVars.push(hit.env);
      addEvidence(hit.id, path, hit.reason, hit.line);
    }
    for (const env of source.envVars) {
      const names = envIndex.get(env.name) ?? new Set<string>();
      names.add(path);
      envIndex.set(env.name, names);
    }
    files.push(described.file);
  }

  // Keep only call sites of functions whose real signature is known, retargeted to the file
  // that declares the function (calls through barrel files are followed).
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  for (const file of files) {
    const kept: CallSite[] = [];
    for (const call of file.calls) {
      const origin = exportOrigin(filesByPath, call.target, call.name);
      if (origin?.sig.kind === "function") kept.push({ ...call, target: origin.path });
      if (kept.length >= 200) break;
    }
    file.calls = kept;
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
    const uses: ResourceUse[] = dataCallTargets(source.dataCalls, usesSupabase, (kind, name) =>
      resources.has(`${kind}:${name}`),
    ).map((target) => ({
      id: resource(target.kind, target.name, target.owner).id,
      line: target.line,
    }));
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
  const cycles = findCycles(adjacency);

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
    packageDeps,
    resolver: {
      manifests,
      aliases: scopes,
    },
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
