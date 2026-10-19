/**
 * Shared shapes for the repository analysis engine. Produced on the server during
 * ingestion (engine.server.ts, history.server.ts) and consumed by the graph, the
 * inspector and the MCP endpoint. Keep this file free of server-only imports.
 */

export const ANALYSIS_VERSION = 2;

/** Languages the compiler can turn into dependency edges. */
export type SourceLanguage = "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "rust";

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

export interface EndpointRef {
  /** literal route such as "/api/users/42" or "Users/Get" */
  path: string;
  line: number;
  protocol: "http" | "grpc";
}

export interface SymbolParameter {
  name: string;
  type: string;
  optional: boolean;
  rest: boolean;
}

export interface SymbolProperty {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
}

/** A machine-readable public signature, parsed from the TypeScript AST. */
export interface ExportedSymbol {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "enum" | "re-export";
  line: number;
  /** every declared parameter, in source order */
  parameters?: SymbolParameter[];
  /** total declared parameters */
  arity?: number;
  /** parameters without a default or `?` marker */
  requiredArity?: number;
  returnType?: string;
  /** interface, type-literal, class-field and enum-member properties */
  typeProperties?: SymbolProperty[];
}

/** A column name read or written through a literal Supabase/PostgREST call. */
export interface ColumnRef {
  table: string;
  column: string;
  line: number;
  operation: string;
}

export interface AnalyzedFile {
  path: string;
  language: SourceLanguage;
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
  /** literal HTTP route or gRPC method strings, used by cross-repository federation */
  endpoints?: EndpointRef[];
  /** exported signatures with arity and type properties */
  symbols?: ExportedSymbol[];
  /** literal column references, compared against SQL DDL for contract drift */
  columnRefs?: ColumnRef[];
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

export interface SqlColumn {
  name: string;
  type: string;
  nullable: boolean;
}

/** One ordered DDL fact. Stored so incremental patches can replay only changed files. */
export interface SqlColumnEvent {
  table: string;
  column: string;
  op: "create" | "add" | "drop" | "rename" | "alter";
  path: string;
  line: number;
  type?: string;
  nullable?: boolean;
  /** previous name for a rename */
  from?: string;
}

export interface ColumnDrift {
  kind: "unknown-column" | "dropped-column";
  table: string;
  column: string;
  message: string;
  references: { path: string; line: number; operation: string }[];
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
  /** final columns after replaying DDL in migration path order */
  columns?: SqlColumn[];
  /** ordered DDL events, used by incremental patching and drift replay */
  sqlEvents?: SqlColumnEvent[];
  /** literal code references that disagree with the final DDL */
  columnDrift?: ColumnDrift[];
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

/* ------------------------- contracts and evidence ------------------------- */

export interface OpenApiOperation {
  id: string;
  source: string;
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  tags: string[];
  requestSchema?: string;
  responseSchema?: string;
}

export interface OpenApiContract {
  source: string;
  title: string;
  version: string;
  servers: string[];
  operations: OpenApiOperation[];
}

export interface ProtoRpc {
  name: string;
  request: string;
  response: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
}

export interface ProtoServiceContract {
  id: string;
  source: string;
  package: string;
  name: string;
  rpcs: ProtoRpc[];
}

export interface ContractCatalog {
  openapi: OpenApiContract[];
  grpc: ProtoServiceContract[];
}

export type MemoryKind = "adr" | "diagram" | "migration" | "contract" | "image";

export interface MemoryCitation {
  path: string;
  line?: number;
}

export interface MemoryEntity {
  kind:
    | "table"
    | "column"
    | "service"
    | "operation"
    | "node"
    | "edge"
    | "message"
    | "decision"
    | "status"
    | "image";
  value: string;
}

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  /** bounded, quotable evidence text; never a model-generated paraphrase */
  text: string;
  citations: MemoryCitation[];
  /** SHA-256 of the evidence body, so a stale claim is detectable */
  checksum: string;
  tags: string[];
  entities: MemoryEntity[];
  media?: {
    type: "mermaid" | "image";
    alt?: string;
    path?: string;
    format?: string;
  };
  status?: "proposed" | "accepted" | "rejected" | "superseded" | "amended" | "unknown";
}

/** Enough resolver state to re-parse a changed file without a full checkout. */
export interface ResolverSnapshot {
  aliases: { dir: string; aliases: { pattern: string; targets: string[] }[] }[];
  manifests: {
    dir: string;
    name?: string;
    main?: string;
    module?: string;
    types?: string;
    source?: string;
    exports?: unknown;
  }[];
  goModule?: string;
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
  /** resolver state that makes incremental patching exact */
  resolver?: ResolverSnapshot;
  /** OpenAPI and gRPC contracts found in the repository */
  contracts?: ContractCatalog;
  /** citations extracted from ADRs, diagrams, migrations and image references */
  memory?: MemoryRecord[];
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
