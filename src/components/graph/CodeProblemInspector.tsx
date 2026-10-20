import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Code2,
  ExternalLink,
  Github,
  Loader2,
  Network,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { editorFileUrl, githubBlobUrl } from "@/lib/code-links";

export interface CodeTarget {
  repository?: string | null;
  path: string;
  line?: number | null;
  reason?: string;
  ref?: string | null;
  label?: string;
}

interface Evidence {
  repository?: string;
  path: string;
  ref?: string;
  line?: number | null;
  excerpt?: {
    start: number;
    end: number;
    line: number;
    lines: { number: number; text: string }[];
  };
  focus?: string;
  description?: string;
  githubUrl?: string | null;
  editorPath?: string;
  source?: "workspace" | "github";
  sha?: string;
}

function endpoint(target: CodeTarget) {
  const params = new URLSearchParams();
  if (target.repository) params.set("repo", target.repository);
  params.set("path", target.path);
  if (target.line && target.line > 0) params.set("line", String(target.line));
  if (target.ref) params.set("ref", target.ref);
  return `/api/integrations/github/file-evidence?${params.toString()}`;
}

/**
 * Click-to-code drawer. Every impact row in the dossier, the Before You Act
 * envelope and the landing workbench opens this panel at the exact line it cited.
 */
export function CodeProblemInspector({
  target,
  onClose,
  onInspectNode,
  editorOrigin,
}: {
  target: CodeTarget | null;
  onClose: () => void;
  onInspectNode?: (path: string) => void;
  editorOrigin?: string;
}) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useMemo(() => (target ? endpoint(target) : ""), [target]);
  const open = target !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!request) {
      setEvidence(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setEvidence(null);
    fetch(request, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          evidence?: Evidence;
          error?: string;
        };
        if (!response.ok || !payload.evidence)
          throw new Error(payload.error ?? `Could not load source (${response.status}).`);
        if (active) setEvidence(payload.evidence);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load source.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  if (!open) return null;

  const line = evidence?.line ?? target.line ?? null;
  const githubUrl =
    evidence?.githubUrl ??
    githubBlobUrl({
      repository: evidence?.repository ?? target.repository ?? null,
      ref: evidence?.ref ?? target.ref ?? null,
      path: evidence?.path ?? target.path,
      line,
    });
  const editorHref =
    evidence?.editorPath || editorFileUrl(evidence?.path ?? target.path, line, editorOrigin);

  return (
    <div className="fixed inset-0 z-[95] flex" role="presentation">
      <button
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close code inspector"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Code inspector"
        data-testid="code-problem-inspector"
        className="border-border bg-background relative ml-auto flex h-full w-full flex-col border-l shadow-2xl sm:max-w-2xl"
      >
        <header className="border-border flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="text-primary flex items-center gap-1.5 font-mono text-[10px] tracking-[0.22em] uppercase">
              <Code2 className="size-3.5" /> Code inspector
            </div>
            <h2 className="mt-1 truncate font-mono text-sm font-semibold">
              {evidence?.path ?? target.path}
              {line ? <span className="text-primary">:{line}</span> : null}
            </h2>
            <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">
              {evidence?.repository ?? target.repository ?? "live workspace"}
              {evidence?.ref ? ` · ${evidence.ref.slice(0, 12)}` : ""}
              {evidence?.source ? ` · ${evidence.source}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close code inspector"
            className="text-muted-foreground hover:text-foreground shrink-0 rounded-lg p-1.5 transition-colors"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="border-border bg-card/60 shrink-0 border-b px-4 py-3">
          <p className="text-xs leading-relaxed font-medium">
            {target.reason ?? target.label ?? "Source behind this citation"}
          </p>
          {evidence?.description && (
            <p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
              {evidence.description}
            </p>
          )}
          {evidence?.focus && (
            <pre className="border-border bg-surface mt-2 overflow-x-auto rounded-lg border px-3 py-2 font-mono text-[11px] whitespace-pre">
              {evidence.focus}
            </pre>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              onClick={() => onInspectNode?.(evidence?.path ?? target.path)}
              className="border-border bg-surface hover:border-primary/50 hover:bg-surface-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
            >
              <Network className="size-3.5" /> Inspect node in graph
            </button>
            {githubUrl && (
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="github-line-link"
                className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
              >
                <Github className="size-3.5" /> Open exact line on GitHub
              </a>
            )}
            {editorHref && (
              <a
                href={editorHref}
                className="border-border bg-surface hover:bg-surface-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
              >
                <ExternalLink className="size-3.5" /> Open in VS Code / Cursor
              </a>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && (
            <div className="text-muted-foreground flex items-center gap-2 px-4 py-6 font-mono text-[11px]">
              <Loader2 className="size-3.5 animate-spin" /> Reading source evidence…
            </div>
          )}
          {error && !loading && (
            <div className="m-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              <TriangleAlert className="mr-1.5 inline size-3.5" />
              {error}
            </div>
          )}
          {evidence?.excerpt && !loading && (
            <table className="w-full border-collapse font-mono text-[11px]">
              <tbody>
                {evidence.excerpt.lines.map((item) => {
                  const focused = item.number === evidence.excerpt!.line;
                  return (
                    <tr
                      key={item.number}
                      {...(focused ? { "data-testid": "focused-code-line" } : {})}
                      className={cn(
                        focused
                          ? "bg-primary/10 outline outline-1 -outline-offset-1 outline-primary/40"
                          : "hover:bg-surface/60",
                      )}
                    >
                      <td className="text-muted-foreground w-12 border-r border-border px-2 py-0.5 text-right select-none">
                        {item.number}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-0.5 whitespace-pre",
                          focused ? "text-foreground font-semibold" : "text-foreground/85",
                        )}
                      >
                        {item.text || " "}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!loading && !error && !evidence?.excerpt && (
            <p className="text-muted-foreground px-4 py-6 text-[11px]">
              No source window was returned for this citation.
            </p>
          )}
        </div>

        <footer className="border-border text-muted-foreground flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-2 font-mono text-[10px]">
          <span className="inline-flex items-center gap-1.5">
            <ArrowLeft className="size-3" /> Esc closes the inspector
          </span>
          {evidence?.sha && <span>SHA {evidence.sha.slice(0, 10)}</span>}
        </footer>
      </aside>
    </div>
  );
}
