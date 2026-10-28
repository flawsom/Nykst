import { buildContractCatalog } from "./federation";
import {
  buildAnalyzedFile,
  findCycles,
  parseAnySource,
  type FileBuildContext,
} from "./engine.server";
import { hydrateColumnContracts, parseSqlSchema } from "./sql";
import { loadParser, type ParsedSource, type RawImport } from "./parse.server";
import { polyglotLanguageOf, resolvePolyglotImport } from "./polyglot";
import { ImportResolver, isSourcePath, type AliasScope, type PackageManifest } from "./resolve";
import {
  ANALYSIS_VERSION,
  type AnalyzedFile,
  type DataResource,
  type ExternalService,
  type RepoAnalysis,
  type ResourceUse,
} from "./types";
import { extractMemoryRecords } from "../memory/evidence";

/**
 * Incremental graph patching.
 *
 * A webhook push knows which files changed, so the expensive part of a cold
 * compile (downloading and parsing every file) can be skipped. Only changed
 * sources are parsed, deleted paths are pruned, and the derived graph, SQL
 * bindings, service index and Tarjan SCCs are recomputed from the merged set.
 */

export interface ChangedFile {
  path: string;
  /** null deletes the path, exactly like a git push that removed it */
  content: string | null;
}

function normalized(path: string) {
  return path.replace(/^\.?\//, "");
}

function isOpenApiPath(path: string) {
  return /(^|\/)(openapi|swagger)[^/]*\.(json|ya?ml)$/i.test(path);
}

function isContractPath(path: string) {
  return isOpenApiPath(path) || path.endsWith(".proto");
}

function isMemoryPath(path: string) {
  return (
    path.endsWith(".sql") ||
    /(^|\/)(docs?|adr|adrs|decisions)\/.*\.(md|mmd)$/i.test(path) ||
    /(^|\/)(README|ARCHITECTURE|DECISIONS)\.md$/i.test(path)
  );
}

/** Receivers that call `.from("x")` but are never a database client. */
const NON_DB_RECEIVER =
  /^(Array|Buffer|Uint8Array|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|Float32Array|Float64Array|Object|Set|Map|Promise|String|Readable|Observable|Blob|File|Response|Headers|Iterator|rxjs|z|Rx)$/;

export async function patchRepositoryAnalysis(
  existing: RepoAnalysis,
  changedFiles: ChangedFile[],
): Promise<RepoAnalysis> {
  await loadParser();
  return patchLoaded(existing, changedFiles);
}

/** Synchronous form, used by tests and by callers that already loaded the parser. */
export function patchLoaded(existing: RepoAnalysis, changedFiles: ChangedFile[]): RepoAnalysis {
  const started = Date.now();
  const changes = new Map<string, string | null>();
  for (const change of changedFiles) changes.set(normalized(change.path), change.content);
  const removed = new Set<string>();
  const written = new Map<string, string>();
  for (const [path, content] of changes) {
    if (content === null) removed.add(path);
    else written.set(path, content);
  }

  const existingPaths = new Set(existing.files.map((file) => file.path));
  const pathSet = new Set(existingPaths);
  for (const [path, content] of written) {
    if (isSourcePath(path)) pathSet.add(path);
  }
  for (const path of removed) pathSet.delete(path);

  const manifests: PackageManifest[] =
    existing.resolver?.manifests ??
    existing.packages.map((pkg) => ({ dir: pkg.dir, name: pkg.name }));
  const aliases: AliasScope[] = existing.resolver?.aliases ?? [];
  const resolver = new ImportResolver(pathSet, manifests, aliases);
  const packageDirs = manifests.map((manifest) => manifest.dir).sort((a, b) => b.length - a.length);
  const packageDirOf = (path: string) =>
    packageDirs.find((dir) => dir === "" || path.startsWith(`${dir}/`)) ?? "";
  const context: FileBuildContext = {
    resolver,
    pathSet,
    goModule: existing.resolver?.goModule,
    packageDirOf,
  };

  const files = new Map<string, AnalyzedFile>();
  for (const file of existing.files) if (!changes.has(file.path)) files.set(file.path, file);

  const parsed = new Map<string, ParsedSource>();
  const limitations: string[] = [];
  for (const [path, content] of written) {
    if (!isSourcePath(path)) continue;
    try {
      const source = parseAnySource(path, content);
      parsed.set(path, source);
      files.set(path, buildAnalyzedFile(path, source, context).file);
    } catch (error) {
      const previous = existing.files.find((file) => file.path === path);
      if (previous) files.set(path, previous);
      limitations.push(
        `${path} could not be parsed during the patch (${error instanceof Error ? error.message : "unknown error"}).`,
      );
    }
  }

  // Only additions and deletions can change unchanged import resolution. Ordinary
  // content edits keep the same path set, so retain their stored resolved edges.
  const pathsChanged =
    [...pathSet].some((path) => !existingPaths.has(path)) ||
    [...existingPaths].some((path) => !pathSet.has(path));
  if (pathsChanged)
    for (const file of files.values()) {
      if (parsed.has(file.path)) continue;
      if (polyglotLanguageOf(file.path)) {
        const raw = new Map<string, RawImport>();
        for (const ref of file.imports)
          raw.set(`${ref.specifier}\u0000${ref.line}`, {
            specifier: ref.specifier,
            line: ref.line,
            typeOnly: ref.typeOnly,
            dynamic: ref.dynamic,
          });
        file.imports = [...raw.values()].flatMap((entry) =>
          resolvePolyglotImport(file.path, entry.specifier, pathSet, context.goModule).map(
            (resolved) => ({
              specifier: entry.specifier,
              line: entry.line,
              kind: resolved.kind,
              ...(resolved.target ? { target: resolved.target } : {}),
              typeOnly: entry.typeOnly,
              dynamic: entry.dynamic,
            }),
          ),
        );
        continue;
      }
      file.imports = file.imports.map((ref) => {
        const resolved = resolver.resolve(file.path, ref.specifier);
        const { target: _previous, ...rest } = ref;
        return {
          ...rest,
          kind: resolved.kind,
          ...(resolved.target ? { target: resolved.target } : {}),
        };
      });
    }

  const orderedFiles = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));

  /* ----------------------------- data resources ---------------------------- */
  const resourceMap = new Map<string, DataResource>();
  const addResource = (kind: DataResource["kind"], name: string, service: string) => {
    const id = `${kind}:${name}`;
    let entry = resourceMap.get(id);
    if (!entry) {
      entry = { id, kind, name, service, definedIn: [], uses: [] };
      resourceMap.set(id, entry);
    }
    return entry;
  };

  for (const resource of existing.resources) {
    const definedIn = resource.definedIn.filter((path) => !changes.has(path) && !removed.has(path));
    const keptEvents = (resource.sqlEvents ?? []).filter(
      (event) => !changes.has(event.path) && !removed.has(event.path),
    );
    if (!definedIn.length && !keptEvents.length) continue;
    const entry = addResource(resource.kind, resource.name, resource.service);
    entry.definedIn.push(...definedIn);
    if (keptEvents.length) entry.sqlEvents = keptEvents;
  }
  for (const [path, content] of written) {
    if (path.endsWith(".sql")) {
      const parsedSql = parseSqlSchema(path, content);
      for (const definition of parsedSql.resources) {
        const entry = addResource(definition.kind, definition.name, "supabase");
        if (!entry.definedIn.includes(path)) entry.definedIn.push(path);
      }
      for (const event of parsedSql.events) {
        const entry = addResource("table", event.table, "supabase");
        if (!entry.definedIn.includes(path)) entry.definedIn.push(path);
        entry.sqlEvents = entry.sqlEvents ? [...entry.sqlEvents, event] : [event];
      }
    }
    if (/(^|\/)schema\.prisma$/.test(path)) {
      for (const match of content.matchAll(/^\s*model\s+(\w+)\s*\{/gm))
        addResource(
          "model",
          match[1]!.charAt(0).toLowerCase() + match[1]!.slice(1),
          "prisma",
        ).definedIn.push(path);
    }
  }

  const usesSupabase =
    existing.services.some((service) => service.id === "supabase") ||
    orderedFiles.some((file) => file.services.includes("supabase"));
  for (const [path, source] of parsed) {
    const file = files.get(path);
    if (!file) continue;
    const uses: ResourceUse[] = [];
    for (const call of source.dataCalls) {
      if (call.method === "prisma") {
        uses.push({ id: addResource("model", call.name, "prisma").id, line: call.line });
        continue;
      }
      if (NON_DB_RECEIVER.test(call.receiver) || /^[A-Z]\w*$/.test(call.receiver)) continue;
      const looksLikeClient = /supabase|client|admin|\bdb\b|\bsb\b/i.test(call.receiver);
      const known = resourceMap.has(
        `${call.method === "rpc" ? "rpc" : "table"}:${call.name.toLowerCase()}`,
      );
      if (!usesSupabase || (!looksLikeClient && !known)) continue;
      const kind = call.method === "rpc" ? "rpc" : call.method === "storage" ? "bucket" : "table";
      uses.push({
        id: addResource(kind, kind === "bucket" ? call.name : call.name.toLowerCase(), "supabase")
          .id,
        line: call.line,
      });
    }
    file.resources = uses;
  }
  for (const file of orderedFiles)
    for (const use of file.resources)
      addResource(
        use.id.startsWith("rpc:")
          ? "rpc"
          : use.id.startsWith("bucket:")
            ? "bucket"
            : use.id.startsWith("model:")
              ? "model"
              : "table",
        use.id.slice(use.id.indexOf(":") + 1),
        resourceMap.get(use.id)?.service ?? "supabase",
      ).uses.push({ path: file.path, line: use.line });

  hydrateColumnContracts([...resourceMap.values()], orderedFiles);

  const resources = [...resourceMap.values()]
    .filter((resource) => resource.definedIn.length || resource.uses.length)
    .sort((a, b) => b.uses.length - a.uses.length || a.name.localeCompare(b.name));

  /* -------------------------------- services ------------------------------- */
  const serviceMap = new Map<string, ExternalService>();
  for (const service of existing.services) {
    serviceMap.set(service.id, {
      ...service,
      packages: [...service.packages],
      envVars: [...service.envVars],
      files: service.files.filter((path) => !changes.has(path) && !removed.has(path)),
      evidence: service.evidence.filter(
        (item) => !changes.has(item.path) && !removed.has(item.path),
      ),
    });
  }
  for (const file of orderedFiles) {
    for (const id of file.services) {
      let service = serviceMap.get(id);
      if (!service) {
        const known = existing.services.find((item) => item.id === id);
        service = {
          id,
          name: known?.name ?? id,
          category: known?.category ?? "api",
          packages: [],
          envVars: [],
          files: [],
          evidence: [],
        };
        serviceMap.set(id, service);
      }
      if (!service.files.includes(file.path)) service.files.push(file.path);
      if (changes.has(file.path) && file.endpoints?.length)
        service.evidence.push({
          path: file.path,
          reason: "patched source still uses this service",
        });
    }
  }
  const services = [...serviceMap.values()]
    .filter((service) => service.files.length)
    .sort((a, b) => b.files.length - a.files.length || a.id.localeCompare(b.id));

  /* --------------------------- env vars and cycles ------------------------- */
  const envIndex = new Map<string, Set<string>>();
  for (const file of orderedFiles)
    for (const name of file.envVars) {
      const names = envIndex.get(name) ?? new Set<string>();
      names.add(file.path);
      envIndex.set(name, names);
    }

  const cycles = findCycles(orderedFiles);

  /* ------------------------------ contracts -------------------------------- */
  const contractSources = [...written.entries()]
    .filter(([path]) => isContractPath(path))
    .map(([path, text]) => ({ path, text }));
  const freshContracts = buildContractCatalog(contractSources);
  const previousOpenApi = (existing.contracts?.openapi ?? []).filter(
    (contract) => !changes.has(contract.source),
  );
  const previousGrpc = (existing.contracts?.grpc ?? []).filter(
    (service) => !changes.has(service.source),
  );
  const openapi = [...previousOpenApi, ...freshContracts.openapi].filter(
    (contract, index, all) => all.findIndex((item) => item.source === contract.source) === index,
  );
  const grpc = [...previousGrpc, ...freshContracts.grpc].filter(
    (service, index, all) => all.findIndex((item) => item.source === service.source) === index,
  );

  /* -------------------------------- memory --------------------------------- */
  const freshMemory = extractMemoryRecords(
    [...written.entries()]
      .filter(([path]) => isMemoryPath(path))
      .map(([path, text]) => ({ path, text })),
  );
  const previousMemory = (existing.memory ?? []).filter(
    (record) => !record.citations.some((citation) => changes.has(citation.path)),
  );
  const memory = [...previousMemory, ...freshMemory].filter(
    (record, index, all) => all.findIndex((item) => item.id === record.id) === index,
  );

  /* --------------------------------- stats --------------------------------- */
  const externalPackages = new Set<string>();
  let unresolved = 0;
  let internalEdges = 0;
  let loc = 0;
  for (const file of orderedFiles) {
    loc += file.loc;
    for (const ref of file.imports) {
      if (ref.kind === "internal") internalEdges += 1;
      if (ref.kind === "unresolved") unresolved += 1;
      if (ref.kind === "external" && ref.target) externalPackages.add(ref.target);
    }
  }
  const addedSources = [...written.keys()].filter(
    (path) => isSourcePath(path) && !existingPaths.has(path),
  ).length;
  const removedSources = [...removed].filter((path) => existingPaths.has(path)).length;

  limitations.push(
    `Incremental patch reused ${existing.files.length} stored files and re-parsed ${parsed.size}; unchanged evidence is retained verbatim.`,
  );

  return {
    version: ANALYSIS_VERSION,
    generatedAt: new Date().toISOString(),
    method: "typescript-ast",
    ref: existing.ref,
    packages: existing.packages,
    files: orderedFiles,
    services,
    resources,
    envVars: [...envIndex.entries()]
      .map(([name, set]) => ({ name, files: [...set].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    cycles,
    ...(existing.resolver ? { resolver: existing.resolver } : {}),
    ...(openapi.length || grpc.length ? { contracts: { openapi, grpc } } : {}),
    ...(memory.length ? { memory } : {}),
    stats: {
      treeFiles: Math.max(0, existing.stats.treeFiles + addedSources - removedSources),
      sourceFiles: orderedFiles.length,
      analyzedFiles: orderedFiles.length,
      internalEdges,
      externalPackages: externalPackages.size,
      unresolvedImports: unresolved,
      skippedFiles: existing.stats.skippedFiles,
      loc,
      durationMs: Date.now() - started,
    },
    limitations,
  };
}
