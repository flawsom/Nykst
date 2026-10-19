import type {
  ContractCatalog,
  EndpointRef,
  OpenApiContract,
  OpenApiOperation,
  ProtoRpc,
  ProtoServiceContract,
  RepoAnalysis,
} from "./types";

/**
 * Cross-repository contract federation.
 *
 * Providers publish OpenAPI or gRPC contracts that are stored with their analysis.
 * Consumers are ordinary analyzed files that contain a literal route or method string.
 * Matching is deterministic and segment-based: no embeddings, no fuzzy scoring.
 */

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
const CONTRACT_EXTENSION = /\.(json|ya?ml)$/i;

function isOpenApiPath(path: string) {
  const name = path.split("/").pop() ?? path;
  return CONTRACT_EXTENSION.test(name) && /^(openapi|swagger)/i.test(name);
}

function isProtoPath(path: string) {
  return path.endsWith(".proto");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean);
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )
    return trimmed.slice(1, -1);
  return trimmed;
}

function stripComment(line: string) {
  let quote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#" && (index === 0 || /\s/.test(line[index - 1]!))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function schemaRef(value: unknown): string | undefined {
  const schema = asRecord(value);
  const ref = text(schema["$ref"]);
  if (!ref) return undefined;
  return ref.split("/").pop() || undefined;
}

function responseSchema(responses: unknown): string | undefined {
  const all = asRecord(responses);
  for (const key of ["200", "201", "202", "default", "2XX"]) {
    const response = asRecord(all[key]);
    const content = asRecord(response["content"]);
    for (const media of Object.values(content)) {
      const schema = schemaRef(asRecord(media)["schema"]);
      if (schema) return schema;
    }
    const classic = schemaRef(response["schema"]);
    if (classic) return classic;
  }
  return undefined;
}

function requestSchema(body: unknown): string | undefined {
  const request = asRecord(body);
  const content = asRecord(request["content"]);
  for (const media of Object.values(content)) {
    const schema = schemaRef(asRecord(media)["schema"]);
    if (schema) return schema;
  }
  return schemaRef(request["schema"]);
}

function operationsFromPaths(paths: unknown, source: string): OpenApiOperation[] {
  const operations: OpenApiOperation[] = [];
  for (const [route, rawItem] of Object.entries(asRecord(paths))) {
    if (!route.startsWith("/")) continue;
    const item = asRecord(rawItem);
    for (const [method, rawOperation] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const operation = asRecord(rawOperation);
      const operationId = text(operation["operationId"]) || undefined;
      operations.push({
        id: `${method.toUpperCase()} ${route}`,
        source,
        path: route,
        method: method.toLowerCase(),
        ...(operationId ? { operationId } : {}),
        ...(text(operation["summary"]) ? { summary: text(operation["summary"]) } : {}),
        tags: stringArray(operation["tags"]),
        ...(requestSchema(operation["requestBody"])
          ? { requestSchema: requestSchema(operation["requestBody"])! }
          : {}),
        ...(responseSchema(operation["responses"])
          ? { responseSchema: responseSchema(operation["responses"])! }
          : {}),
      });
    }
  }
  return operations.sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

function contractFromObject(source: string, document: unknown): OpenApiContract | null {
  const root = asRecord(document);
  if (!root["paths"]) return null;
  const info = asRecord(root["info"]);
  const servers = Array.isArray(root["servers"])
    ? root["servers"]
        .map((server) => (typeof server === "string" ? server : text(asRecord(server)["url"])))
        .filter(Boolean)
    : [];
  return {
    source,
    title: text(info["title"]) || source,
    version: text(info["version"]) || text(root["openapi"]) || text(root["swagger"]),
    servers,
    operations: operationsFromPaths(root["paths"], source),
  };
}

interface YamlLine {
  indent: number;
  text: string;
  line: number;
}

function yamlLines(text: string): YamlLine[] {
  const out: YamlLine[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const withoutComment = stripComment(raw).replace(/\s+$/, "");
    if (!withoutComment.trim()) return;
    const indent = withoutComment.length - withoutComment.trimStart().length;
    out.push({ indent, text: withoutComment.trim(), line: index + 1 });
  });
  return out;
}

function flowList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => unquote(item))
    .filter(Boolean);
}

/** A pragmatic YAML subset for OpenAPI files: info, servers, paths and operations. */
function contractFromYaml(source: string, content: string): OpenApiContract | null {
  const lines = yamlLines(content);
  const pathsIndex = lines.findIndex((line) => line.text === "paths:");
  const pathsIndent = pathsIndex === -1 ? -1 : lines[pathsIndex]!.indent;

  // title and version: first occurrence under info, then the first occurrence anywhere.
  let title = "";
  let version = "";
  const infoIndex = lines.findIndex((line) => line.text === "info:");
  if (infoIndex !== -1) {
    const infoIndent = lines[infoIndex]!.indent;
    for (let index = infoIndex + 1; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (line.indent <= infoIndent) break;
      const match = /^(title|version):\s*(.+)$/.exec(line.text);
      if (!match) continue;
      if (match[1] === "title" && !title) title = unquote(match[2]!);
      if (match[1] === "version" && !version) version = unquote(match[2]!);
    }
  }
  if (!title) {
    const first = lines.find((line) => /^title:\s*/.test(line.text));
    if (first) title = unquote(first.text.replace(/^title:\s*/, ""));
  }
  if (!version) {
    const first = lines.find((line) => /^version:\s*/.test(line.text));
    if (first) version = unquote(first.text.replace(/^version:\s*/, ""));
  }
  const openapi = lines.find((line) => /^(openapi|swagger):\s*/.test(line.text));
  if (openapi) version = version || unquote(openapi.text.replace(/^(openapi|swagger):\s*/, ""));

  const servers: string[] = [];
  for (const line of lines) {
    const url = /^-\s*url:\s*(.+)$/.exec(line.text) ?? /^-\s*(https?:\/\/\S+)$/.exec(line.text);
    if (url) servers.push(unquote(url[1]!));
    const flow = /^(servers|urls):\s*(\[.*\])$/.exec(line.text);
    if (flow) servers.push(...flowList(flow[2]!).map(unquote));
  }

  const operations: OpenApiOperation[] = [];
  if (pathsIndex !== -1) {
    let current: {
      route: string;
      pathIndent: number;
      method?: string;
      methodIndent: number;
      operation: OpenApiOperation;
    } | null = null;

    const flush = () => {
      if (current?.method) operations.push(current.operation);
      current = null;
    };

    for (let index = pathsIndex + 1; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (line.indent <= pathsIndent) break;

      const routeMatch = /^(\/[^:]+):\s*$/.exec(line.text);
      if (routeMatch) {
        flush();
        const methodless: OpenApiContract["operations"][number] = {
          id: "",
          source,
          path: unquote(routeMatch[1]!),
          method: "",
          tags: [],
        };
        current = {
          route: methodless.path,
          pathIndent: line.indent,
          methodIndent: -1,
          operation: methodless,
        };
        continue;
      }
      if (!current) continue;

      const methodMatch = /^(get|post|put|patch|delete|head|options):\s*$/.exec(line.text);
      if (methodMatch && line.indent > current.pathIndent) {
        const route: string = current.route;
        const pathIndent: number = current.pathIndent;
        flush();
        const method = methodMatch[1]!;
        current = {
          route,
          pathIndent,
          method,
          methodIndent: line.indent,
          operation: {
            id: `${method.toUpperCase()} ${route}`,
            source,
            path: route,
            method,
            tags: [],
          },
        };
        continue;
      }
      if (!current.method || line.indent <= current.methodIndent) continue;

      const operationId = /^operationId:\s*(.+)$/.exec(line.text);
      if (operationId) current.operation.operationId = unquote(operationId[1]!);
      const summary = /^summary:\s*(.+)$/.exec(line.text);
      if (summary) current.operation.summary = unquote(summary[1]!);
      const tags = /^tags:\s*(.+)$/.exec(line.text);
      if (tags) current.operation.tags = flowList(tags[1]!).map(unquote);
      const ref = /^\$ref:\s*(.+)$/.exec(line.text);
      if (ref) {
        const name = unquote(ref[1]!).split("/").pop();
        if (name && current.operation.responseSchema === undefined)
          current.operation.responseSchema = name;
      }
    }
    flush();
  }

  if (!title && !operations.length) return null;
  return {
    source,
    title: title || source,
    version,
    servers,
    operations: operations.sort(
      (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    ),
  };
}

export function parseOpenApiDocument(path: string, text: string): OpenApiContract | null {
  if (!text.trim()) return null;
  try {
    const trimmed = text.trimStart();
    if (trimmed.startsWith("{")) {
      try {
        return contractFromObject(path, JSON.parse(text));
      } catch {
        return null;
      }
    }
    return contractFromYaml(path, text);
  } catch {
    return null;
  }
}

function stripProtoComments(content: string) {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function blockBody(content: string, start: number) {
  const open = content.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let index = open; index < content.length; index += 1) {
    if (content[index] === "{") depth += 1;
    else if (content[index] === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(open + 1, index);
    }
  }
  return content.slice(open + 1);
}

function parseRpcs(body: string): ProtoRpc[] {
  const rpcs: ProtoRpc[] = [];
  const pattern =
    /rpc\s+(\w+)\s*\(\s*(stream\s+)?([\w.]+)\s*\)\s*returns\s*\(\s*(stream\s+)?([\w.]+)\s*\)/g;
  for (const match of body.matchAll(pattern)) {
    rpcs.push({
      name: match[1]!,
      request: match[3]!,
      response: match[5]!,
      clientStreaming: Boolean(match[2]),
      serverStreaming: Boolean(match[4]),
    });
  }
  return rpcs;
}

export function parseProtoDocument(path: string, text: string): ProtoServiceContract[] {
  if (!text.trim()) return [];
  try {
    const content = stripProtoComments(text);
    const packageName = /^\s*package\s+([\w.]+)\s*;/m.exec(content)?.[1] ?? "";
    const services: ProtoServiceContract[] = [];
    const pattern = /\bservice\s+(\w+)\s*\{/g;
    for (const match of content.matchAll(pattern)) {
      const name = match[1]!;
      const body = blockBody(content, match.index ?? 0);
      services.push({
        id: packageName ? `${packageName}.${name}` : name,
        source: path,
        package: packageName,
        name,
        rpcs: parseRpcs(body),
      });
    }
    return services;
  } catch {
    return [];
  }
}

export function buildContractCatalog(files: { path: string; text: string }[]): ContractCatalog {
  const openapi: OpenApiContract[] = [];
  const grpc: ProtoServiceContract[] = [];
  const seenOpenApi = new Set<string>();
  const seenGrpc = new Set<string>();

  for (const file of files) {
    if (isOpenApiPath(file.path)) {
      const contract = parseOpenApiDocument(file.path, file.text);
      if (!contract) continue;
      const key = `${contract.source}|${contract.title}|${contract.version}`;
      if (seenOpenApi.has(key)) continue;
      seenOpenApi.add(key);
      openapi.push(contract);
    } else if (isProtoPath(file.path)) {
      for (const service of parseProtoDocument(file.path, file.text)) {
        const key = `${service.source}|${service.id}`;
        if (seenGrpc.has(key)) continue;
        seenGrpc.add(key);
        grpc.push(service);
      }
    }
  }

  openapi.sort((a, b) => a.source.localeCompare(b.source));
  grpc.sort((a, b) => a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
  return { openapi, grpc };
}

/* ------------------------------- matching -------------------------------- */

function stripOrigin(raw: string) {
  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw).pathname;
  } catch {
    // Not a URL; treat it as a path.
  }
  const withoutQuery = raw.split(/[?#]/)[0] ?? raw;
  const path = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function pathSegments(path: string) {
  return stripOrigin(path).split("/").filter(Boolean);
}

function isWildcard(segment: string) {
  return /^\{[^}]+\}$/.test(segment) || segment.startsWith(":");
}

interface PathMatch {
  matchedBy: "exact" | "template";
  specificity: number;
}

function consumesRemainder(segment: string) {
  return /^\{[^}]+\+\}$/.test(segment);
}

function matchHttp(template: string, endpoint: string): PathMatch | null {
  const templateSegments = pathSegments(template);
  const endpointSegments = pathSegments(endpoint);
  const last = templateSegments[templateSegments.length - 1] ?? "";
  const openEnded = consumesRemainder(last) && endpointSegments.length >= templateSegments.length;
  if (templateSegments.length !== endpointSegments.length && !openEnded) return null;
  let wildcards = 0;
  for (let index = 0; index < templateSegments.length; index += 1) {
    const candidate = templateSegments[index]!;
    if (isWildcard(candidate)) {
      wildcards += 1;
      if (index === templateSegments.length - 1) break;
      continue;
    }
    if (candidate !== endpointSegments[index]) return null;
  }
  if (wildcards === 0) return { matchedBy: "exact", specificity: 1000 };
  return { matchedBy: "template", specificity: 100 - wildcards };
}

function normalizeGrpcEndpoint(raw: string) {
  const clean = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!clean) return "";
  if (clean.includes("/")) {
    const slash = clean.lastIndexOf("/");
    const service = clean.slice(0, slash);
    const method = clean.slice(slash + 1);
    return service && method ? `${service}/${method}` : "";
  }
  const parts = clean.split(".");
  if (parts.length < 2) return "";
  const method = parts.pop()!;
  return `${parts.join(".")}/${method}`;
}

function grpcKeys(service: ProtoServiceContract): string[] {
  const keys = [`${service.package}.${service.name}`, service.name].filter(Boolean);
  return [...new Set(keys)];
}

function matchGrpc(service: ProtoServiceContract, endpoint: string) {
  const normalized = normalizeGrpcEndpoint(endpoint);
  if (!normalized) return false;
  const [serviceKey, method] = [
    normalized.slice(0, normalized.lastIndexOf("/")),
    normalized.slice(normalized.lastIndexOf("/") + 1),
  ];
  return service.rpcs.some(
    (rpc) => rpc.name === method && grpcKeys(service).some((key) => key === serviceKey),
  );
}

export interface FederationInput {
  repository: string;
  analysis: RepoAnalysis;
}

export interface FederationEdge {
  fromRepository: string;
  fromPath: string;
  line: number;
  toRepository: string;
  operationId: string;
  protocol: "openapi" | "grpc";
  matchedBy: string;
}

export interface FederationResult {
  repositories: number;
  operations: number;
  services: number;
  edges: FederationEdge[];
  unmatchedEndpoints: number;
  limitations: string[];
}

interface ProviderOperation {
  repository: string;
  operation: OpenApiOperation;
}

interface ProviderService {
  repository: string;
  service: ProtoServiceContract;
}

export function federateRepositories(inputs: FederationInput[]): FederationResult {
  const providers = new Map<string, ContractCatalog>();
  for (const input of inputs) {
    if (!input.analysis.contracts) continue;
    const existing = providers.get(input.repository);
    providers.set(
      input.repository,
      existing
        ? {
            openapi: [...existing.openapi, ...input.analysis.contracts.openapi],
            grpc: [...existing.grpc, ...input.analysis.contracts.grpc],
          }
        : input.analysis.contracts,
    );
  }

  const operations: ProviderOperation[] = [];
  const services: ProviderService[] = [];
  let yamlDocuments = 0;
  for (const [repository, catalog] of providers) {
    for (const contract of catalog.openapi) {
      if (!/\.json$/i.test(contract.source)) yamlDocuments += 1;
      for (const operation of contract.operations) operations.push({ repository, operation });
    }
    for (const service of catalog.grpc) services.push({ repository, service });
  }

  const endpoints: { repository: string; path: string; line: number; ref: EndpointRef }[] = [];
  for (const input of inputs) {
    for (const file of input.analysis.files) {
      for (const ref of file.endpoints ?? [])
        endpoints.push({ repository: input.repository, path: file.path, line: ref.line, ref });
    }
  }

  const edges: FederationEdge[] = [];
  let unmatchedEndpoints = 0;
  let templateMatches = 0;
  let ambiguousMatches = 0;

  for (const endpoint of endpoints) {
    const candidates: { edge: Omit<FederationEdge, "fromRepository" | "fromPath" | "line"> }[] = [];
    if (endpoint.ref.protocol === "grpc") {
      for (const provider of services) {
        if (!matchGrpc(provider.service, endpoint.ref.path)) continue;
        const method = normalizeGrpcEndpoint(endpoint.ref.path);
        const rpc = provider.service.rpcs.find(
          (item) => item.name === method.slice(method.lastIndexOf("/") + 1),
        );
        if (!rpc) continue;
        candidates.push({
          edge: {
            toRepository: provider.repository,
            operationId: `${provider.service.id}/${rpc.name}`,
            protocol: "grpc",
            matchedBy: "grpc-method",
          },
        });
      }
    } else {
      const exact: typeof candidates = [];
      const template: typeof candidates = [];
      for (const provider of operations) {
        const match = matchHttp(provider.operation.path, endpoint.ref.path);
        if (!match) continue;
        const edge = {
          toRepository: provider.repository,
          operationId: provider.operation.operationId ?? provider.operation.id,
          protocol: "openapi" as const,
          matchedBy: match.matchedBy,
        };
        if (match.matchedBy === "exact") exact.push({ edge });
        else template.push({ edge });
      }
      // An exact operation is stronger evidence than a wildcard template.
      candidates.push(...(exact.length ? exact : template));
      if (!exact.length && template.length) templateMatches += 1;
      if (candidates.length > 1) ambiguousMatches += 1;
    }

    if (!candidates.length) {
      unmatchedEndpoints += 1;
      continue;
    }
    for (const candidate of candidates) {
      edges.push({
        fromRepository: endpoint.repository,
        fromPath: endpoint.path,
        line: endpoint.line,
        ...candidate.edge,
      });
    }
  }

  const deduped: FederationEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const key = `${edge.fromRepository}|${edge.fromPath}|${edge.line}|${edge.toRepository}|${edge.operationId}|${edge.protocol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(edge);
  }
  deduped.sort(
    (a, b) =>
      a.fromRepository.localeCompare(b.fromRepository) ||
      a.fromPath.localeCompare(b.fromPath) ||
      a.line - b.line ||
      a.operationId.localeCompare(b.operationId),
  );

  const limitations: string[] = [];
  if (!operations.length && !services.length)
    limitations.push("No OpenAPI or gRPC contracts were present in the analyzed repositories.");
  if (yamlDocuments)
    limitations.push(
      "YAML OpenAPI files are read with a documented subset parser; unsupported YAML constructs are ignored rather than guessed.",
    );
  if (templateMatches)
    limitations.push(
      `${templateMatches} endpoint match(es) relied on segment wildcards such as {id}, so the binding is structural, not exact.`,
    );
  if (ambiguousMatches)
    limitations.push(
      `${ambiguousMatches} endpoint(s) matched more than one provider operation; every candidate edge is reported.`,
    );
  if (endpoints.length === 0)
    limitations.push("No literal route or gRPC method strings were found in analyzed files.");

  return {
    repositories: inputs.length,
    operations: operations.length,
    services: services.length,
    edges: deduped,
    unmatchedEndpoints,
    limitations,
  };
}
