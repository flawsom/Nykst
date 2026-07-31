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

/* ------------------------------------------------------------------ */
/* vocabulary                                                          */
/* ------------------------------------------------------------------ */

const DOMAINS = [
  ["Platform Engineering", "Runtime, CI/CD, observability and paved roads used by every team."],
  ["Content Delivery", "Moving assets from origin to the viewer with the least possible latency."],
  ["User Identity", "Accounts, profiles, devices, sessions and entitlements."],
  ["Payments & Billing", "Plans, invoicing, metering, dunning and revenue recognition."],
  ["Data & Analytics", "Event pipelines, warehouses, metrics and experimentation."],
  ["Search & Discovery", "Indexing, query understanding, ranking and personalization."],
  ["Security & Compliance", "AuthZ, secrets, audit trails and regulatory controls."],
  ["Growth & Messaging", "Lifecycle campaigns, notifications and onboarding surfaces."],
  ["Core APIs", "Public and internal API surfaces, gateways and SDK generation."],
];

const CAPABILITIES = [
  ["Service Runtime", "How services are packaged, scheduled and scaled."],
  ["Observability", "Traces, metrics and logs across every request path."],
  ["Delivery Pipeline", "Build, test, promote and roll back safely."],
  ["Access Control", "Who may do what, verified at every boundary."],
  ["Data Ingestion", "Getting events in reliably, exactly once."],
  ["Configuration", "Feature flags, dynamic config and rollout control."],
  ["Storage Layer", "Durable state, replication and lifecycle policies."],
  ["Edge Routing", "Steering traffic to the healthiest region."],
];

const SERVICES = [
  ["Gateway", "Terminates traffic and enforces contracts at the edge."],
  ["Scheduler", "Places and rebalances workloads across the fleet."],
  ["Registry", "Source of truth for services, versions and owners."],
  ["Orchestrator", "Coordinates multi-step workflows and retries."],
  ["Collector", "Fans in telemetry from every runtime."],
  ["Policy Engine", "Evaluates rules before an action is allowed."],
  ["Sync Worker", "Reconciles desired and observed state."],
  ["Query Service", "Serves low-latency reads over the shared store."],
];

const MODULES = [
  ["Authentication", "Verifies who is asking, on which device, under which plan."],
  ["Request Handler", "Normalizes, validates and routes inbound requests."],
  ["Error Handler", "Maps internal failures to client-safe errors."],
  ["Rate Limiter", "Per-device and per-account token bucket enforcement."],
  ["Persistence", "Repository layer over the primary datastore."],
  ["Instrumentation", "Latency, saturation and failure metrics."],
  ["Cache Layer", "Read-through caching with invalidation hooks."],
  ["Config Loader", "Resolves layered configuration at boot."],
];

const FILES: [string, string, string[], string[]][] = [
  ["Handler", "Entry point for inbound calls.", ["Handler"], ["handle()", "dispatch()", "close()"]],
  ["Controller", "Coordinates the use case.", ["Controller"], ["execute()", "validate()"]],
  ["Service", "Business rules for this module.", ["Service"], ["run()", "resolve()", "retry()"]],
  ["Repository", "Datastore access.", ["Repository"], ["get()", "put()", "list()", "evict()"]],
  ["Validator", "Schema and invariant checks.", ["Validator"], ["validate()", "assertShape()"]],
  ["Client", "Outbound calls to peers.", ["Client"], ["send()", "withRetry()"]],
  ["Metrics", "Instrumentation hooks.", ["Meter"], ["observe()", "increment()"]],
];

const TEAMS = [
  "@platform",
  "@identity-core",
  "@edge",
  "@data-eng",
  "@payments",
  "@sre",
  "@api-guild",
  "@security",
];

const PEOPLE = ["m.raines", "s.okafor", "l.chen", "a.iyer", "d.novak", "r.silva", "k.tanaka"];

const WHEN = ["2d ago", "5d ago", "1w ago", "3w ago", "2mo ago", "5mo ago"];

const WHAT = [
  "Add ES256 key rotation window",
  "Cache lookups for 5m",
  "Drop legacy fallback path",
  "Return typed error codes",
  "Shard by device family",
  "Backfill missing indexes",
  "Reduce p99 by batching writes",
];

const LANGS = ["TypeScript", "Go", "Kotlin", "Python", "Rust"];

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

function blastFor(r: () => number, kind: NodeKind): BlastRadius {
  const scale: Record<NodeKind, number> = {
    org: 1,
    domain: 220,
    capability: 60,
    service: 18,
    module: 6,
    file: 2,
  };
  const s = scale[kind];
  const services = Math.max(1, Math.round(s * (0.6 + r())));
  const modules = services * between(r, 3, 7);
  const files = modules * between(r, 4, 9);
  const teams = Math.max(1, Math.round(services / between(r, 2, 6)));
  const level =
    services > 80
      ? "Critical"
      : services > 20
        ? "High"
        : services > 6
          ? "Moderate"
          : ("Low" as const);
  return { services, modules, files, teams, level: level as BlastRadius["level"] };
}

function titleCaseSlug(s: string) {
  return s
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function makeNode(
  parentId: string,
  kind: NodeKind,
  label: string,
  summary: string,
  index: number,
  siblings: string[],
): GraphNode {
  const id = `${parentId}/${kind}:${label}`;
  const r = rng(id);
  const peers = siblings.filter((s) => s !== label);
  const node: GraphNode = {
    id,
    label,
    kind,
    summary,
    owners: sample(r, TEAMS, between(r, 1, 2)),
    dependencies: sample(r, peers, Math.min(peers.length, between(r, 1, 3))),
    dependents: sample(r, peers, Math.min(peers.length, between(r, 1, 3))),
    blast: blastFor(r, kind),
    expandable: kind !== "file",
  };
  if (kind === "file") {
    node.detail = fileDetail(label, index, r);
  } else {
    node.metrics = [
      { label: CHILD_LABEL[kind], value: String(between(r, 5, 9)) },
      { label: "Coverage", value: `${between(r, 62, 96)}%` },
      { label: "p99", value: `${between(r, 12, 240)}ms` },
    ];
  }
  return node;
}

const CHILD_LABEL: Record<NodeKind, string> = {
  org: "Domains",
  domain: "Capabilities",
  capability: "Services",
  service: "Modules",
  module: "Files",
  file: "Symbols",
};

function fileDetail(label: string, index: number, r: () => number): FileDetail {
  const base = FILES[index % FILES.length]!;
  return {
    path: `src/${label.replace(/\.[a-z]+$/, "").toLowerCase()}/${label}`,
    language: pick(r, LANGS),
    loc: between(r, 84, 620),
    classes: base[2].map((c) => `${c}`),
    functions: base[3],
    tests: [`${label.replace(/\.[a-z]+$/, "")}.spec — ${between(r, 4, 28)} cases`],
    history: sample(r, WHEN, 3)
      .sort()
      .map((when) => ({ when, who: pick(r, PEOPLE), what: pick(r, WHAT) })),
  };
}

function poolFor(kind: NodeKind): [string, string][] {
  switch (kind) {
    case "domain":
      return DOMAINS as [string, string][];
    case "capability":
      return CAPABILITIES as [string, string][];
    case "service":
      return SERVICES as [string, string][];
    case "module":
      return MODULES as [string, string][];
    default:
      return [];
  }
}

const cache = new Map<string, GraphNode[]>();

/** Lazily generates (and memoizes) the children of any node. */
export function childrenOf(node: GraphNode): GraphNode[] {
  if (!node.expandable) return [];
  const hit = cache.get(node.id);
  if (hit) return hit;

  const kind = CHILD_KIND[node.kind];
  const r = rng(`${node.id}#children`);

  let entries: [string, string][];
  if (kind === "file") {
    const prefix = node.label.split(" ")[0] ?? "Core";
    entries = sample(r, FILES, between(r, 4, 6)).map(
      (f) => [`${prefix}${f[0]}.ts`, f[1]] as [string, string],
    );
  } else if (node.kind === "org") {
    entries = DOMAINS as [string, string][];
  } else {
    const pool = poolFor(kind);
    const chosen = sample(r, pool, between(r, 5, 7));
    const qualifier = node.label.split(" ")[0];
    entries = chosen.map(([n, s]) => [`${qualifier} ${n}`, s] as [string, string]);
  }

  const labels = entries.map((e) => e[0]);
  const built = entries.map(([label, summary], i) =>
    makeNode(node.id, kind, label, summary, i, labels),
  );
  cache.set(node.id, built);
  return built;
}

/** Root node for any connected organization. */
export function buildOrg(slug: string): GraphNode {
  const name = titleCaseSlug(slug || "acme");
  const r = rng(`org:${slug}`);
  return {
    id: `org:${slug}`,
    label: name,
    kind: "org",
    summary: `${DOMAINS.length} core domains discovered across ${between(r, 120, 1800).toLocaleString()} repositories.`,
    owners: sample(r, TEAMS, 2),
    dependencies: [],
    dependents: [],
    blast: blastFor(r, "org"),
    expandable: true,
    metrics: [
      { label: "Repos", value: between(r, 120, 1800).toLocaleString() },
      { label: "Services", value: between(r, 400, 4000).toLocaleString() },
      { label: "Domains", value: String(DOMAINS.length) },
    ],
  };
}

export function getOrg(slug: string): GraphNode {
  return buildOrg(slug);
}

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
