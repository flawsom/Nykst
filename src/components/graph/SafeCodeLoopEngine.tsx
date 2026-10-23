import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  FileCode2,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  DEFAULT_LOOP_SCENARIO,
  LOOP_SCENARIOS,
  LOOP_STAGES,
  extractGeneratedCode,
  formatDuration,
  type LoopRun,
  type LoopScenarioId,
} from "@/lib/loop";
import { cn } from "@/lib/utils";
import type { CodeTarget } from "@/components/graph/CodeProblemInspector";

/**
 * The four-stage closed-loop safe-coding engine.
 *
 * Stage 1 is assembled from the live AST (signatures, importers, SQL lineage,
 * six memory layers), Stage 2 is a real edit of the real file, Stage 3 is the
 * server's in-memory overlay and Stage 4 is the deterministic verdict with a
 * verified remediation diff. Every number on screen comes from the API.
 */
export function SafeCodeLoopEngine({
  repository,
  path: initialPath,
  onOpenCode,
  onVerdict,
  className,
}: {
  repository: string | null;
  path?: string | null;
  onOpenCode?: (target: CodeTarget) => void;
  onVerdict?: (verdict: "safe" | "breaking" | "simulating") => void;
  className?: string;
}) {
  const [path, setPath] = useState(initialPath ?? "src/lib/integrations/github.ts");
  const [pathDraft, setPathDraft] = useState(path);
  const [scenario, setScenario] = useState<LoopScenarioId>(DEFAULT_LOOP_SCENARIO);
  const [result, setResult] = useState<LoopRun | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ code: string | null; answer: string } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const verdictRef = useRef(onVerdict);
  verdictRef.current = onVerdict;

  const run = useCallback(
    async (overrides?: { scenario?: LoopScenarioId; content?: string; path?: string }) => {
      const targetPath = overrides?.path ?? path;
      const targetScenario = overrides?.scenario ?? scenario;
      const requestId = ++requestRef.current;
      setLoading(true);
      setError(null);
      verdictRef.current?.("simulating");
      try {
        const body: {
          path: string;
          tool: string;
          scenario: LoopScenarioId;
          repo?: string;
          content?: string;
        } = {
          path: targetPath,
          tool: "run_loop",
          scenario: targetScenario,
        };
        if (repository) body.repo = repository;
        if (overrides?.content !== undefined) body.content = overrides.content;
        const response = await fetch("/api/analysis/self", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          toolOutput?: LoopRun;
          path?: string;
          error?: string;
        };
        if (!response.ok || !payload.toolOutput)
          throw new Error(payload.error ?? `The loop failed (${response.status}).`);
        if (requestRef.current !== requestId) return;
        const next = payload.toolOutput;
        setResult(next);
        setPath(payload.path ?? targetPath);
        setPathDraft(payload.path ?? targetPath);
        setDraft(next.stage2.content);
        setScenario(next.stage2.scenario);
        verdictRef.current?.(next.stage4.verdict);
      } catch (cause) {
        if (requestRef.current !== requestId) return;
        setError(cause instanceof Error ? cause.message : "The loop failed.");
        verdictRef.current?.("breaking");
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    },
    [path, repository, scenario],
  );

  useEffect(() => {
    void run();
    // The loop re-runs when the workspace changes; later runs are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository]);

  useEffect(() => {
    if (!initialPath || initialPath === path) return;
    setPath(initialPath);
    setPathDraft(initialPath);
    void run({ path: initialPath });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPath]);

  const generate = async () => {
    if (!prompt.trim() || !result) return;
    setGenerating(true);
    setGenerateError(null);
    setGenerated(null);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: `${prompt.trim()}\n\nReturn the complete replacement contents of ${path} in one fenced code block.`,
          mode: "code",
          // Stage 1 is the whole point of the loop: the model sees the bounded
          // evidence envelope, not a blind repository scan.
          context: JSON.stringify({
            repository: result.repository,
            path,
            stage1: result.stage1,
          }),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
      };
      if (!response.ok || !payload.answer)
        throw new Error(payload.error ?? `Generation failed (${response.status}).`);
      setGenerated({ code: extractGeneratedCode(payload.answer), answer: payload.answer });
    } catch (cause) {
      setGenerateError(cause instanceof Error ? cause.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const applyHeal = () => {
    const healed = result?.stage4.heal?.healedContent;
    if (!healed) return;
    setDraft(healed);
    void run({ content: healed });
  };

  const copyCommand = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.stage4.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const open = (targetPath: string, line?: number | null, reason?: string) =>
    onOpenCode?.({
      repository: result?.repository ?? repository,
      path: targetPath,
      line: line ?? null,
      ...(reason ? { reason } : {}),
    });

  return (
    <section
      data-testid="safe-code-loop-engine"
      className={cn(
        "border-border bg-card/60 relative overflow-hidden rounded-2xl border",
        className,
      )}
    >
      <header className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <div className="text-primary flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase">
            <BrainCircuit className="size-3.5" /> Closed-loop safe-coding engine
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">
            Verify the change before it touches disk.
          </h3>
          <p className="text-muted-foreground mt-1 max-w-2xl text-xs leading-relaxed">
            Architecture and history first, then the edit, then an in-memory overlay of the real
            AST, SQL columns and runtime cycles, then an exact <code>file:line</code> verdict.
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <input
            value={pathDraft}
            onChange={(event) => setPathDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void run({ path: pathDraft.trim() });
            }}
            aria-label="Target file path"
            className="border-border bg-surface focus:border-primary w-56 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] outline-none sm:w-72"
          />
          <button
            type="button"
            onClick={() => void run({ path: pathDraft.trim() })}
            disabled={loading}
            className="border-border bg-surface hover:bg-surface-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Run loop
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-5 py-2.5 text-[11px] text-red-300">
          <AlertTriangle className="mr-1.5 inline size-3.5" /> {error}
        </div>
      )}

      {!result && loading && (
        <div className="text-muted-foreground flex items-center gap-2 px-5 py-10 font-mono text-[11px]">
          <Loader2 className="size-4 animate-spin" /> Compiling the architecture envelope…
        </div>
      )}

      {result && (
        <div className={cn("space-y-6 p-5", loading && "opacity-70")}>
          <Stage
            stage={1}
            icon={History}
            aside={`${result.stage1.finops.boundedTokens.toLocaleString("en-US")} ctx tokens · ${result.stage1.finops.reductionPct}% less`}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="border-border bg-surface/50 rounded-xl border p-3.5">
                <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                  Exported signatures · {result.stage1.file.role} · {result.stage1.file.loc} LOC
                </p>
                <div className="mt-2 space-y-1.5">
                  {result.stage1.symbols.length ? (
                    result.stage1.symbols.slice(0, 6).map((symbol) => (
                      <button
                        key={`${symbol.name}-${symbol.line}`}
                        type="button"
                        onClick={() => open(result.path, symbol.line, symbol.signature)}
                        className="border-border bg-card hover:border-primary/50 block w-full truncate rounded-lg border px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors"
                        title={`${symbol.signature} · ${symbol.minArity ?? 0}..${symbol.maxArity ?? 0} params`}
                      >
                        {symbol.signature}
                        <span className="text-muted-foreground ml-1.5 text-[10px]">
                          L{symbol.line}
                          {symbol.minArity !== null
                            ? ` · ${symbol.minArity}..${symbol.maxArity}`
                            : ""}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-[11px]">
                      This file exports no typed symbols; imports and SQL lineage still apply.
                    </p>
                  )}
                </div>
              </div>

              <div className="border-border bg-surface/50 rounded-xl border p-3.5">
                <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                  Hidden dependency surface
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Mini label="Direct importers" value={result.stage1.directImporters.length} />
                  <Mini label="Runtime dependents" value={result.stage1.transitive.runtime} />
                  <Mini label="Entrypoints" value={result.stage1.transitive.entrypoints.length} />
                  <Mini label="Covering tests" value={result.stage1.transitive.tests.length} />
                </div>
                <div className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1">
                  {result.stage1.directImporters.slice(0, 5).map((caller) => (
                    <button
                      key={`${caller.path}:${caller.line}`}
                      type="button"
                      data-testid="loop-caller-row"
                      onClick={() =>
                        open(
                          caller.path,
                          caller.line,
                          `Direct importer at line ${caller.line}: imports ${caller.imports}`,
                        )
                      }
                      className="text-muted-foreground hover:text-primary flex w-full items-center justify-between gap-2 font-mono text-[10px] transition-colors"
                    >
                      <span className="truncate">
                        {caller.path}:{caller.line}
                      </span>
                      <span className="shrink-0">{caller.typeOnly ? "type-only" : "runtime"}</span>
                    </button>
                  ))}
                  {!result.stage1.directImporters.length && (
                    <p className="text-muted-foreground text-[11px]">
                      No file imports this module yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="border-border bg-surface/50 rounded-xl border p-3.5">
                <p className="text-muted-foreground flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
                  <Database className="size-3" /> SQL tables & column contracts
                </p>
                <div className="mt-2 space-y-1.5">
                  {result.stage1.contracts.length ? (
                    result.stage1.contracts.slice(0, 4).map((contract) => (
                      <div key={contract.id} className="text-[11px]">
                        <button
                          type="button"
                          onClick={() =>
                            open(result.path, contract.line, `SQL contract for ${contract.id}`)
                          }
                          className="hover:text-primary font-mono transition-colors"
                        >
                          {contract.name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {contract.columns.length} columns · L{contract.line}
                          </span>
                        </button>
                        {contract.drift.map((finding) => (
                          <p key={finding.column} className="text-[10px] text-amber-300">
                            drift · {finding.column}: {finding.message}
                          </p>
                        ))}
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-[11px]">
                      No literal table or RPC reference in this file.
                    </p>
                  )}
                </div>
              </div>

              <div className="border-border bg-surface/50 rounded-xl border p-3.5">
                <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                  Six memory layers
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {result.stage1.memory.map((layer) => (
                    <div
                      key={layer.id}
                      className="border-border bg-card rounded-lg border px-2 py-1.5"
                      title={layer.detail || "No records in the analysed history"}
                    >
                      <p className="truncate text-[10px] font-medium">{layer.label}</p>
                      <p className="text-primary font-mono text-[11px]">{layer.count}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              data-testid="loop-finops-meter"
              className="border-primary/25 bg-primary/5 mt-4 rounded-xl border p-3.5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold">
                  Bounded evidence{" "}
                  <span className="text-primary">
                    {result.stage1.finops.boundedTokens.toLocaleString("en-US")} tokens
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ({(result.stage1.finops.boundedBytes / 1024).toFixed(1)} kB)
                  </span>{" "}
                  vs blind full-repository scan{" "}
                  <span className="font-mono">
                    {result.stage1.finops.blindTokens.toLocaleString("en-US")} tokens
                  </span>
                </p>
                <span className="text-primary font-mono text-sm font-semibold">
                  {result.stage1.finops.reductionPct}% reduction
                </span>
              </div>
              <div className="bg-surface-2 mt-2 h-1.5 overflow-hidden rounded-full">
                <div
                  className="from-primary to-primary-glow h-full rounded-full bg-gradient-to-r"
                  style={{ width: `${Math.max(2, 100 - result.stage1.finops.reductionPct)}%` }}
                />
              </div>
              <p className="text-muted-foreground mt-1.5 font-mono text-[10px]">
                {result.stage1.finops.basis}
              </p>
            </div>
          </Stage>

          <Stage
            stage={2}
            icon={FileCode2}
            aside={`${result.stage2.content.split("\n").length} lines · edit in place`}
          >
            <div className="border-border bg-surface/50 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  data-testid="loop-generate-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void generate();
                  }}
                  placeholder={`Describe the change to generate for ${path}…`}
                  aria-label="Grounded generation prompt"
                  className="border-border bg-card focus:border-primary min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-[11px] outline-none"
                />
                <button
                  type="button"
                  data-testid="loop-generate-btn"
                  onClick={() => void generate()}
                  disabled={!prompt.trim() || generating}
                  className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Generate grounded code
                </button>
              </div>
              <p className="text-muted-foreground mt-1.5 font-mono text-[10px]">
                Mode A · /api/ai/chat in code mode, seeded with the Stage 1 envelope (not the raw
                repository). Requires a provider key; the provider error is shown verbatim.
              </p>
              {generateError && (
                <p
                  data-testid="loop-generate-error"
                  role="alert"
                  className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200"
                >
                  {generateError}
                </p>
              )}
              {generated?.code && (
                <div
                  data-testid="loop-generated-proposal"
                  className="border-primary/25 bg-primary/5 mt-2 rounded-lg border p-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold">Grounded proposal</p>
                    <button
                      type="button"
                      data-testid="loop-apply-generated"
                      onClick={() => {
                        setDraft(generated.code!);
                        void run({ content: generated.code! });
                      }}
                      className="border-primary/40 bg-primary/15 text-primary rounded border px-2 py-1 text-[10px] font-semibold"
                    >
                      Use generated code → verify
                    </button>
                  </div>
                  <pre className="mt-2 max-h-40 overflow-auto font-mono text-[10px] whitespace-pre">
                    {generated.code}
                  </pre>
                </div>
              )}
              {generated && !generated.code && (
                <p className="text-muted-foreground mt-2 whitespace-pre-line rounded-lg border border-dashed border-border p-2.5 text-[11px]">
                  {generated.answer.slice(0, 700)}
                  {"\n\nNo fenced file was returned, so nothing was written to the buffer."}
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {LOOP_SCENARIOS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-testid={`loop-scenario-${option.id}`}
                  onClick={() => {
                    setScenario(option.id);
                    void run({ scenario: option.id });
                  }}
                  title={option.description}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    scenario === option.id
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.expectation === "safe" ? "✓ " : "⚠ "}
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground mt-2 text-[11px]">
              {result.stage2.scenario === scenario ? result.stage2.summary : "Switching scenario…"}
              {result.stage2.changedLine ? (
                <button
                  type="button"
                  onClick={() =>
                    open(result.path, result.stage2.changedLine, result.stage2.summary)
                  }
                  className="text-primary ml-1.5 font-mono hover:underline"
                >
                  line {result.stage2.changedLine}
                </button>
              ) : null}
            </p>
            <textarea
              data-testid="loop-code-buffer"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              aria-label="Proposed change buffer"
              className="border-border bg-surface focus:border-primary mt-3 h-56 w-full resize-y rounded-xl border p-3 font-mono text-[11px] leading-relaxed outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void run({ content: draft })}
                disabled={loading}
                className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Cpu className="size-3.5" />
                )}
                Verify hidden dependencies
              </button>
              <span className="text-muted-foreground font-mono text-[10px]">
                in-memory overlay · nothing written to disk or git
              </span>
            </div>
          </Stage>

          <Stage
            stage={3}
            icon={Cpu}
            aside={`overlay ${formatDuration(result.stage3.durationMs)} · ${result.repository}`}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Delta
                label="Runtime cycles"
                before={result.stage3.before.cycles}
                after={result.stage3.after.cycles}
                bad={result.stage3.newCycles.length > 0}
              />
              <Delta
                label="Unresolved imports"
                before={result.stage3.before.unresolved}
                after={result.stage3.after.unresolved}
                bad={result.stage3.newUnresolved.length > 0}
              />
              <Delta
                label="SQL column drift"
                before={result.stage3.before.columnDrift}
                after={result.stage3.after.columnDrift}
                bad={result.stage3.after.columnDrift > result.stage3.before.columnDrift}
              />
              <Delta
                label="Blast radius delta"
                before={0}
                after={result.stage3.blastDelta}
                bad={result.stage3.blastDelta > 0}
              />
            </div>

            <div className="mt-3 space-y-1.5">
              {result.stage3.newUnresolved.map((item) => (
                <button
                  key={`${item.path}:${item.line}:${item.specifier}`}
                  type="button"
                  onClick={() =>
                    open(
                      item.path,
                      item.line,
                      `Unresolved import at line ${item.line}: ${item.specifier} does not resolve in this repository.`,
                    )
                  }
                  className="flex w-full items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-left text-[11px] text-red-200 transition-colors hover:border-red-400/60"
                >
                  <span className="min-w-0">
                    <span className="font-mono">
                      {item.path}:{item.line}
                    </span>{" "}
                    <span className="text-red-300/80">→ {item.specifier}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase">new unresolved</span>
                </button>
              ))}
              {result.stage3.newCycles.map((cycle) => (
                <button
                  key={cycle.join(">")}
                  type="button"
                  onClick={() =>
                    open(cycle[0]!, 1, `Runtime cycle: ${cycle.join(" → ")} → ${cycle[0]}`)
                  }
                  className="flex w-full items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-left text-[11px] text-red-200"
                >
                  <span className="min-w-0 font-mono">
                    {cycle.join(" → ")} → {cycle[0]}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase">new cycle</span>
                </button>
              ))}
              {result.stage3.removedExports.map((name) => (
                <div
                  key={name}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200"
                >
                  Removed export <span className="font-mono">{name}</span>;{" "}
                  {result.stage3.brokenCallers.length} downstream importer
                  {result.stage3.brokenCallers.length === 1 ? "" : "s"} still expect it.
                </div>
              ))}
              {result.stage3.columnDrift
                .filter((finding) => finding.references.some((ref) => ref.path === result.path))
                .slice(0, 4)
                .map((finding) => {
                  const reference = finding.references.find((ref) => ref.path === result.path);
                  return (
                    <button
                      key={`${finding.table}-${finding.column}`}
                      type="button"
                      onClick={() =>
                        open(
                          reference?.path ?? result.path,
                          reference?.line ?? 1,
                          `SQL column drift at line ${reference?.line ?? 1}: ${finding.message}`,
                        )
                      }
                      className="block w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-[11px] text-amber-200"
                    >
                      <span className="font-mono">
                        {finding.table}.{finding.column}
                      </span>{" "}
                      · {finding.message}
                      {reference ? (
                        <span className="text-amber-300/80">
                          {" "}
                          · {reference.path}:{reference.line}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              {!result.stage3.newCycles.length &&
                !result.stage3.newUnresolved.length &&
                result.stage3.removedExports.length === 0 &&
                result.stage3.after.columnDrift <= result.stage3.before.columnDrift && (
                  <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                    <CheckCircle2 className="size-3.5" /> The overlay introduced no new structural
                    facts.
                  </p>
                )}
            </div>
          </Stage>

          <Stage
            stage={4}
            icon={result.stage4.verdict === "safe" ? CheckCircle2 : AlertTriangle}
            aside={result.stage4.verdict === "safe" ? "certified" : "blocked"}
          >
            <div
              data-testid="loop-verdict"
              data-verdict={result.stage4.verdict}
              className={cn(
                "rounded-xl border p-4",
                result.stage4.verdict === "safe"
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-red-500/40 bg-red-500/10",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p
                    className={cn(
                      "font-mono text-[10px] tracking-[0.2em] uppercase",
                      result.stage4.verdict === "safe" ? "text-emerald-300" : "text-red-300",
                    )}
                  >
                    {result.stage4.verdict === "safe"
                      ? "Verified safe to deploy"
                      : "Breaking hidden dependency"}
                  </p>
                  <h4 className="mt-1 text-base font-semibold">{result.stage4.headline}</h4>
                  <p className="text-muted-foreground mt-1 max-w-2xl text-[11px] leading-relaxed">
                    {result.stage4.why}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase",
                    result.stage4.verdict === "safe"
                      ? "border-emerald-500/40 text-emerald-300"
                      : "border-red-500/40 text-red-300",
                  )}
                >
                  {result.stage4.verdict}
                </span>
              </div>

              {result.stage4.verdict === "safe" ? (
                <>
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {result.stage4.safeChecks.map((check) => (
                      <p
                        key={check}
                        className="flex items-center gap-1.5 text-[11px] text-emerald-200"
                      >
                        <CheckCircle2 className="size-3.5" /> {check}
                      </p>
                    ))}
                  </div>
                  <div className="border-emerald-500/20 mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-black/20 px-3 py-2">
                    <span className="text-muted-foreground font-mono text-[10px]">
                      Covering tests
                    </span>
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px]">
                      {result.stage4.command}
                    </code>
                    <button
                      type="button"
                      onClick={copyCommand}
                      className="border-border bg-surface inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold"
                    >
                      <Copy className="size-3" /> {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <ul className="mt-3 space-y-1">
                    {result.stage4.whatBroke.map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-[11px] text-red-200">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {item}
                      </li>
                    ))}
                  </ul>
                  {result.stage3.brokenCallers.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {result.stage3.brokenCallers.slice(0, 6).map((caller) => (
                        <button
                          key={`${caller.path}:${caller.line}`}
                          type="button"
                          data-testid="loop-teleport-row"
                          onClick={() =>
                            open(
                              caller.path,
                              caller.line,
                              `Downstream caller at line ${caller.line}: still imports the removed contract from ${result.path}.`,
                            )
                          }
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-left font-mono text-[10px] text-red-200"
                        >
                          <span className="truncate">
                            {caller.path}:{caller.line}
                          </span>
                          <span className="shrink-0">Jump to code #{caller.line}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="loop-auto-heal-btn"
                      onClick={applyHeal}
                      disabled={!result.stage4.heal?.verified || loading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-400/15 px-3 py-2 text-[11px] font-semibold text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Wrench className="size-3.5" />
                      Auto-Heal with Verified Fix Patch
                    </button>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {result.stage4.heal?.verified
                        ? `unresolved ${result.stage4.heal.unresolvedBefore} → ${result.stage4.heal.unresolvedAfter} · cycles ${result.stage4.heal.cyclesBefore} → ${result.stage4.heal.cyclesAfter}`
                        : (result.stage4.heal?.reason ??
                          "Auto-heal is scoped to unresolved imports; remove the cycle manually.")}
                    </span>
                  </div>
                  {result.stage4.heal?.patch ? (
                    <pre className="border-border bg-surface mt-2 max-h-48 overflow-auto rounded-lg border p-2.5 font-mono text-[10px] whitespace-pre">
                      {result.stage4.heal.patch}
                    </pre>
                  ) : null}
                </>
              )}
            </div>
            <p className="text-muted-foreground mt-2 flex items-center gap-1.5 font-mono text-[10px]">
              <Sparkles className="size-3" />
              {result.repository}@{result.ref.slice(0, 12)} · read-only overlay · no file, snapshot
              or database row was written
            </p>
          </Stage>
        </div>
      )}
    </section>
  );
}

function Stage({
  stage,
  icon: Icon,
  aside,
  children,
}: {
  stage: 1 | 2 | 3 | 4;
  icon: typeof AlertTriangle;
  aside: string;
  children: React.ReactNode;
}) {
  const meta = LOOP_STAGES.find((item) => item.id === stage)!;
  return (
    <section data-testid={meta.testId} className="relative">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="border-primary/30 bg-primary/10 text-primary flex size-6 items-center justify-center rounded-lg border font-mono text-[10px]">
            {stage}
          </span>
          <Icon className="text-primary size-4" />
          <div>
            <h4 className="text-sm font-semibold">{meta.title}</h4>
            <p className="text-muted-foreground text-[10px]">{meta.subtitle}</p>
          </div>
        </div>
        <span className="text-muted-foreground font-mono text-[10px]">{aside}</span>
      </div>
      {children}
      {stage < 4 && (
        <div className="text-primary/40 mt-3 flex items-center gap-1.5 font-mono text-[10px]">
          <ArrowRight className="size-3 rotate-90" /> next stage
        </div>
      )}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border bg-card rounded-lg border px-2 py-1.5">
      <p className="text-primary font-mono text-sm font-semibold">{value}</p>
      <p className="text-muted-foreground truncate text-[9px] uppercase tracking-wide">{label}</p>
    </div>
  );
}

function Delta({
  label,
  before,
  after,
  bad,
}: {
  label: string;
  before: number;
  after: number;
  bad: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-2.5",
        bad ? "border-red-500/35 bg-red-500/10" : "border-border bg-surface/50",
      )}
    >
      <p className="text-muted-foreground text-[9px] tracking-wide uppercase">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold">
        {before} <span className="text-muted-foreground">→</span>{" "}
        <span className={bad ? "text-red-300" : "text-emerald-300"}>{after}</span>
      </p>
    </div>
  );
}
