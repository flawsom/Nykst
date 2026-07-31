export type NodeKind = "org" | "domain" | "capability" | "service" | "module" | "file";

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  summary: string;
  metrics?: { label: string; value: string }[];
  children?: GraphNode[];
  detail?: FileDetail;
}

export interface FileDetail {
  path: string;
  language: string;
  loc: number;
  classes: string[];
  functions: string[];
  dependencies: string[];
  tests: string[];
  history: { when: string; who: string; what: string }[];
  owners: string[];
}

const f = (
  label: string,
  summary: string,
  detail: Omit<FileDetail, "path">,
  path: string,
): GraphNode => ({
  id: path,
  label,
  kind: "file",
  summary,
  detail: { path, ...detail },
});

const authFiles: GraphNode[] = [
  f(
    "JWTHandler.ts",
    "Signs, rotates and verifies playback JWTs.",
    {
      language: "TypeScript",
      loc: 412,
      classes: ["JWTHandler", "KeyRing"],
      functions: ["sign()", "verify()", "rotateKeys()", "decodeUnsafe()", "isExpired()"],
      dependencies: ["jose", "SessionStore.ts", "config/keys", "TokenValidator.ts"],
      tests: ["JWTHandler.spec.ts — 24 cases", "keyRotation.integration.ts — 6 cases"],
      history: [
        { when: "2d ago", who: "m.raines", what: "Add ES256 key rotation window" },
        { when: "3w ago", who: "s.okafor", what: "Cache JWKS lookups for 5m" },
        { when: "2mo ago", who: "l.chen", what: "Drop legacy HS256 fallback" },
      ],
      owners: ["@identity-core", "m.raines"],
    },
    "src/auth/JWTHandler.ts",
  ),
  f(
    "AuthController.ts",
    "Entry point for playback auth requests.",
    {
      language: "TypeScript",
      loc: 268,
      classes: ["AuthController"],
      functions: ["authorize()", "refresh()", "revoke()"],
      dependencies: ["JWTHandler.ts", "AuthMiddleware.ts", "SessionStore.ts"],
      tests: ["AuthController.spec.ts — 18 cases"],
      history: [{ when: "5d ago", who: "a.iyer", what: "Return 403 detail codes" }],
      owners: ["@identity-core"],
    },
    "src/auth/AuthController.ts",
  ),
  f(
    "TokenValidator.ts",
    "Validates opaque and bearer tokens at the edge.",
    {
      language: "TypeScript",
      loc: 190,
      classes: ["TokenValidator"],
      functions: ["validate()", "introspect()"],
      dependencies: ["JWTHandler.ts", "redis"],
      tests: ["TokenValidator.spec.ts — 11 cases"],
      history: [{ when: "1w ago", who: "s.okafor", what: "Add introspection cache" }],
      owners: ["@identity-core"],
    },
    "src/auth/TokenValidator.ts",
  ),
  f(
    "SessionStore.ts",
    "Distributed session persistence for devices.",
    {
      language: "TypeScript",
      loc: 331,
      classes: ["SessionStore", "SessionRecord"],
      functions: ["get()", "put()", "evict()", "listByUser()"],
      dependencies: ["redis", "metrics"],
      tests: ["SessionStore.spec.ts — 15 cases"],
      history: [{ when: "4d ago", who: "l.chen", what: "Shard by device family" }],
      owners: ["@identity-core", "@platform"],
    },
    "src/auth/SessionStore.ts",
  ),
  f(
    "AuthMiddleware.ts",
    "Request pipeline guard for playback routes.",
    {
      language: "TypeScript",
      loc: 144,
      classes: ["AuthMiddleware"],
      functions: ["handle()", "attachPrincipal()"],
      dependencies: ["TokenValidator.ts", "logging"],
      tests: ["AuthMiddleware.spec.ts — 9 cases"],
      history: [{ when: "3w ago", who: "a.iyer", what: "Skip auth on health probes" }],
      owners: ["@identity-core"],
    },
    "src/auth/AuthMiddleware.ts",
  ),
];

const leaf = (label: string, summary: string, kind: NodeKind): GraphNode => ({
  id: `${kind}:${label}`,
  label,
  kind,
  summary,
});

const playbackApiModules: GraphNode[] = [
  {
    id: "module:authentication",
    label: "Authentication",
    kind: "module",
    summary: "Verifies who is asking for a stream, on which device, under which plan.",
    metrics: [
      { label: "Files", value: "5" },
      { label: "Coverage", value: "91%" },
      { label: "Owners", value: "identity-core" },
    ],
    children: authFiles,
  },
  leaf("Request Handler", "Normalizes, validates and routes inbound playback requests.", "module"),
  leaf("Video Handler", "Resolves manifests and stream variants for a title.", "module"),
  leaf("Error Handler", "Maps internal failures to client-safe playback errors.", "module"),
  leaf("Rate Limiter", "Per-device and per-account token bucket enforcement.", "module"),
  leaf("Logging", "Structured request logging with trace propagation.", "module"),
  leaf("Metrics", "Latency, start-time and failure instrumentation.", "module"),
];

const playbackServices: GraphNode[] = [
  {
    id: "service:playback-api",
    label: "Playback API",
    kind: "service",
    summary: "Public surface that authorizes and starts every playback session.",
    metrics: [
      { label: "Modules", value: "7" },
      { label: "p99", value: "84ms" },
      { label: "RPS", value: "412k" },
    ],
    children: playbackApiModules,
  },
  leaf("DRM Service", "License issuance and key delivery per device class.", "service"),
  leaf("Session Manager", "Tracks concurrent streams and resume positions.", "service"),
  leaf("Subtitle Service", "Timed-text selection, rendering hints and fallbacks.", "service"),
  leaf("Audio Service", "Audio track negotiation and loudness normalization.", "service"),
  leaf("Device Compatibility", "Capability matrix across TVs, mobile and browsers.", "service"),
  leaf("Playback Telemetry", "QoE events, rebuffer ratio and start-time reporting.", "service"),
];

const contentCapabilities: GraphNode[] = [
  {
    id: "cap:playback",
    label: "Playback",
    kind: "capability",
    summary: "Everything required to turn a title into a playing stream on a device.",
    metrics: [
      { label: "Services", value: "7" },
      { label: "Repos", value: "23" },
      { label: "Health", value: "Good" },
    ],
    children: playbackServices,
  },
  leaf("Video Encoding", "Ladder generation, per-title encoding and QC pipelines.", "capability"),
  leaf("Video Storage", "Durable object storage of masters and encoded renditions.", "capability"),
  leaf("CDN Routing", "Steering viewers to the optimal edge location.", "capability"),
  leaf("Bandwidth Optimization", "Adaptive bitrate policy and network probing.", "capability"),
  leaf("Edge Cache", "Open Connect cache fill and eviction strategy.", "capability"),
  leaf("Quality Selection", "Per-session quality ladder and device constraints.", "capability"),
];

export const netflixGraph: GraphNode = {
  id: "org:netflix",
  label: "Netflix",
  kind: "org",
  summary: "9 core domains discovered across 1,284 repositories.",
  metrics: [
    { label: "Repos", value: "1,284" },
    { label: "Services", value: "3,918" },
    { label: "Domains", value: "9" },
  ],
  children: [
    {
      id: "domain:content-delivery",
      label: "Content Delivery",
      kind: "domain",
      summary:
        "Moving encoded video from origin to the viewer's screen with the least possible latency.",
      metrics: [
        { label: "Capabilities", value: "7" },
        { label: "Repos", value: "214" },
        { label: "Owners", value: "11 teams" },
      ],
      children: contentCapabilities,
    },
    leaf("Streaming", "Live and on-demand stream orchestration.", "domain"),
    leaf("Recommendation", "Ranking, personalization and row generation.", "domain"),
    leaf("Billing", "Plans, invoicing, dunning and tax.", "domain"),
    leaf("User Identity", "Accounts, profiles, devices and entitlements.", "domain"),
    leaf("Search", "Catalog indexing, query understanding and ranking.", "domain"),
    leaf("Advertising", "Ad decisioning, pacing and measurement.", "domain"),
    leaf("Analytics", "Event pipelines, warehouses and experimentation.", "domain"),
    leaf("Platform Engineering", "Runtime, CI/CD, observability and paved roads.", "domain"),
  ],
};

export const stripeGraph: GraphNode = {
  id: "org:stripe",
  label: "Stripe",
  kind: "org",
  summary: "8 core domains discovered across 942 repositories.",
  metrics: [
    { label: "Repos", value: "942" },
    { label: "Services", value: "2,610" },
    { label: "Domains", value: "8" },
  ],
  children: [
    leaf("Payments", "Charges, intents, methods and settlement.", "domain"),
    leaf("Checkout", "Hosted and embedded payment surfaces.", "domain"),
    leaf("Billing", "Subscriptions, metering, invoicing and revenue.", "domain"),
    leaf("Identity", "KYC, verification and account onboarding.", "domain"),
    leaf("Radar", "Fraud signals, rules engine and risk scoring.", "domain"),
    leaf("Treasury", "Balances, payouts and money movement.", "domain"),
    leaf("Connect", "Multi-party platforms and marketplaces.", "domain"),
    leaf("API Platform", "Gateways, SDK generation and versioning.", "domain"),
  ],
};

export const ORGS = {
  netflix: netflixGraph,
  stripe: stripeGraph,
} satisfies Record<string, GraphNode>;

export type OrgKey = keyof typeof ORGS;

export function getOrg(key: string): GraphNode {
  return (ORGS as Record<string, GraphNode>)[key] ?? ORGS.netflix;
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
  domain: "What this domain does",
  capability: "Services",
  service: "Modules",
  module: "Files",
  file: "Structure",
};

export function findPath(root: GraphNode, id: string): GraphNode[] | null {
  if (root.id === id) return [root];
  for (const child of root.children ?? []) {
    const sub = findPath(child, id);
    if (sub) return [root, ...sub];
  }
  return null;
}
