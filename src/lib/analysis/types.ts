/**
 * Shared shapes for the repository analysis engine. Produced on the server during
 * ingestion (engine.server.ts, history.server.ts) and consumed by the graph, the
 * inspector and the MCP endpoint. Keep this file free of server-only imports.
 */

/**
 * 2 added imported names, export signatures, call sites, module-scope env reads, declared
 * dependencies and the resolver configuration. Older snapshots must be re-analyzed.
 */
export const ANALYSIS_VERSION = 2;

export type FileRole =
  | "route"
  | "api"
  | "component"
  | "hook"
  | "server"
  | "lib"
  | "test"
  | "config"
  | "script"
  | "types"
  | "generated"
  | "other";

export type ImportKind = "internal" | "external" | "builtin" | "asset" | "unresolved";

export interface ImportRef {
  specifier: string;
  line: number;
  kind: ImportKind;
  /** repository path for internal/asset imports, package name for external ones */
  target?: string;
  typeOnly: boolean;
  dynamic: boolean;
  /** names taken from the other module: "default", "*" for a namespace, or export names */
  names: string[];
  /** line of each name in `names` when it differs from `line` (multi-line imports) */
  nameLines?: number[];
  /** true for `export * from "x"`: this file re-exports everything the target exports */
  reexportAll?: boolean;
}

export interface ExportSig {
  kind: "function" | "class" | "variable" | "type" | "enum" | "default" | "reexport";
  /** parameters a caller must pass (functions only) */
  required?: number;
  /** most parameters a caller may pass; null for rest parameters */
  max?: number | null;
}

/** A call to a function imported from another repository file. */
export interface CallSite {
  /** repository path of the file that exports the function */
  target: string;
  /** exported name, e.g. "createUser" */
  name: string;
  args: number;
  spread?: boolean;
  line: number;
}

export interface ResourceUse {
  /** e.g. "table:repository_ingestions", "rpc:get_user", "bucket:avatars" */
  id: string;
  line: number;
}

export interface AnalyzedFile {
  path: string;
  language: "ts" | "tsx" | "js" | "jsx";
  loc: number;
  /** workspace package directory ("" for the repository root package) */
  packageDir: string;
  role: FileRole;
  imports: ImportRef[];
  exports: string[];
  exportSigs: Record<string, ExportSig>;
  functions: string[];
  classes: string[];
  envVars: string[];
  /** environment variables read while the module loads, not inside a function */
  moduleScopeEnv: { name: string; line: number }[];
  /** calls to exported functions of other repository files, for signature checks */
  calls: CallSite[];
  /** external service ids used by this file */
  services: string[];
  resources: ResourceUse[];
}

export interface ServiceEvidence {
  path: string;
  /** what proved the usage, e.g. `import "@supabase/supabase-js"` or `https://api.github.com` */
  reason: string;
  line?: number;
}

export interface ExternalService {
  id: string;
  name: string;
  category:
    | "database"
    | "auth"
    | "payments"
    | "ai"
    | "hosting"
    | "observability"
    | "email"
    | "api"
    | "infra"
    | "storage"
    | "analytics"
    | "queue";
  packages: string[];
  envVars: string[];
  files: string[];
  evidence: ServiceEvidence[];
}

export interface DataResource {
  id: string;
  kind: "table" | "rpc" | "bucket" | "model";
  name: string;
  /** service id that owns the resource (supabase, prisma, ...) */
  service: string;
  /** migration or schema file that defines it, if found */
  definedIn: string[];
  uses: { path: string; line: number }[];
}

export interface WorkspacePackage {
  name: string;
  dir: string;
}

export interface AnalysisStats {
  treeFiles: number;
  sourceFiles: number;
  analyzedFiles: number;
  internalEdges: number;
  externalPackages: number;
  unresolvedImports: number;
  skippedFiles: number;
  loc: number;
  durationMs: number;
}

export interface PackageDeps {
  dir: string;
  name?: string;
  /** dependencies, devDependencies, peerDependencies and optionalDependencies */
  deps: string[];
}

/** What the import resolver needs, kept so generated code can be checked later. */
export interface ResolverConfig {
  manifests: {
    dir: string;
    name?: string;
    main?: string;
    module?: string;
    types?: string;
    source?: string;
    exports?: unknown;
  }[];
  aliases: { dir: string; aliases: { pattern: string; targets: string[] }[] }[];
}

export interface RepoAnalysis {
  version: number;
  generatedAt: string;
  method: "typescript-ast";
  ref: string;
  packages: WorkspacePackage[];
  packageDeps: PackageDeps[];
  resolver: ResolverConfig;
  files: AnalyzedFile[];
  services: ExternalService[];
  resources: DataResource[];
  envVars: { name: string; files: string[] }[];
  cycles: string[][];
  stats: AnalysisStats;
  /** honest list of what the analysis could not see */
  limitations: string[];
}

export interface HistoryCommit {
  sha: string;
  /** first line of the commit message */
  message: string;
  /** rest of the message, trimmed, for "This reverts commit …" and fix references */
  body?: string;
  author: string;
  date: string;
  files: string[];
  url?: string;
}

export interface HistoryPullRequest {
  number: number;
  title: string;
  /** description, trimmed to the first 600 characters */
  body?: string;
  author: string;
  state: string;
  mergedAt: string | null;
  url?: string;
  files: string[];
  /** issue numbers referenced as "fixes #12" / "closes #12" */
  closes: number[];
}

export interface RepoHistory {
  generatedAt: string;
  commits: HistoryCommit[];
  pullRequests: HistoryPullRequest[];
  limitations: string[];
}
