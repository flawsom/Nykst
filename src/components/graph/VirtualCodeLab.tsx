import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { GraphNode } from "@/lib/graph-data";
import { askNykstAi } from "@/lib/ai-client";
import {
  generateCode,
  runVirtualCheck,
  simulateExecution,
  type CodeFinding,
  type ExecResult,
  type VirtualRun,
} from "@/lib/virtual-code";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  CircleAlert,
  FileCode2,
  Play,
  Sparkles,
  TerminalSquare,
  XCircle,
  Eye,
  Loader2,
  PenLine,
  X,
} from "lucide-react";

type Tab = "code" | "terminal" | "files" | "preview";

const SAMPLE_PROMPT = "Add retry with exponential backoff to the API call";

export function VirtualCodeLab({ node }: { node: GraphNode }) {
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT);
  const [code, setCode] = useState("");
  const [streamingCode, setStreamingCode] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [run, setRun] = useState<VirtualRun | null>(null);
  const [exec, setExec] = useState<ExecResult | null>(null);
  const [tab, setTab] = useState<Tab>("code");
  const [injected, setInjected] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const streamRef = useRef<number | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const context = useMemo(() => runVirtualCheck("", node).context, [node]);

  useEffect(() => {
    return () => {
      if (streamRef.current) window.clearInterval(streamRef.current);
    };
  }, []);

  useEffect(() => {
    if (showPrompt && promptRef.current) {
      promptRef.current.focus();
    }
  }, [showPrompt]);

  const streamCode = useCallback((full: string) => {
    if (streamRef.current) window.clearInterval(streamRef.current);
    setStreamingCode("");
    setIsStreaming(true);
    let i = 0;
    const chunk = Math.max(1, Math.ceil(full.length / 120));
    streamRef.current = window.setInterval(() => {
      i += chunk;
      if (i >= full.length) {
        setStreamingCode(full);
        setIsStreaming(false);
        if (streamRef.current) window.clearInterval(streamRef.current);
      } else {
        setStreamingCode(full.slice(0, i));
      }
    }, 16);
  }, []);

  const generate = async () => {
    const text = prompt.trim();
    if (!text) return;
    setGenerating(true);
    setGenerationError(null);
    setInjected(false);
    setRun(null);
    setExec(null);
    setShowPrompt(false);
    setTab("code");
    const localFallback = generateCode(text, node);
    try {
      const result = await askNykstAi(
        `Create a reviewable TypeScript code suggestion for this request: ${text}. Return only the proposed code, with no markdown fences. Do not claim that it was applied.`,
        `Selected graph node: ${node.label}\nScope: ${context.scope}\nNode summary: ${node.summary}\nExisting local draft:\n${localFallback}`,
      );
      const generated =
        result.ok && result.answer.trim()
          ? result.answer
              .replace(/^```(?:typescript|ts|javascript|js)?\s*/, "")
              .replace(/\s*```$/, "")
              .trim()
          : localFallback;
      if (!result.ok) setGenerationError(result.error);
      setCode(generated);
      streamCode(generated);
    } catch {
      setGenerationError(
        "Nykst could not reach the connected provider. The local draft is shown below.",
      );
      setCode(localFallback);
      streamCode(localFallback);
    } finally {
      setGenerating(false);
    }
  };

  const check = (source = code) => {
    const result = runVirtualCheck(source, node);
    setRun(result);
    setInjected(false);
    return result;
  };

  const runCode = () => {
    if (!code.trim()) return;
    setRunning(true);
    setInjected(false);
    setTab("terminal");
    window.setTimeout(() => {
      const result = check(code);
      const execution = simulateExecution(code, node, result);
      setExec(execution);
      setRunning(false);
    }, 900);
  };

  const applyFix = (f: CodeFinding) => {
    const next = f.apply(code);
    setCode(next);
    const result = check(next);
    if (exec) setExec(simulateExecution(next, node, result));
  };

  const applyAll = () => {
    let next = code;
    for (const f of run?.findings ?? []) next = f.apply(next);
    setCode(next);
    const result = check(next);
    if (exec) setExec(simulateExecution(next, node, result));
  };

  const verdict = exec ?? (run ? { passed: run.fits, steps: [], output: [], durationMs: 0 } : null);

  const displayedCode = isStreaming ? streamingCode : code;

  return (
    <div className="flex h-full flex-col">
      {/* tab bar */}
      <div className="border-border bg-surface/40 flex items-center gap-1 border-b px-3 py-1.5">
        {(
          [
            ["code", "Code", FileCode2],
            ["terminal", "Terminal", TerminalSquare],
            ["files", "Files", FileCode2],
            ["preview", "Preview", Eye],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              tab === id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowPrompt(true)}
          disabled={generating || isStreaming}
          className="border-border bg-surface hover:bg-surface-2 flex items-center gap-1.5 rounded-md border px-3 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
        >
          <PenLine className="size-3.5" />
          Write
        </button>
        <button
          onClick={runCode}
          disabled={running || !code.trim() || isStreaming}
          className="bg-primary text-primary-foreground hover:bg-primary-glow flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
        >
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {running ? "Running…" : "Run"}
        </button>
      </div>

      {/* prompt overlay */}
      {showPrompt && (
        <div className="border-border bg-surface/80 border-b px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenLine className="text-primary size-4" />
              <span className="text-[12px] font-medium">Write a prompt</span>
            </div>
            <button
              onClick={() => setShowPrompt(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                generate();
              }
            }}
            placeholder="Describe what you want the code to do…  e.g. 'Add retry with exponential backoff to the API call'"
            rows={3}
            className="border-border bg-surface-2 mt-3 w-full resize-none rounded-lg border p-3 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/50"
          />
          <div className="mt-2.5 flex items-center justify-between">
            <p className="text-muted-foreground text-[10px] leading-relaxed">
              Nykst generates code for <span className="text-foreground">{context.scope}</span>,
              then runs it virtually against your org structure before injecting.
            </p>
            <button
              onClick={generate}
              disabled={generating || !prompt.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary-glow flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-medium transition-colors disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Generate
            </button>
          </div>
        </div>
      )}

      {/* content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "code" && (
          <div className="flex h-full flex-col">
            <div className="border-border bg-surface flex items-center justify-between border-b px-3 py-1.5 text-[10px]">
              <span className="text-muted-foreground font-mono">
                {node.label.toLowerCase().replace(/\s+/g, "-")}.ts
              </span>
              {isStreaming && (
                <span className="text-primary flex items-center gap-1.5 text-[10px]">
                  <Loader2 className="size-3 animate-spin" />
                  generating…
                </span>
              )}
              {run && run.findings.length > 0 && !isStreaming && (
                <button
                  onClick={applyAll}
                  className="border-border bg-surface-2 hover:bg-secondary rounded-md border px-2 py-0.5 text-[10px] transition-colors"
                >
                  Apply all fixes
                </button>
              )}
            </div>
            {displayedCode.trim() ? (
              <div className="relative min-h-0 flex-1">
                {generationError && !isStreaming && (
                  <div className="border-border bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] border-b px-3 py-2 text-[10px] leading-relaxed">
                    <span className="font-semibold">Provider generation failed: </span>
                    {generationError} Local draft shown for review; it was not generated by your
                    provider.
                  </div>
                )}
                <pre className="bg-surface-2 h-full overflow-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                  {displayedCode}
                  {isStreaming && (
                    <span className="text-primary inline-block w-2 animate-pulse">▋</span>
                  )}
                </pre>
                {!isStreaming && (
                  <textarea
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setRun(null);
                      setExec(null);
                      setInjected(false);
                    }}
                    spellCheck={false}
                    className="absolute inset-0 h-full w-full resize-none bg-transparent p-3 font-mono text-[11px] leading-relaxed text-transparent caret-white outline-none"
                    style={{ caretColor: "var(--foreground)" }}
                  />
                )}
              </div>
            ) : generating ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <Loader2 className="text-primary size-8 animate-spin" />
                <p className="text-muted-foreground text-sm">Generating code for {node.label}…</p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <FileCode2 className="text-muted-foreground/40 size-10" />
                <p className="text-muted-foreground text-sm">
                  Click <span className="text-foreground font-medium">Write</span> to describe what
                  you want, then generate code for {node.label}.
                </p>
              </div>
            )}

            {/* findings */}
            {run && run.findings.length > 0 && !isStreaming && (
              <div className="border-border bg-surface/60 border-t px-3 py-2">
                <div className="space-y-1.5">
                  {run.findings.map((f) => (
                    <div
                      key={f.id}
                      className="border-border bg-surface rounded-md border px-2.5 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-1 size-1.5 shrink-0 rounded-full"
                          style={{
                            background:
                              f.severity === "error" ? "var(--primary)" : "var(--node-module)",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium">
                            Line {f.line} · {f.title}
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-[10px] leading-relaxed">
                            {f.why}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[10px]">Fix: {f.fix}</span>
                            <button
                              onClick={() => applyFix(f)}
                              className="border-border bg-surface-2 hover:bg-secondary rounded border px-2 py-0.5 text-[10px] transition-colors"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "terminal" && (
          <div className="bg-surface-2 h-full p-3 font-mono text-[11px] leading-relaxed">
            {running ? (
              <div className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Running virtual check against {node.label}…
              </div>
            ) : !exec ? (
              <p className="text-muted-foreground">
                No run yet. Press Run to execute the code against {node.label}.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="text-muted-foreground">
                  $ nykst run --node "{node.label}" --virtual
                </div>
                {exec.output.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      "animate-ticker",
                      line.startsWith("✓") && "text-[var(--node-file)]",
                      line.startsWith("✗") && "text-[var(--primary)]",
                      line.startsWith("⚠") && "text-[var(--node-module)]",
                    )}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    {line}
                  </div>
                ))}
                <div className="text-muted-foreground pt-1">
                  ─────────────────────────────────────
                </div>
                {exec.steps.map((s, i) => (
                  <div
                    key={i}
                    className="animate-ticker flex items-center gap-2"
                    style={{ animationDelay: `${(exec.output.length + i) * 40}ms` }}
                  >
                    {s.status === "ok" && (
                      <CheckCircle2
                        className="size-3.5 shrink-0"
                        style={{ color: "var(--node-file)" }}
                      />
                    )}
                    {s.status === "fail" && (
                      <XCircle className="size-3.5 shrink-0" style={{ color: "var(--primary)" }} />
                    )}
                    {s.status === "warn" && (
                      <CircleAlert
                        className="size-3.5 shrink-0"
                        style={{ color: "var(--node-module)" }}
                      />
                    )}
                    {s.status === "pending" && (
                      <div className="size-3.5 shrink-0 rounded-full border border-current opacity-30" />
                    )}
                    <span className="text-[11px]">{s.label}</span>
                    {s.detail && (
                      <span className="text-muted-foreground text-[10px]">— {s.detail}</span>
                    )}
                  </div>
                ))}
                <div className="text-muted-foreground pt-1">Completed in {exec.durationMs}ms</div>
              </div>
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="p-3">
            <div className="text-muted-foreground mb-2 text-[10px] tracking-[0.24em] uppercase">
              Files in scope of {context.scope}
            </div>
            {context.knownFiles.length === 0 ? (
              <p className="text-muted-foreground text-[11px]">No files tracked under this node.</p>
            ) : (
              <ul className="space-y-1">
                {context.knownFiles.map((f) => (
                  <li
                    key={f}
                    className="border-border bg-surface flex items-center gap-2 rounded-md border px-2.5 py-1.5"
                  >
                    <FileCode2 className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="font-mono text-[11px]">{f}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="text-muted-foreground mt-4 text-[10px] tracking-[0.24em] uppercase">
              Owners
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {context.owners.map((o) => (
                <span
                  key={o}
                  className="border-border bg-surface rounded-md border px-2 py-1 font-mono text-[10px]"
                >
                  {o}
                </span>
              ))}
            </div>
            <div className="text-muted-foreground mt-4 text-[10px] tracking-[0.24em] uppercase">
              Blast radius
            </div>
            <p className="mt-1 text-[11px]">{context.blast}</p>
          </div>
        )}

        {tab === "preview" && (
          <div className="flex h-full flex-col">
            {code.trim() ? (
              <pre className="bg-surface-2 h-full overflow-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {code}
              </pre>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <Eye className="text-muted-foreground/40 size-10" />
                <p className="text-muted-foreground text-sm">
                  Generate code first, then preview it here before running.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* verdict bar */}
      {verdict && (
        <div
          className={cn(
            "border-border border-t px-4 py-3",
            verdict.passed
              ? "bg-[color-mix(in_oklab,var(--node-file)_12%,transparent)]"
              : "bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]",
          )}
        >
          <div className="flex items-center gap-2.5">
            {verdict.passed ? (
              <CheckCircle2 className="size-5 shrink-0" style={{ color: "var(--node-file)" }} />
            ) : (
              <XCircle className="size-5 shrink-0" style={{ color: "var(--primary)" }} />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold">
                {verdict.passed
                  ? `Fits ${context.scope} — safe to inject`
                  : `Does not fit ${context.scope} — injection blocked`}
              </div>
              <p className="text-muted-foreground text-[10px] leading-relaxed">
                {verdict.passed
                  ? "All structural checks passed. The code respects the boundaries and blast radius of this node."
                  : `${
                      run?.findings.filter((f) => f.severity === "error").length ?? 0
                    } structural error(s) must be resolved before Nykst will inject this into ${context.scope}.`}
              </p>
            </div>
            {verdict.passed && (
              <button
                onClick={() => setInjected(true)}
                disabled={injected}
                className="bg-primary text-primary-foreground hover:bg-primary-glow shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60"
              >
                {injected ? `Injected · graph updated` : `Inject into ${context.scope}`}
              </button>
            )}
            {!verdict.passed && run && run.findings.some((f) => f.severity === "error") && (
              <button
                onClick={applyAll}
                className="border-border bg-surface hover:bg-surface-2 shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors"
              >
                Apply all fixes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
