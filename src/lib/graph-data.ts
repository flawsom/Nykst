export type NodeKind = "org" | "domain" | "capability" | "service" | "module" | "file";

export interface BlastRadius {
  services: number;
  modules: number;
  files: number;
  teams: number;
  level: "Low" | "Moderate" | "High" | "Critical";
}

export interface FileDetail {
  path: string;
  language: string;
  loc: number;
  classes: string[];
  functions: string[];
  tests: string[];
  history: { when: string; who: string; what: string }[];
}

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  summary: string;
  metrics?: { label: string; value: string }[];
  owners: string[];
  dependencies: string[];
  dependents: string[];
  blast: BlastRadius;
  detail?: FileDetail;
  children?: GraphNode[];
  /** git repository this node maps to, e.g. acme/billing-api */
  repo?: string;
  /** primary implementation language */
  language?: string;
  /** false when this node is a terminal leaf (a file) */
  expandable: boolean;
}

/* ------------------------------------------------------------------ */
/* deterministic pseudo-randomness so a given org always looks the same */
/* ------------------------------------------------------------------ */

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string) {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function pick<T>(r: () => number, arr: T[]) {
  return arr[Math.floor(r() * arr.length)] as T;
}

function sample<T>(r: () => number, arr: T[], n: number) {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < Math.min(n, copy.length)) {
    out.push(copy.splice(Math.floor(r() * copy.length), 1)[0] as T);
  }
  return out;
}

function between(r: () => number, a: number, b: number) {
  return a + Math.floor(r() * (b - a + 1));
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function pascal(s: string) {
  return s
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/* ------------------------------------------------------------------ */
/* realistic catalogue of a ~180-engineer B2B SaaS company              */
/* ------------------------------------------------------------------ */

interface CapabilitySpec {
  name: string;
  summary: string;
  /** service suffixes actually deployed for this capability */
  services: string[];
  lang: string;
  team: string;
}

interface DomainSpec {
  name: string;
  summary: string;
  team: string;
  capabilities: CapabilitySpec[];
}

const cap = (
  name: string,
  summary: string,
  services: string[],
  lang: string,
  team: string,
): CapabilitySpec => ({ name, summary, services, lang, team });

const DOMAIN_SPECS: DomainSpec[] = [
  {
    name: "Core Platform",
    summary:
      "The shared runtime every product team builds on: service scaffolding, config, feature flags and internal libraries.",
    team: "@platform-core",
    capabilities: [
      cap(
        "Service Runtime",
        "Base images, health checks, graceful shutdown and the internal service template.",
        ["api", "sidecar", "bootstrap", "healthcheck"],
        "Go",
        "@platform-core",
      ),
      cap(
        "Feature Flags",
        "Percentage rollouts, kill switches and per-tenant targeting evaluated in under 1ms.",
        ["api", "evaluator", "sdk", "admin", "sync"],
        "TypeScript",
        "@platform-core",
      ),
      cap(
        "Configuration",
        "Layered config resolution: defaults, environment, tenant overrides and live reload.",
        ["api", "loader", "store"],
        "Go",
        "@platform-core",
      ),
      cap(
        "Job Scheduling",
        "Cron, delayed jobs and idempotent retries backed by Postgres advisory locks.",
        ["api", "scheduler", "worker", "dlq"],
        "TypeScript",
        "@platform-core",
      ),
      cap(
        "Internal SDKs",
        "Generated clients, tracing hooks and error taxonomy shared by every service.",
        ["sdk", "codegen", "registry"],
        "TypeScript",
        "@platform-core",
      ),
    ],
  },
  {
    name: "Identity & Access",
    summary:
      "Accounts, organizations, SSO, sessions, API keys and every authorization decision in the product.",
    team: "@identity",
    capabilities: [
      cap(
        "Authentication",
        "Password, magic link, OAuth and WebAuthn sign-in with device-bound sessions.",
        ["api", "session-store", "webauthn", "worker"],
        "TypeScript",
        "@identity",
      ),
      cap(
        "SSO & SCIM",
        "Enterprise SAML/OIDC connections plus SCIM user and group provisioning.",
        ["api", "saml-bridge", "scim-sync", "admin"],
        "Go",
        "@identity",
      ),
      cap(
        "Authorization",
        "Relationship-based permission checks with a cached decision path on every request.",
        ["api", "evaluator", "policy-store", "cache"],
        "Go",
        "@identity",
      ),
      cap(
        "Organizations",
        "Workspaces, memberships, invitations, seats and org-level settings.",
        ["api", "worker", "admin"],
        "TypeScript",
        "@identity",
      ),
      cap(
        "API Keys & Tokens",
        "Scoped keys, rotation windows, JWT signing and revocation propagation.",
        ["api", "signer", "rotator"],
        "Go",
        "@identity",
      ),
    ],
  },
  {
    name: "Payments & Billing",
    summary:
      "Plans, subscriptions, metering, invoicing, dunning and revenue reporting for every customer.",
    team: "@billing",
    capabilities: [
      cap(
        "Subscription Lifecycle",
        "Trials, upgrades, downgrades, proration and cancellation with a full audit trail.",
        ["api", "worker", "scheduler", "admin"],
        "TypeScript",
        "@billing",
      ),
      cap(
        "Usage Metering",
        "Ingests usage events, aggregates per billing period and enforces plan limits.",
        ["ingest", "aggregator", "api", "store"],
        "Go",
        "@billing",
      ),
      cap(
        "Invoicing",
        "Invoice generation, tax calculation, PDF rendering and delivery.",
        ["api", "renderer", "worker", "tax-bridge"],
        "TypeScript",
        "@billing",
      ),
      cap(
        "Payment Gateways",
        "Stripe and Adyen adapters, 3DS handling and webhook reconciliation.",
        ["gateway", "webhooks", "reconciler"],
        "TypeScript",
        "@billing",
      ),
      cap(
        "Dunning & Recovery",
        "Failed-payment retry ladders, grace periods and downgrade automation.",
        ["worker", "scheduler", "api"],
        "TypeScript",
        "@billing",
      ),
      cap(
        "Revenue Reporting",
        "MRR, ARR, churn and deferred-revenue rollups reconciled nightly with the ledger.",
        ["etl", "api", "ledger"],
        "Python",
        "@billing",
      ),
    ],
  },
  {
    name: "API & Integrations",
    summary:
      "The public API surface, SDKs, webhooks and the third-party integrations customers connect.",
    team: "@api-platform",
    capabilities: [
      cap(
        "Public REST API",
        "Versioned endpoints, pagination, idempotency keys and per-key rate limits.",
        ["gateway", "api", "ratelimiter", "docs"],
        "Go",
        "@api-platform",
      ),
      cap(
        "GraphQL Layer",
        "Federated schema, persisted queries and dataloader batching over internal services.",
        ["gateway", "resolver", "schema-registry"],
        "TypeScript",
        "@api-platform",
      ),
      cap(
        "Outbound Webhooks",
        "Signed delivery, exponential retries, dead-letter replay and per-endpoint health.",
        ["api", "dispatcher", "worker", "replay"],
        "TypeScript",
        "@api-platform",
      ),
      cap(
        "Third-party Connectors",
        "Salesforce, HubSpot, Slack and Jira sync with per-tenant credential storage.",
        ["api", "sync", "oauth-broker", "worker"],
        "TypeScript",
        "@integrations",
      ),
      cap(
        "SDK Generation",
        "OpenAPI-driven TypeScript, Python and Go clients published on every release.",
        ["codegen", "publisher", "registry"],
        "TypeScript",
        "@api-platform",
      ),
    ],
  },
  {
    name: "Data Platform",
    summary:
      "Event pipelines, the warehouse, transformation models and the metrics every team queries.",
    team: "@data-eng",
    capabilities: [
      cap(
        "Event Ingestion",
        "Kafka topics, schema registry and exactly-once delivery into the lake.",
        ["ingest", "collector", "schema-registry", "consumer"],
        "Go",
        "@data-eng",
      ),
      cap(
        "Stream Processing",
        "Windowed aggregations, enrichment joins and late-arrival handling.",
        ["processor", "enricher", "state-store"],
        "Java",
        "@data-eng",
      ),
      cap(
        "Warehouse Models",
        "dbt models, incremental builds, tests and lineage for the analytics layer.",
        ["dbt", "orchestrator", "lineage"],
        "Python",
        "@data-eng",
      ),
      cap(
        "Reverse ETL",
        "Pushes warehouse segments back into CRM, support and messaging tools.",
        ["sync", "worker", "api"],
        "Python",
        "@data-eng",
      ),
      cap(
        "Data Quality",
        "Freshness, volume and distribution checks with owner-routed alerts.",
        ["checks", "api", "alerts"],
        "Python",
        "@data-eng",
      ),
    ],
  },
  {
    name: "Search & Discovery",
    summary: "Indexing, query understanding, ranking and the search experience inside the product.",
    team: "@search",
    capabilities: [
      cap(
        "Indexing Pipeline",
        "Change-data-capture into OpenSearch with per-tenant index isolation.",
        ["indexer", "cdc-consumer", "reindex-worker"],
        "Go",
        "@search",
      ),
      cap(
        "Query Service",
        "Low-latency multi-tenant queries with filters, facets and permission trimming.",
        ["api", "query-planner", "cache"],
        "Go",
        "@search",
      ),
      cap(
        "Ranking",
        "Learning-to-rank models, click feedback loops and offline evaluation.",
        ["ranker", "trainer", "feature-store"],
        "Python",
        "@ml",
      ),
      cap(
        "Autocomplete",
        "Prefix suggestions, typo tolerance and recent-query personalization.",
        ["api", "suggest-builder"],
        "Go",
        "@search",
      ),
    ],
  },
  {
    name: "Notifications & Messaging",
    summary: "Email, in-app, push and Slack delivery with preferences, batching and templating.",
    team: "@messaging",
    capabilities: [
      cap(
        "Delivery Engine",
        "Channel routing, provider failover and per-tenant sending limits.",
        ["api", "dispatcher", "worker", "provider-bridge"],
        "TypeScript",
        "@messaging",
      ),
      cap(
        "Templating",
        "MJML templates, localization and preview rendering with versioned releases.",
        ["renderer", "api", "admin"],
        "TypeScript",
        "@messaging",
      ),
      cap(
        "Preferences",
        "Per-user channel preferences, digests, quiet hours and unsubscribe handling.",
        ["api", "store", "worker"],
        "TypeScript",
        "@messaging",
      ),
      cap(
        "In-app Inbox",
        "Realtime notification feed with read state and websocket fan-out.",
        ["api", "realtime-gateway", "store"],
        "TypeScript",
        "@messaging",
      ),
    ],
  },
  {
    name: "Infrastructure & Delivery",
    summary:
      "Kubernetes, Terraform, CI/CD, artifact promotion and everything that gets code to production.",
    team: "@infra",
    capabilities: [
      cap(
        "Build Pipeline",
        "Monorepo-aware builds, remote caching and reproducible container images.",
        ["ci-runner", "cache", "image-builder"],
        "Go",
        "@infra",
      ),
      cap(
        "Deployment",
        "Progressive delivery with canaries, automated rollback and deploy freezes.",
        ["controller", "api", "rollback-worker"],
        "Go",
        "@infra",
      ),
      cap(
        "Cluster Management",
        "Node pools, autoscaling, upgrades and workload placement policies.",
        ["operator", "autoscaler", "admission-webhook"],
        "Go",
        "@infra",
      ),
      cap(
        "Infrastructure as Code",
        "Terraform modules, drift detection and environment provisioning.",
        ["modules", "drift-detector", "planner"],
        "HCL",
        "@infra",
      ),
      cap(
        "Secrets Management",
        "Vault-backed secret issuance, short-lived credentials and rotation.",
        ["broker", "rotator", "agent"],
        "Go",
        "@security",
      ),
    ],
  },
  {
    name: "Observability & Reliability",
    summary: "Traces, metrics, logs, SLOs and the on-call surface used during every incident.",
    team: "@sre",
    capabilities: [
      cap(
        "Telemetry Pipeline",
        "OpenTelemetry collection, sampling and cost-aware retention.",
        ["collector", "sampler", "exporter"],
        "Go",
        "@sre",
      ),
      cap(
        "Metrics & SLOs",
        "Service level objectives, error budgets and burn-rate alerting.",
        ["api", "evaluator", "alerts"],
        "Go",
        "@sre",
      ),
      cap(
        "Log Platform",
        "Structured log ingestion, indexing and PII redaction at write time.",
        ["ingest", "indexer", "redactor"],
        "Go",
        "@sre",
      ),
      cap(
        "Incident Response",
        "Paging, incident timelines, status page updates and postmortem capture.",
        ["api", "pager-bridge", "timeline-worker"],
        "TypeScript",
        "@sre",
      ),
    ],
  },
  {
    name: "Security & Compliance",
    summary: "AppSec tooling, audit logging, data residency and SOC 2 / GDPR controls.",
    team: "@security",
    capabilities: [
      cap(
        "Audit Logging",
        "Tamper-evident audit trail with customer-facing export and retention rules.",
        ["api", "writer", "exporter"],
        "Go",
        "@security",
      ),
      cap(
        "Threat Detection",
        "Anomalous session, impossible-travel and credential-stuffing detection.",
        ["detector", "rules-engine", "api"],
        "Python",
        "@security",
      ),
      cap(
        "Data Governance",
        "PII classification, residency routing and deletion (right-to-be-forgotten) jobs.",
        ["classifier", "deletion-worker", "api"],
        "Python",
        "@security",
      ),
      cap(
        "Supply Chain",
        "SBOM generation, dependency scanning and signed build provenance.",
        ["scanner", "sbom-builder", "signer"],
        "Go",
        "@security",
      ),
    ],
  },
  {
    name: "Web Application",
    summary: "The customer-facing React app: dashboards, editors, settings and onboarding flows.",
    team: "@web",
    capabilities: [
      cap(
        "Application Shell",
        "Routing, layout, code-splitting, error boundaries and session bootstrapping.",
        ["app", "router", "design-system"],
        "TypeScript",
        "@web",
      ),
      cap(
        "Dashboards",
        "Charting, saved views, filters and CSV export across every workspace.",
        ["app", "widgets", "export-worker"],
        "TypeScript",
        "@web",
      ),
      cap(
        "Settings & Admin",
        "Org settings, member management, billing screens and audit views.",
        ["app", "forms"],
        "TypeScript",
        "@web",
      ),
      cap(
        "Onboarding",
        "Guided setup, sample data, checklists and activation instrumentation.",
        ["app", "checklist-api"],
        "TypeScript",
        "@growth",
      ),
    ],
  },
  {
    name: "Mobile & SDKs",
    summary: "iOS and Android clients plus the embeddable SDKs customers ship in their own apps.",
    team: "@mobile",
    capabilities: [
      cap(
        "iOS Client",
        "SwiftUI app with offline cache, background sync and push handling.",
        ["app", "sync-engine", "push"],
        "Swift",
        "@mobile",
      ),
      cap(
        "Android Client",
        "Kotlin app sharing the sync protocol and offline conflict resolution.",
        ["app", "sync-engine", "push"],
        "Kotlin",
        "@mobile",
      ),
      cap(
        "Embeddable SDK",
        "Drop-in widget with theming, sandboxing and versioned public surface.",
        ["sdk", "bridge", "cdn-publisher"],
        "TypeScript",
        "@mobile",
      ),
    ],
  },
  {
    name: "AI & ML Services",
    summary: "Model serving, retrieval, evaluation and the AI features shipped inside the product.",
    team: "@ml",
    capabilities: [
      cap(
        "Model Gateway",
        "Provider routing, streaming, token accounting and per-tenant quotas.",
        ["gateway", "api", "quota-store"],
        "Python",
        "@ml",
      ),
      cap(
        "Retrieval",
        "Chunking, embeddings, vector store and permission-aware retrieval.",
        ["indexer", "api", "embedder"],
        "Python",
        "@ml",
      ),
      cap(
        "Evaluation",
        "Golden datasets, regression scoring and human review queues.",
        ["runner", "api", "review-app"],
        "Python",
        "@ml",
      ),
      cap(
        "Feature Store",
        "Online and offline features with point-in-time correctness.",
        ["api", "materializer", "store"],
        "Python",
        "@ml",
      ),
    ],
  },
  {
    name: "Growth & Analytics",
    summary: "Product analytics, experimentation, lifecycle campaigns and the marketing surface.",
    team: "@growth",
    capabilities: [
      cap(
        "Product Analytics",
        "Event tracking, funnels, retention cohorts and self-serve exploration.",
        ["collector", "api", "query-service"],
        "Go",
        "@growth",
      ),
      cap(
        "Experimentation",
        "Assignment, exposure logging, sequential testing and guardrail metrics.",
        ["api", "assigner", "analysis"],
        "Python",
        "@growth",
      ),
      cap(
        "Lifecycle Campaigns",
        "Trigger-based journeys, audience segments and send scheduling.",
        ["api", "worker", "segment-builder"],
        "TypeScript",
        "@growth",
      ),
      cap(
        "Marketing Site",
        "Next.js marketing pages, docs, pricing and SEO infrastructure.",
        ["web", "cms-bridge"],
        "TypeScript",
        "@growth",
      ),
    ],
  },
];

const SERVICE_SUMMARY: Record<string, string> = {
  api: "HTTP service owning the read/write surface for this capability.",
  gateway: "Edge entry point: terminates traffic, authenticates and routes downstream.",
  worker: "Consumes the queue and executes long-running work off the request path.",
  scheduler: "Owns cron and delayed execution with idempotency guarantees.",
  webhooks: "Receives and verifies inbound provider callbacks.",
  ingest: "High-throughput write path that accepts and validates incoming events.",
  collector: "Fans in telemetry and events from every runtime and client.",
  consumer: "Kafka consumer group applying events to local state.",
  admin: "Internal back-office surface for support and operations.",
  store: "Owns the primary datastore and repository layer for this capability.",
  sync: "Reconciles internal state with an external system on a cursor.",
  indexer: "Builds and maintains the search index from change events.",
  renderer: "Renders templates and documents to their final output format.",
  evaluator: "Evaluates rules and returns a decision on the hot path.",
  sdk: "Published client library consumed by other services and customers.",
  codegen: "Generates typed clients and schemas from the API specification.",
  registry: "Source of truth for schemas, versions and ownership.",
  dlq: "Dead-letter handling, inspection and replay.",
  replay: "Replays previously failed deliveries on demand.",
  reconciler: "Detects and repairs drift between two systems of record.",
  cache: "Read-through cache with explicit invalidation hooks.",
  docs: "Reference documentation generated from the live specification.",
  app: "User-facing application bundle for this capability.",
};

const MODULES_BY_SUFFIX: Record<string, [string, string][]> = {
  api: [
    ["routes", "HTTP route definitions and request wiring."],
    ["handlers", "Per-endpoint request handling and response shaping."],
    ["validation", "Schema validation and invariant checks on every payload."],
    ["auth", "Authenticates the caller and resolves tenant context."],
    ["persistence", "Repository layer over the primary datastore."],
    ["clients", "Typed outbound calls to peer services."],
    ["errors", "Maps internal failures to stable client-facing error codes."],
    ["telemetry", "Tracing spans, metrics and structured logging."],
  ],
  worker: [
    ["consumer", "Pulls messages and manages offsets."],
    ["pipeline", "Ordered processing stages for each message."],
    ["retry", "Backoff, jitter and attempt accounting."],
    ["dlq", "Dead-letter routing and inspection."],
    ["telemetry", "Queue depth, lag and failure instrumentation."],
  ],
  gateway: [
    ["proxy", "Upstream connection pooling and request forwarding."],
    ["auth", "Token verification and key resolution at the edge."],
    ["ratelimit", "Per-tenant and per-key token bucket enforcement."],
    ["routing", "Route table, versioning and traffic splitting."],
    ["resilience", "Circuit breakers, timeouts and load shedding."],
  ],
  default: [
    ["core", "Primary business rules for this service."],
    ["persistence", "Datastore access and schema mapping."],
    ["clients", "Outbound calls to peer services and providers."],
    ["config", "Layered configuration resolved at boot."],
    ["telemetry", "Metrics, traces and structured logging."],
    ["errors", "Failure taxonomy and error mapping."],
  ],
};

const FILE_TEMPLATES: Record<string, [string, string, string[], string[]][]> = {
  routes: [
    ["index.ts", "Registers every route on the router.", ["Router"], ["register()", "mount()"]],
    [
      "v1.routes.ts",
      "Version 1 route table.",
      [],
      ["listResources()", "getResource()", "createResource()"],
    ],
    ["health.routes.ts", "Liveness and readiness probes.", [], ["liveness()", "readiness()"]],
    ["schemas.ts", "Zod schemas shared by the route layer.", [], ["parseBody()", "parseQuery()"]],
  ],
  handlers: [
    [
      "CreateHandler.ts",
      "Handles resource creation end to end.",
      ["CreateHandler"],
      ["handle()", "authorize()", "persist()"],
    ],
    [
      "UpdateHandler.ts",
      "Applies partial updates with optimistic concurrency.",
      ["UpdateHandler"],
      ["handle()", "merge()"],
    ],
    [
      "ListHandler.ts",
      "Cursor pagination and filtering.",
      ["ListHandler"],
      ["handle()", "buildCursor()"],
    ],
    ["DeleteHandler.ts", "Soft delete plus cascade cleanup.", ["DeleteHandler"], ["handle()"]],
  ],
  validation: [
    [
      "Validator.ts",
      "Runs schema and invariant checks.",
      ["Validator"],
      ["validate()", "assertShape()"],
    ],
    ["rules.ts", "Domain invariants expressed as pure predicates.", [], ["isWithinLimits()"]],
  ],
  auth: [
    [
      "AuthMiddleware.ts",
      "Extracts and verifies the caller identity.",
      ["AuthMiddleware"],
      ["use()", "resolveTenant()"],
    ],
    [
      "TokenVerifier.ts",
      "Verifies JWTs against the rotating JWKS.",
      ["TokenVerifier"],
      ["verify()", "refreshKeys()"],
    ],
    [
      "PermissionCheck.ts",
      "Relationship-based permission evaluation.",
      ["PermissionCheck"],
      ["can()", "explain()"],
    ],
  ],
  persistence: [
    [
      "Repository.ts",
      "CRUD access over the primary table.",
      ["Repository"],
      ["findById()", "insert()", "update()", "list()"],
    ],
    ["mappers.ts", "Row to domain object mapping.", [], ["toDomain()", "toRow()"]],
    ["migrations.ts", "Forward-only schema migrations.", [], ["up()", "down()"]],
  ],
  clients: [
    [
      "ServiceClient.ts",
      "Typed client for the upstream service.",
      ["ServiceClient"],
      ["get()", "post()", "withRetry()"],
    ],
    ["circuitBreaker.ts", "Trips on sustained upstream failure.", [], ["execute()", "state()"]],
  ],
  errors: [
    [
      "AppError.ts",
      "Base error type carrying a stable code.",
      ["AppError"],
      ["toResponse()", "isRetryable()"],
    ],
    ["errorCodes.ts", "The public error code enumeration.", [], []],
  ],
  telemetry: [
    ["metrics.ts", "Counters, histograms and gauges.", [], ["observe()", "increment()"]],
    ["tracing.ts", "Span creation and context propagation.", [], ["startSpan()", "inject()"]],
    ["logger.ts", "Structured logger with redaction.", ["Logger"], ["info()", "error()"]],
  ],
  consumer: [
    [
      "Consumer.ts",
      "Owns the consumer group lifecycle.",
      ["Consumer"],
      ["start()", "stop()", "commit()"],
    ],
    ["offsets.ts", "Offset checkpointing and recovery.", [], ["save()", "restore()"]],
  ],
  pipeline: [
    [
      "Pipeline.ts",
      "Chains the processing stages.",
      ["Pipeline"],
      ["run()", "use()", "shutdown()"],
    ],
    ["stages.ts", "Individual, independently testable stages.", [], ["enrich()", "transform()"]],
  ],
  retry: [
    [
      "RetryPolicy.ts",
      "Exponential backoff with jitter.",
      ["RetryPolicy"],
      ["nextDelay()", "shouldRetry()"],
    ],
    ["attempts.ts", "Attempt counting and budget enforcement.", [], ["record()", "exhausted()"]],
  ],
  dlq: [
    [
      "DeadLetterQueue.ts",
      "Routes poison messages aside.",
      ["DeadLetterQueue"],
      ["publish()", "drain()"],
    ],
    ["replay.ts", "Operator-triggered replay.", [], ["replay()", "inspect()"]],
  ],
  proxy: [
    [
      "Proxy.ts",
      "Forwards requests upstream with pooling.",
      ["Proxy"],
      ["forward()", "streamBody()"],
    ],
    ["pool.ts", "Connection pool and keep-alive tuning.", [], ["acquire()", "release()"]],
  ],
  ratelimit: [
    [
      "TokenBucket.ts",
      "Per-key token bucket in Redis.",
      ["TokenBucket"],
      ["take()", "refill()", "peek()"],
    ],
    ["limits.ts", "Plan-derived limit resolution.", [], ["limitFor()"]],
  ],
  routing: [
    ["RouteTable.ts", "Resolves a request to an upstream.", ["RouteTable"], ["match()", "add()"]],
    ["trafficSplit.ts", "Weighted splitting for canaries.", [], ["choose()"]],
  ],
  resilience: [
    [
      "CircuitBreaker.ts",
      "Opens on sustained failure.",
      ["CircuitBreaker"],
      ["execute()", "trip()", "reset()"],
    ],
    ["timeouts.ts", "Deadline propagation.", [], ["withDeadline()"]],
  ],
  core: [
    [
      "Service.ts",
      "The core use case for this service.",
      ["Service"],
      ["execute()", "resolve()", "rollback()"],
    ],
    ["domain.ts", "Domain types and invariants.", [], ["create()", "apply()"]],
    ["policies.ts", "Business policies applied before writes.", [], ["assertAllowed()"]],
  ],
  config: [
    [
      "ConfigLoader.ts",
      "Resolves layered configuration at boot.",
      ["ConfigLoader"],
      ["load()", "watch()"],
    ],
    ["schema.ts", "Config schema and defaults.", [], ["parse()"]],
  ],
};

const LANG_EXT: Record<string, string> = {
  TypeScript: ".ts",
  Go: ".go",
  Python: ".py",
  Java: ".java",
  Kotlin: ".kt",
  Swift: ".swift",
  HCL: ".tf",
};

const PEOPLE = [
  "maya.raines",
  "sam.okafor",
  "lin.chen",
  "arjun.iyer",
  "david.novak",
  "rafa.silva",
  "kenji.tanaka",
  "nora.hassan",
  "priya.nair",
  "tom.eriksen",
];

const WHEN = [
  "2 days ago",
  "5 days ago",
  "1 week ago",
  "3 weeks ago",
  "2 months ago",
  "5 months ago",
];

const COMMITS = [
  "Add idempotency key to write path",
  "Cache tenant lookup for 5 minutes",
  "Drop legacy v0 fallback branch",
  "Return typed error codes instead of 500s",
  "Propagate deadline through outbound calls",
  "Backfill missing composite index",
  "Batch writes to cut p99 by 38%",
  "Redact PII before structured logging",
  "Handle provider 429 with jittered backoff",
  "Split hot path out of the request handler",
  "Emit exposure event on assignment",
  "Fix off-by-one in cursor pagination",
];

/* ------------------------------------------------------------------ */
/* generation                                                          */
/* ------------------------------------------------------------------ */

const CHILD_KIND: Record<NodeKind, NodeKind> = {
  org: "domain",
  domain: "capability",
  capability: "service",
  service: "module",
  module: "file",
  file: "file",
};

const CHILD_LABEL: Record<NodeKind, string> = {
  org: "Domains",
  domain: "Capabilities",
  capability: "Services",
  service: "Modules",
  module: "Files",
  file: "Symbols",
};

function blastFor(r: () => number, kind: NodeKind): BlastRadius {
  const scale: Record<NodeKind, number> = {
    org: 214,
    domain: 22,
    capability: 6,
    service: 3,
    module: 1,
    file: 1,
  };
  const services = Math.max(1, Math.round(scale[kind] * (0.7 + r() * 0.6)));
  const modules = kind === "file" ? 1 : services * between(r, 4, 8);
  const files = modules * between(r, 5, 11);
  const teams = Math.max(1, Math.round(services / between(r, 3, 7)));
  const level: BlastRadius["level"] =
    services > 60 ? "Critical" : services > 15 ? "High" : services > 4 ? "Moderate" : "Low";
  return { services, modules, files, teams, level };
}

function titleCaseSlug(s: string) {
  return s
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** org slug is stored on the root id, so every child can derive it */
function orgOf(id: string) {
  const first = id.split("/")[0] ?? "org:acme";
  return first.replace("org:", "") || "acme";
}

function metricsFor(kind: NodeKind, r: () => number, lang: string) {
  switch (kind) {
    case "domain":
      return [
        { label: "Repositories", value: String(between(r, 6, 24)) },
        { label: "Services", value: String(between(r, 9, 38)) },
        { label: "Engineers", value: String(between(r, 6, 26)) },
        { label: "Deploys / week", value: String(between(r, 8, 60)) },
      ];
    case "capability":
      return [
        { label: "Services", value: String(between(r, 3, 7)) },
        { label: "Coverage", value: `${between(r, 64, 93)}%` },
        { label: "p99 latency", value: `${between(r, 24, 380)} ms` },
        { label: "Change failure", value: `${between(r, 2, 14)}%` },
      ];
    case "service":
      return [
        { label: "Language", value: lang },
        { label: "Requests / day", value: `${between(r, 2, 90)}.${between(r, 0, 9)}M` },
        { label: "p99 latency", value: `${between(r, 18, 420)} ms` },
        { label: "Error rate", value: `0.${between(r, 1, 9)}${between(r, 0, 9)}%` },
        { label: "Coverage", value: `${between(r, 58, 94)}%` },
        {
          label: "Last deploy",
          value: pick(r, ["2h ago", "yesterday", "3 days ago", "1 week ago"]),
        },
      ];
    case "module":
      return [
        { label: "Files", value: String(between(r, 3, 9)) },
        { label: "Lines of code", value: String(between(r, 640, 4200)) },
        { label: "Coverage", value: `${between(r, 51, 96)}%` },
        { label: "Open PRs", value: String(between(r, 0, 6)) },
      ];
    default:
      return [
        { label: CHILD_LABEL[kind], value: String(between(r, 5, 9)) },
        { label: "Coverage", value: `${between(r, 62, 96)}%` },
      ];
  }
}

interface MakeOpts {
  repo?: string;
  language?: string;
  owner?: string;
  fileTemplate?: [string, string, string[], string[]];
  modulePath?: string;
}

function makeNode(
  parentId: string,
  kind: NodeKind,
  label: string,
  summary: string,
  siblings: string[],
  opts: MakeOpts = {},
): GraphNode {
  const id = `${parentId}/${kind}:${label}`;
  const r = rng(id);
  const peers = siblings.filter((s) => s !== label);
  const lang = opts.language ?? "TypeScript";
  const node: GraphNode = {
    id,
    label,
    kind,
    summary,
    owners: opts.owner
      ? [opts.owner, ...(r() > 0.6 ? [pick(r, ["@sre", "@security", "@platform-core"])] : [])]
      : ["@platform-core"],
    dependencies: sample(r, peers, Math.min(peers.length, between(r, 1, 3))),
    dependents: sample(r, peers, Math.min(peers.length, between(r, 1, 3))),
    blast: blastFor(r, kind),
    expandable: kind !== "file",
    language: lang,
  };
  if (opts.repo) node.repo = opts.repo;
  if (kind === "file" && opts.fileTemplate) {
    node.detail = fileDetail(label, opts, r);
  } else {
    node.metrics = metricsFor(kind, r, lang);
  }
  return node;
}

function fileDetail(label: string, opts: MakeOpts, r: () => number): FileDetail {
  const tpl = opts.fileTemplate!;
  const base = label.replace(/\.[a-z]+$/, "");
  return {
    path: `${opts.modulePath ?? "src"}/${label}`,
    language: opts.language ?? "TypeScript",
    loc: between(r, 62, 540),
    classes: tpl[2],
    functions: tpl[3],
    tests: [
      `${base}.test${LANG_EXT[opts.language ?? "TypeScript"] ?? ".ts"} — ${between(r, 3, 26)} cases`,
    ],
    history: sample(r, WHEN, 3).map((when) => ({
      when,
      who: pick(r, PEOPLE),
      what: `${pick(r, COMMITS)} (#${between(r, 1200, 8900)})`,
    })),
  };
}

function findDomain(label: string) {
  return DOMAIN_SPECS.find((d) => d.name === label);
}

function findCapability(domainLabel: string, capLabel: string) {
  return findDomain(domainLabel)?.capabilities.find((c) => c.name === capLabel);
}

/** walks a node id back to its domain / capability specs */
function specsFor(id: string) {
  const segs = id.split("/");
  const domainSeg = segs.find((s) => s.startsWith("domain:"));
  const capSeg = segs.find((s) => s.startsWith("capability:"));
  const serviceSeg = segs.find((s) => s.startsWith("service:"));
  const domain = domainSeg ? findDomain(domainSeg.slice("domain:".length)) : undefined;
  const capability =
    domain && capSeg ? findCapability(domain.name, capSeg.slice("capability:".length)) : undefined;
  const service = serviceSeg?.slice("service:".length);
  return { domain, capability, service };
}

function modulesFor(serviceLabel: string): [string, string][] {
  const suffix = serviceLabel.split("-").pop() ?? "";
  return MODULES_BY_SUFFIX[suffix] ?? MODULES_BY_SUFFIX["default"]!;
}

function filesFor(moduleLabel: string, language: string, r: () => number) {
  const tpls = FILE_TEMPLATES[moduleLabel] ?? FILE_TEMPLATES["core"]!;
  const ext = LANG_EXT[language] ?? ".ts";
  const chosen = sample(r, tpls, Math.min(tpls.length, between(r, 3, tpls.length)));
  const extra: [string, string, string[], string[]][] = [
    ["index" + ext, "Public surface of this module.", [], ["default()"]],
    ["types" + ext, "Shared types for this module.", [], []],
  ];
  return [...chosen, ...sample(r, extra, between(r, 1, 2))].map(
    (t) => [t[0].replace(/\.ts$/, ext), t[1], t[2], t[3]] as [string, string, string[], string[]],
  );
}

const cache = new Map<string, GraphNode[]>();

/** Lazily generates (and memoizes) the children of any node. */
export function childrenOf(node: GraphNode): GraphNode[] {
  if (node.children) return node.children;
  if (!node.expandable) return [];
  const hit = cache.get(node.id);
  if (hit) return hit;

  const kind = CHILD_KIND[node.kind];
  const r = rng(`${node.id}#children`);
  const org = orgOf(node.id);
  const { domain, capability } = specsFor(node.id);

  let built: GraphNode[] = [];

  if (node.kind === "org") {
    const labels = DOMAIN_SPECS.map((d) => d.name);
    built = DOMAIN_SPECS.map((d) =>
      makeNode(node.id, "domain", d.name, d.summary, labels, {
        owner: d.team,
        repo: `${org}/${slug(d.name)}`,
      }),
    );
  } else if (node.kind === "domain" && domain) {
    const labels = domain.capabilities.map((c) => c.name);
    built = domain.capabilities.map((c) =>
      makeNode(node.id, "capability", c.name, c.summary, labels, {
        owner: c.team,
        language: c.lang,
        repo: `${org}/${slug(domain.name)}`,
      }),
    );
  } else if (node.kind === "capability" && capability) {
    const base = slug(capability.name).split("-").slice(0, 2).join("-");
    const labels = capability.services.map((s) => `${base}-${s}`);
    built = labels.map((label, i) => {
      const suffix = capability.services[i]!;
      return makeNode(
        node.id,
        "service",
        label,
        SERVICE_SUMMARY[suffix] ??
          `${titleCaseSlug(suffix)} service supporting ${capability.name.toLowerCase()}.`,
        labels,
        {
          owner: capability.team,
          language: capability.lang,
          repo: `${org}/${label}`,
        },
      );
    });
  } else if (node.kind === "service") {
    const mods = modulesFor(node.label);
    const labels = mods.map((m) => m[0]);
    built = mods.map(([label, summary]) =>
      makeNode(node.id, "module", label, summary, labels, {
        owner: node.owners[0] ?? "@platform-core",
        language: node.language ?? "TypeScript",
        repo: node.repo ?? `${org}/${node.label}`,
      }),
    );
  } else if (node.kind === "module") {
    const lang = node.language ?? "TypeScript";
    const service = node.id
      .split("/")
      .find((s) => s.startsWith("service:"))
      ?.slice("service:".length);
    const tpls = filesFor(node.label, lang, r);
    const labels = tpls.map((t) => t[0]);
    built = tpls.map((tpl) =>
      makeNode(node.id, "file", tpl[0], tpl[1], labels, {
        owner: node.owners[0] ?? "@platform-core",
        language: lang,
        repo: node.repo ?? `${org}/${service ?? "service"}`,
        fileTemplate: tpl,
        modulePath: `services/${service ?? "service"}/src/${node.label}`,
      }),
    );
  }

  cache.set(node.id, built);
  return built;
}

/** Root node for any connected organization. */
export function buildOrg(slugName: string): GraphNode {
  const name = titleCaseSlug(slugName || "acme");
  const r = rng(`org:${slugName}`);
  const repos = between(r, 92, 164);
  const services = between(r, 180, 260);
  const engineers = between(r, 140, 220);
  return {
    id: `org:${slugName}`,
    label: name,
    kind: "org",
    summary: `${DOMAIN_SPECS.length} core domains derived from ${repos} repositories, ${services} deployed services and ${(services * 1400).toLocaleString()} analyzed files.`,
    owners: ["@platform-core", "@sre"],
    dependencies: [],
    dependents: [],
    repo: `${slugName || "acme"}/*`,
    language: "TypeScript",
    blast: blastFor(r, "org"),
    expandable: true,
    metrics: [
      { label: "Repositories", value: String(repos) },
      { label: "Services", value: String(services) },
      { label: "Engineers", value: String(engineers) },
      { label: "Domains", value: String(DOMAIN_SPECS.length) },
      { label: "Deploys / week", value: String(between(r, 180, 420)) },
      { label: "Median PR age", value: `${between(r, 6, 34)}h` },
    ],
  };
}

export function getOrg(slugName: string): GraphNode {
  return buildOrg(slugName);
}

/** every domain label Nykst can derive — used by access control */
export const DOMAIN_LABELS = DOMAIN_SPECS.map((d) => d.name);

export const kindLabel: Record<NodeKind, string> = {
  org: "Organization",
  domain: "Core domain",
  capability: "Capability",
  service: "Service",
  module: "Module",
  file: "File",
};

export const childKindLabel: Record<NodeKind, string> = {
  org: "Core domains",
  domain: "Capabilities",
  capability: "Services",
  service: "Modules",
  module: "Files",
  file: "Structure",
};
