import { indexAnalysis } from "./impact";
import type { RepoAnalysis } from "./types";

/**
 * Overlays OpenTelemetry spans onto the static import graph.
 *
 * The overlay is evidence-only: a span is attached to a file when its
 * `code.filepath` matches exactly, or when exactly one analyzed path ends with
 * the reported path. Everything else is reported as unmatched. No route,
 * service or namespace is guessed onto a file.
 */

export const MAX_SPANS = 20_000;

export interface NormalizedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service?: string;
  startMs: number;
  durationMs: number;
  status: "ok" | "error" | "unset";
  filePath?: string;
  functionName?: string;
  route?: string;
  dbSystem?: string;
  peerService?: string;
}

export interface TelemetryFile {
  path: string;
  spans: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  totalMs: number;
  routes: string[];
  observedDependents: number;
  staticDependents: number;
}

export interface TelemetryEdge {
  from: string;
  to: string;
  calls: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  static: boolean;
}

export interface TelemetryOverlay {
  spans: number;
  matchedSpans: number;
  coverage: number;
  files: TelemetryFile[];
  edges: TelemetryEdge[];
  unmatchedFiles: { filePath: string; spans: number }[];
  limitations: string[];
}

type Attributes = Record<string, unknown>;

function asRecord(value: unknown): Attributes | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Attributes) : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Decodes an OTLP AnyValue into a primitive, or a JSON string for lists/maps. */
function decodeAnyValue(value: unknown): string | number | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  const record = asRecord(value);
  if (!record) return undefined;
  const stringValue = text(record["stringValue"]);
  if (stringValue !== undefined) return stringValue;
  const intValue = numberValue(record["intValue"]);
  if (intValue !== undefined) return intValue;
  const doubleValue = numberValue(record["doubleValue"]);
  if (doubleValue !== undefined) return doubleValue;
  if (typeof record["boolValue"] === "boolean") return record["boolValue"];
  if (record["arrayValue"] !== undefined || record["kvlistValue"] !== undefined)
    return JSON.stringify(record["arrayValue"] ?? record["kvlistValue"]);
  return undefined;
}

function decodeAttributes(value: unknown): Attributes {
  const attributes: Attributes = {};
  if (Array.isArray(value)) {
    for (const entry of value) {
      const item = asRecord(entry);
      const key = text(item?.["key"]);
      if (!key) continue;
      const decoded = decodeAnyValue(item?.["value"]);
      if (decoded !== undefined) attributes[key] = decoded;
    }
    return attributes;
  }
  const record = asRecord(value);
  if (!record) return attributes;
  for (const [key, raw] of Object.entries(record)) {
    if (key === "value") continue;
    const decoded = decodeAnyValue(raw);
    if (decoded !== undefined) attributes[key] = decoded;
  }
  return attributes;
}

function firstText(attributes: Attributes, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = text(attributes[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    // Unix nanoseconds are far larger than the millisecond range. Divide with BigInt
    // when possible so a 15 ns span does not inherit float rounding.
    if (numeric > 1e14 && /^\d+$/.test(trimmed)) return Number(BigInt(trimmed) / 1_000_000n);
    return numeric > 1e14 ? numeric / 1e6 : numeric;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function durationMsFromSpan(span: Attributes): number | undefined {
  const start = timestampMs(
    span["startTimeUnixNano"] ?? span["startTime"] ?? span["startMs"] ?? span["start_time"],
  );
  const end = timestampMs(
    span["endTimeUnixNano"] ?? span["endTime"] ?? span["endTimeMs"] ?? span["end_time"],
  );
  if (start !== undefined && end !== undefined) return end - start;
  const duration =
    numberValue(span["durationMs"]) ??
    numberValue(span["duration_ms"]) ??
    numberValue(span["duration"]);
  if (duration !== undefined) return duration;
  const durationNano = numberValue(span["durationNano"]) ?? numberValue(span["durationNanos"]);
  if (durationNano !== undefined) return durationNano / 1e6;
  return undefined;
}

function routeOf(attributes: Attributes): string | undefined {
  const route = firstText(attributes, ["http.route", "url.path", "http.target", "http.path"]);
  if (route) return route;
  const url = text(attributes["http.url"]);
  if (!url) return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

function statusOf(span: Attributes, attributes: Attributes): NormalizedSpan["status"] {
  const status = asRecord(span["status"]);
  const code = status?.["code"] ?? span["statusCode"] ?? span["status_code"];
  const codeText = typeof code === "string" ? code.toUpperCase() : "";
  if (code === 2 || codeText.includes("ERROR")) return "error";
  if (code === 1 || codeText.includes("OK")) return "ok";
  const error = attributes["error"];
  if (error === true || error === "true") return "error";
  return "unset";
}

function flattenSpans(input: unknown): { span: Attributes; resource: Attributes }[] {
  const record = asRecord(input);
  if (record && Array.isArray(record["resourceSpans"])) {
    const out: { span: Attributes; resource: Attributes }[] = [];
    for (const resourceEntry of record["resourceSpans"]) {
      const resourceSpan = asRecord(resourceEntry);
      if (!resourceSpan) continue;
      const resource = asRecord(resourceSpan["resource"]);
      const resourceAttributes = decodeAttributes(resource?.["attributes"]);
      const scopes = Array.isArray(resourceSpan["scopeSpans"])
        ? resourceSpan["scopeSpans"]
        : Array.isArray(resourceSpan["instrumentationLibrarySpans"])
          ? resourceSpan["instrumentationLibrarySpans"]
          : [];
      for (const scopeEntry of scopes) {
        const scopeSpan = asRecord(scopeEntry);
        if (!scopeSpan || !Array.isArray(scopeSpan["spans"])) continue;
        for (const spanEntry of scopeSpan["spans"]) {
          const span = asRecord(spanEntry);
          if (span) out.push({ span, resource: resourceAttributes });
        }
      }
    }
    return out;
  }
  if (Array.isArray(input))
    return input.flatMap((entry) => {
      const span = asRecord(entry);
      return span ? [{ span, resource: {} }] : [];
    });
  return [];
}

export function parseOtlpSpans(input: unknown): NormalizedSpan[] {
  const flattened = flattenSpans(input);
  const spans: NormalizedSpan[] = [];
  for (const { span, resource } of flattened) {
    if (spans.length >= MAX_SPANS) break;
    const spanId = text(span["spanId"] ?? span["span_id"] ?? span["id"]);
    if (!spanId) continue;
    const durationMs = durationMsFromSpan(span);
    if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) continue;
    const attributes = {
      ...resource,
      ...decodeAttributes(span["attributes"]),
    };
    const startMs =
      timestampMs(
        span["startTimeUnixNano"] ?? span["startTime"] ?? span["startMs"] ?? span["start_time"],
      ) ?? 0;
    const status = statusOf(span, attributes);
    const route = routeOf(attributes);
    const filePath = firstText(attributes, [
      "code.filepath",
      "code.path",
      "code.file",
      "file.path",
    ]);
    const functionName =
      firstText(attributes, ["code.function", "code.function.name", "code.functionName"]) ??
      undefined;
    const service = firstText(attributes, ["service.name", "service"]);
    const dbSystem = firstText(attributes, ["db.system", "db.system.name"]);
    const peerService = firstText(attributes, ["peer.service", "peer.service.name"]);
    const name = text(span["name"] ?? span["spanName"]) ?? "unnamed";
    const traceId = text(span["traceId"] ?? span["trace_id"]) ?? "";
    const parentSpanId = text(span["parentSpanId"] ?? span["parent_span_id"]);
    spans.push({
      traceId,
      spanId,
      ...(parentSpanId ? { parentSpanId } : {}),
      name,
      ...(service ? { service } : {}),
      startMs,
      durationMs,
      status,
      ...(filePath ? { filePath } : {}),
      ...(functionName ? { functionName } : {}),
      ...(route ? { route } : {}),
      ...(dbSystem ? { dbSystem } : {}),
      ...(peerService ? { peerService } : {}),
    });
  }
  return spans;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Nearest-rank percentile over an already sorted ascending list. */
function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return 0;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

function summary(durations: number[]) {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    totalMs: round(durations.reduce((sum, value) => sum + value, 0)),
  };
}

function cleanPath(value: string) {
  return value.replace(/^\.?\//, "").replace(/\\/g, "/");
}

function makeFileMatcher(analysis: RepoAnalysis) {
  const paths = new Set(analysis.files.map((file) => file.path));
  const cache = new Map<string, string | null>();
  return (raw: string): string | null => {
    const clean = cleanPath(raw);
    if (!clean) return null;
    if (cache.has(clean)) return cache.get(clean)!;
    let match: string | null = paths.has(clean) ? clean : null;
    if (!match) {
      // Walk up the reported path until exactly one analyzed file ends with it.
      // Ambiguous suffixes stay unmatched instead of being guessed.
      let tail = clean;
      while (!match) {
        const slash = tail.indexOf("/");
        if (slash === -1) break;
        tail = tail.slice(slash + 1);
        const candidates = analysis.files
          .map((file) => file.path)
          .filter((path) => path.endsWith(`/${tail}`));
        if (candidates.length === 1) match = candidates[0]!;
      }
    }
    cache.set(clean, match);
    return match;
  };
}

export function overlayTelemetry(
  analysis: RepoAnalysis,
  spans: NormalizedSpan[],
): TelemetryOverlay {
  const index = indexAnalysis(analysis);
  const matchFile = makeFileMatcher(analysis);
  const spanById = new Map(spans.map((span) => [span.spanId, span]));
  const unmatchedCounts = new Map<string, number>();
  const fileSamples = new Map<
    string,
    {
      durations: number[];
      errors: number;
      routes: Set<string>;
      callers: Set<string>;
    }
  >();
  let matchedSpans = 0;

  const resolved = new Map<string, string | null>();
  for (const span of spans) {
    if (!span.filePath) continue;
    const path = matchFile(span.filePath);
    resolved.set(span.spanId, path);
    if (!path) {
      const key = cleanPath(span.filePath);
      unmatchedCounts.set(key, (unmatchedCounts.get(key) ?? 0) + 1);
      continue;
    }
    matchedSpans += 1;
    const sample = fileSamples.get(path) ?? {
      durations: [],
      errors: 0,
      routes: new Set<string>(),
      callers: new Set<string>(),
    };
    sample.durations.push(span.durationMs);
    if (span.status === "error") sample.errors += 1;
    if (span.route) sample.routes.add(span.route);
    fileSamples.set(path, sample);
    const parent = span.parentSpanId ? spanById.get(span.parentSpanId) : undefined;
    if (parent?.filePath) {
      const parentPath = resolved.get(parent.spanId) ?? matchFile(parent.filePath);
      resolved.set(parent.spanId, parentPath);
      if (parentPath) sample.callers.add(parentPath);
    }
  }

  const files: TelemetryFile[] = [...fileSamples.entries()]
    .map(([path, sample]) => ({
      path,
      spans: sample.durations.length,
      errors: sample.errors,
      ...summary(sample.durations),
      routes: [...sample.routes].sort(),
      observedDependents: sample.callers.size,
      staticDependents: new Set((index.dependents.get(path) ?? []).map((edge) => edge.path)).size,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const edgeSamples = new Map<
    string,
    { from: string; to: string; durations: number[]; errors: number }
  >();
  for (const span of spans) {
    if (!span.parentSpanId) continue;
    const parent = spanById.get(span.parentSpanId);
    if (!parent) continue;
    const from =
      resolved.get(parent.spanId) ?? (parent.filePath ? matchFile(parent.filePath) : null);
    const to = resolved.get(span.spanId) ?? (span.filePath ? matchFile(span.filePath) : null);
    if (!from || !to) continue;
    const key = `${from}\u0000${to}`;
    const sample = edgeSamples.get(key) ?? { from, to, durations: [], errors: 0 };
    sample.durations.push(span.durationMs);
    if (span.status === "error") sample.errors += 1;
    edgeSamples.set(key, sample);
  }

  const edges: TelemetryEdge[] = [...edgeSamples.values()]
    .map((sample) => ({
      from: sample.from,
      to: sample.to,
      calls: sample.durations.length,
      errors: sample.errors,
      p50Ms: summary(sample.durations).p50Ms,
      p95Ms: summary(sample.durations).p95Ms,
      static: (index.dependencies.get(sample.from) ?? []).some((edge) => edge.path === sample.to),
    }))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const limitations = [
    "Only spans with code.filepath (or an unambiguous path suffix) are overlaid; spans without a file stay unmatched.",
    "Observed edges use parent-child span pairs and require both spans to resolve to analyzed files.",
    "Route-only and service-only spans are reported as coverage gaps and are never guessed onto a file.",
  ];
  if (spans.length >= MAX_SPANS)
    limitations.push(
      `Input was capped at ${MAX_SPANS.toLocaleString("en-US")} spans; later spans were ignored.`,
    );
  if (!spans.length)
    limitations.push("No spans were supplied, so there is no runtime evidence to overlay.");

  return {
    spans: spans.length,
    matchedSpans,
    coverage: spans.length ? round(matchedSpans / spans.length) : 0,
    files,
    edges,
    unmatchedFiles: [...unmatchedCounts.entries()]
      .map(([filePath, count]) => ({ filePath, spans: count }))
      .sort((a, b) => b.spans - a.spans || a.filePath.localeCompare(b.filePath)),
    limitations,
  };
}
