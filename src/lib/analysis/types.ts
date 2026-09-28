/**
 * Shared shapes for the repository analysis engine. Produced on the server during
 * ingestion (engine.server.ts, history.server.ts) and consumed by the graph, the
 * inspector and the MCP endpoint. Keep this file free of server-only imports.
 */

export const ANALYSIS_VERSION = 1;

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
  functions: string[];
  classes: string[];
  envVars: string[];
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

export interface RepoAnalysis {
  version: number;
  generatedAt: string;
  method: "typescript-ast";
  ref: string;
  packages: WorkspacePackage[];
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
  message: string;
  author: string;
  date: string;
  files: string[];
  url?: string;
}

export interface HistoryPullRequest {
  number: number;
  title: string;
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
