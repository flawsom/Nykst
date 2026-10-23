/**
 * Visual read-outs for the two evidence-overlay MCP tools.
 *
 * Both panels render only when the response has the shape of that tool, so a
 * stale response from the previously selected tool never shows the wrong panel.
 */

export interface TraceOverlayResult {
  repository?: string;
  commit?: string;
  spans: number;
  matchedSpans: number;
  coverage: number;
  files: Array<{
    path: string;
    spans: number;
    errors: number;
    p50Ms: number;
    p95Ms: number;
    observedDependents: number;
    staticDependents: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    calls: number;
    errors: number;
    p50Ms: number;
    p95Ms: number;
    static: boolean;
  }>;
  unmatchedFiles?: Array<{ filePath: string; spans: number }>;
  limitations?: string[];
}

export interface FederationResult {
  repositories?: number | Array<{ repository: string; analyzed_at?: string }>;
  operations: number;
  services: number;
  edges: Array<{
    fromRepository: string;
    fromPath: string;
    line: number;
    toRepository: string;
    operationId: string;
    protocol: string;
    matchedBy: string;
  }>;
  unmatchedEndpoints?: number;
  limitations?: string[];
}

export function isTraceOverlayResult(value: unknown): value is TraceOverlayResult {
  const record = value as Partial<TraceOverlayResult> | null;
  return (
    !!record &&
    typeof record.spans === "number" &&
    typeof record.matchedSpans === "number" &&
    typeof record.coverage === "number" &&
    Array.isArray(record.files) &&
    Array.isArray(record.edges)
  );
}

export function isFederationResult(value: unknown): value is FederationResult {
  const record = value as Partial<FederationResult> | null;
  return (
    !!record &&
    typeof record.operations === "number" &&
    typeof record.services === "number" &&
    Array.isArray(record.edges) &&
    (Array.isArray(record.repositories) || typeof record.repositories === "number")
  );
}

function Chip({
  children,
  tone = "primary",
}: {
  children: React.ReactNode;
  tone?: "primary" | "muted";
}) {
  return (
    <span
      className={
        tone === "primary"
          ? "border-primary/30 bg-primary/10 text-primary rounded-full border px-2 py-0.5 font-mono text-[10px]"
          : "border-border bg-card text-muted-foreground rounded-full border px-2 py-0.5 font-mono text-[10px]"
      }
    >
      {children}
    </span>
  );
}

export function TraceOverlayPanel({ result, testId }: { result: unknown; testId: string }) {
  if (!isTraceOverlayResult(result)) return null;
  const percent = Math.round(result.coverage * 100);
  return (
    <section
      data-testid={testId}
      className="border-primary/30 bg-card/90 space-y-3 rounded-2xl border p-4 shadow-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-primary font-mono text-[10px] tracking-[0.2em] uppercase">
            OTLP Runtime Trace Overlay
          </span>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {result.repository ?? "repository"} · {result.commit ?? "unknown commit"} · matched
            against the compiled import graph
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip>{result.spans} spans</Chip>
          <Chip>{result.matchedSpans} matched</Chip>
          <Chip tone={percent === 100 ? "primary" : "muted"}>{percent}% coverage</Chip>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.18em]">
            Observed files ({result.files.length})
          </p>
          <ul className="space-y-1">
            {result.files.map((file) => (
              <li
                key={file.path}
                className="border-border bg-surface/70 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 font-mono text-[10px]"
              >
                <span className="text-foreground truncate">{file.path}</span>
                <span className="text-muted-foreground">
                  p95 {file.p95Ms}ms · {file.spans} span{file.spans === 1 ? "" : "s"} ·{" "}
                  <span className={file.errors ? "text-red-300" : "text-emerald-300"}>
                    {file.errors} err
                  </span>{" "}
                  · {file.staticDependents} static dep
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5">
          <p className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.18em]">
            Observed call edges ({result.edges.length})
          </p>
          <ul className="space-y-1">
            {result.edges.map((edge) => (
              <li
                key={`${edge.from}->${edge.to}`}
                className="border-border bg-surface/70 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 font-mono text-[10px]"
              >
                <span className="text-foreground truncate">
                  {edge.from} → {edge.to}
                </span>
                <span className="text-muted-foreground">
                  {edge.calls} call{edge.calls === 1 ? "" : "s"} · p95 {edge.p95Ms}ms ·{" "}
                  <span className={edge.static ? "text-primary" : "text-amber-300"}>
                    {edge.static ? "static" : "observed only"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {result.unmatchedFiles?.length ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-[10px] text-amber-300">
          Unmatched:{" "}
          {result.unmatchedFiles.map((item) => `${item.filePath} (${item.spans})`).join(", ")}
        </p>
      ) : null}
    </section>
  );
}

export function FederationPanel({ result, testId }: { result: unknown; testId: string }) {
  if (!isFederationResult(result)) return null;
  const repositories = Array.isArray(result.repositories)
    ? result.repositories.length
    : (result.repositories ?? 0);
  return (
    <section
      data-testid={testId}
      className="border-primary/30 bg-card/90 space-y-3 rounded-2xl border p-4 shadow-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-primary font-mono text-[10px] tracking-[0.2em] uppercase">
            Cross-Repository Contract Federation
          </span>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Literal call sites bound to OpenAPI operations and gRPC methods, segment by segment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip>{repositories} repositories</Chip>
          <Chip>{result.operations} operations</Chip>
          <Chip>{result.services} gRPC services</Chip>
          <Chip tone={result.edges.length ? "primary" : "muted"}>
            {result.edges.length} federated edges
          </Chip>
          <Chip tone="muted">{result.unmatchedEndpoints ?? 0} unmatched</Chip>
        </div>
      </div>

      {result.edges.length ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {result.edges.map((edge) => (
            <li
              key={`${edge.fromPath}:${edge.line}->${edge.toRepository}:${edge.operationId}`}
              className="border-border bg-surface/70 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 font-mono text-[10px]"
            >
              <span className="text-foreground truncate">
                {edge.fromPath}:{edge.line} → {edge.toRepository} · {edge.operationId}
              </span>
              <span className="text-muted-foreground">
                {edge.protocol} · <span className="text-primary">{edge.matchedBy}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-2 font-mono text-[10px]">
          No consumer call site matched a published contract yet.
        </p>
      )}

      {result.limitations?.length ? (
        <ul className="text-muted-foreground space-y-1 text-[10px] leading-relaxed">
          {result.limitations.map((limitation) => (
            <li key={limitation}>· {limitation}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
