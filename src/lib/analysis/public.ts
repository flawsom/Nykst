import type { AnalyzedFile, DataResource, ExternalService, RepoAnalysis } from "./types";
import type { RepositorySnapshot } from "@/lib/repository-graph";

export type SensitiveNames = {
  envNames: Set<string>;
  tableNames: Set<string>;
};

function resourceLabel(kind: DataResource["kind"], index: number) {
  const label =
    kind === "table" ? "Table" : kind === "rpc" ? "RPC" : kind === "bucket" ? "Bucket" : "Model";
  return `${label} ${index + 1}`;
}

function stripResourcePrefix(value: string) {
  return value.replace(/^(table|rpc|bucket|model):/, "");
}

function publicFile(file: AnalyzedFile): AnalyzedFile {
  return {
    ...file,
    envVars: [],
    resources: (file.resources ?? []).map((use) => ({ id: "resource", line: use.line })),
    columnRefs: [],
  };
}

function publicResource(resource: DataResource, index: number): DataResource {
  return {
    id: `resource:${index + 1}`,
    kind: resource.kind,
    name: resourceLabel(resource.kind, index),
    service: resource.service,
    definedIn: resource.definedIn ?? [],
    uses: resource.uses ?? [],
    columns: [],
    columnDrift: [],
  };
}

function publicService(service: ExternalService): ExternalService {
  return { ...service, envVars: [] };
}

export function collectSensitiveNames(analysis: RepoAnalysis): SensitiveNames {
  const envNames = new Set<string>();
  const tableNames = new Set<string>();

  for (const env of analysis.envVars ?? []) {
    if (env.name) envNames.add(env.name);
  }
  for (const service of analysis.services ?? []) {
    for (const name of service.envVars ?? []) envNames.add(name);
  }
  for (const file of analysis.files ?? []) {
    for (const name of file.envVars ?? []) envNames.add(name);
    for (const use of file.resources ?? []) {
      const name = stripResourcePrefix(use.id);
      if (name) tableNames.add(name);
    }
    for (const ref of file.columnRefs ?? []) {
      if (ref.table) tableNames.add(ref.table);
    }
  }
  for (const resource of analysis.resources ?? []) {
    if (resource.name) tableNames.add(resource.name);
  }

  return { envNames, tableNames };
}

function hideSensitiveText(value: string, names: SensitiveNames) {
  if (/^(table|rpc|bucket|model):/.test(value)) return "resource";
  let next = value;
  for (const name of names.envNames) {
    if (name.length >= 3) next = next.split(name).join("[hidden]");
  }
  for (const name of names.tableNames) {
    if (name.length >= 3) next = next.split(name).join("[hidden]");
  }
  return next;
}

export function redactPublicStrings(value: unknown, names: SensitiveNames): unknown {
  if (typeof value === "string") return hideSensitiveText(value, names);
  if (Array.isArray(value)) return value.map((item) => redactPublicStrings(item, names));
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "content") continue;
    out[key] = redactPublicStrings(child, names);
  }
  return out;
}

function publicResourceValue(value: unknown, index: number) {
  if (!value || typeof value !== "object") return value;
  const resource = value as Partial<DataResource> & { line?: number };
  if (typeof resource.kind === "string" && typeof resource.name === "string") {
    return {
      id: `resource:${index + 1}`,
      kind: resource.kind,
      name: resourceLabel(resource.kind as DataResource["kind"], index),
      service: resource.service,
      definedIn: resource.definedIn,
      uses: resource.uses,
      columns: [],
      columnDrift: [],
    };
  }
  if (typeof resource.line === "number") return { id: "resource", line: resource.line };
  return {};
}

export function redactPublicValue(
  value: unknown,
  names: SensitiveNames,
  options: { preserveLoopEvidence?: boolean } = {},
): unknown {
  if (Array.isArray(value)) return value.map((item) => redactPublicValue(item, names, options));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? hideSensitiveText(value, names) : value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    // Keep the shape the public workbench renders. Hiding a field by deleting
    // it crashes components that expect an array or a string, so sensitive
    // values are replaced with an empty value of the same shape instead.
    // The safe loop is the exception: its buffer is the proof the visitor came
    // to inspect, and the example repository is already public. Sensitive names
    // inside that source are still replaced by hideSensitiveText below.
    if (key === "content") {
      out["content"] =
        options.preserveLoopEvidence && typeof child === "string"
          ? hideSensitiveText(child, names)
          : "";
      continue;
    }
    if (key === "columnDrift" && options.preserveLoopEvidence && Array.isArray(child)) {
      out["columnDrift"] = child.map((item) => redactPublicValue(item, names, options));
      continue;
    }
    if (key === "contracts" || key === "knowledge") {
      out[key] = [];
      continue;
    }
    if (key === "resolver") {
      out["resolver"] = null;
      continue;
    }
    if (key === "memory") {
      out["memory"] = [];
      continue;
    }
    if (key === "envVars") {
      out["envVars"] = [];
      out["envVarCount"] = Array.isArray(child) ? child.length : 0;
      continue;
    }
    if (key === "columns" || key === "columnDrift" || key === "sqlEvents" || key === "columnRefs") {
      out[key] = [];
      continue;
    }
    if (key === "resources" && Array.isArray(child)) {
      out["resources"] = child.map((item, index) => publicResourceValue(item, index));
      continue;
    }
    out[key] = redactPublicValue(child, names, options);
  }
  return out;
}

export function redactPublicFile(file: AnalyzedFile | null): AnalyzedFile | null {
  return file ? publicFile(file) : null;
}

export function redactPublicAnalysis(analysis: RepoAnalysis): RepoAnalysis {
  const names = collectSensitiveNames(analysis);
  const redacted: RepoAnalysis = {
    ...analysis,
    files: (analysis.files ?? []).map(publicFile),
    services: (analysis.services ?? []).map(publicService),
    resources: (analysis.resources ?? []).map(publicResource),
    envVars: [],
    memory: [],
  };
  delete redacted.resolver;
  delete redacted.contracts;
  return redactPublicStrings(redacted, names) as RepoAnalysis;
}

export function redactPublicSnapshot(snapshot: RepositorySnapshot): RepositorySnapshot {
  const names = snapshot.analysis
    ? collectSensitiveNames(snapshot.analysis)
    : { envNames: new Set<string>(), tableNames: new Set<string>() };
  const redacted: RepositorySnapshot = {
    ...snapshot,
    ...(snapshot.analysis ? { analysis: redactPublicAnalysis(snapshot.analysis) } : {}),
    ...(snapshot.history ? { history: { ...snapshot.history, pullRequests: [] } } : {}),
    pull_requests: [],
    issues: [],
    contributors: [],
  };
  const extra = redacted as RepositorySnapshot & { knowledge?: unknown };
  delete extra.knowledge;
  return redactPublicStrings(redacted, names) as RepositorySnapshot;
}
