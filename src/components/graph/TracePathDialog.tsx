import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  Check,
  FileCode2,
  GitBranch,
  Search,
  Unlink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RepositorySnapshot } from "@/lib/repository-graph";
import { indexAnalysis } from "@/lib/analysis/impact";
import { tracePath } from "@/lib/analysis/trace";
import { cn } from "@/lib/utils";

/**
 * A graph is only useful if it answers a question. This is the visual version
 * of Graphify's `path A B`: choose two files and see the shortest import chain,
 * including the direction of every hop and the exact line that proves it.
 */
export function TracePathDialog({
  open,
  onClose,
  snapshot,
  initialPath,
  onOpenPath,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: RepositorySnapshot | null;
  initialPath?: string | null;
  onOpenPath?: (path: string) => void;
}) {
  const analysis = snapshot?.analysis ?? null;
  const index = useMemo(() => (analysis ? indexAnalysis(analysis) : null), [analysis]);
  const files = useMemo(
    () => (analysis ? analysis.files.map((file) => file.path).sort() : []),
    [analysis],
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState<ReturnType<typeof tracePath>>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!open || !index || files.length === 0) return;
    const start = initialPath && index.files.has(initialPath) ? initialPath : files[0]!;
    const neighbor =
      index.dependencies.get(start)?.[0]?.path ??
      index.dependents.get(start)?.[0]?.path ??
      files.find((path) => path !== start) ??
      "";
    setFrom(start);
    setTo(neighbor);
    setResult(null);
    setSearched(false);
  }, [open, index, files, initialPath]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setSearched(false);
    }
  }, [open]);

  const unknownFrom = from.length > 0 && !index?.files.has(from);
  const unknownTo = to.length > 0 && !index?.files.has(to);
  const canTrace = Boolean(index && from && to && !unknownFrom && !unknownTo);

  const run = () => {
    if (!index || !canTrace) return;
    setResult(tracePath(index, from, to));
    setSearched(true);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    setResult(null);
    setSearched(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="border-border bg-card max-h-[90vh] max-w-3xl overflow-y-auto p-0">
        <div className="border-border bg-surface/60 border-b px-6 py-5">
          <DialogHeader>
            <div className="text-primary flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase">
              <GitBranch className="size-3.5" /> Trace a connection
            </div>
            <DialogTitle className="font-display mt-2 text-2xl tracking-tight">
              How are these two files connected?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground max-w-2xl text-xs leading-relaxed">
              Nykst walks imports in both directions and returns the shortest static chain. Every
              hop carries the exact file and line, so the answer is checkable rather than a guess.
            </DialogDescription>
          </DialogHeader>
        </div>

        {!index || files.length === 0 ? (
          <div className="border-border text-muted-foreground m-6 rounded-xl border border-dashed p-6 text-sm">
            This map has no analyzed files to trace yet.
          </div>
        ) : (
          <div className="space-y-5 p-6">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <label className="block">
                <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                  Start file
                </span>
                <input
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setResult(null);
                    setSearched(false);
                  }}
                  list="nykst-trace-files"
                  spellCheck={false}
                  placeholder="src/lib/…"
                  aria-invalid={unknownFrom}
                  className={cn(
                    "border-border bg-surface focus:border-primary mt-1.5 w-full rounded-lg border px-3 py-2.5 font-mono text-xs outline-none transition-colors",
                    unknownFrom && "border-amber-500/60",
                  )}
                />
              </label>
              <button
                type="button"
                onClick={swap}
                title="Swap start and end"
                aria-label="Swap start and end"
                className="border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground inline-flex size-10 items-center justify-center self-end rounded-lg border transition-colors sm:mb-0.5"
              >
                <ArrowLeftRight className="size-4" />
              </button>
              <label className="block">
                <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                  End file
                </span>
                <input
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setResult(null);
                    setSearched(false);
                  }}
                  list="nykst-trace-files"
                  spellCheck={false}
                  placeholder="src/lib/…"
                  aria-invalid={unknownTo}
                  className={cn(
                    "border-border bg-surface focus:border-primary mt-1.5 w-full rounded-lg border px-3 py-2.5 font-mono text-xs outline-none transition-colors",
                    unknownTo && "border-amber-500/60",
                  )}
                />
              </label>
              <datalist id="nykst-trace-files">
                {files.map((path) => (
                  <option key={path} value={path} />
                ))}
              </datalist>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-[11px]">
                {unknownFrom || unknownTo
                  ? "Choose a file from the list; paths are case-sensitive."
                  : `${files.length.toLocaleString()} files in this map. Static imports only.`}
              </p>
              <button
                type="button"
                onClick={run}
                disabled={!canTrace}
                data-testid="trace-path-run"
                className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Search className="size-3.5" /> Trace connection
              </button>
            </div>

            {searched && result && (
              <div className="border-primary/25 bg-primary/[0.045] rounded-2xl border p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-primary flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] uppercase">
                    <Check className="size-3.5" /> Shortest chain found
                  </span>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {result.hops} hop{result.hops === 1 ? "" : "s"} · {result.path.length} file
                    {result.path.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-3 space-y-0">
                  {result.path.map((path, position) => {
                    const previousStep = result.steps[position - 1];
                    return (
                      <div key={path}>
                        {previousStep && (
                          <div className="text-muted-foreground flex items-center gap-2 py-1.5 pl-4 font-mono text-[10px]">
                            <ArrowDown className="text-primary/70 size-3" />
                            {previousStep.direction === "imports"
                              ? "imports"
                              : "is imported by"}{" "}
                            <span className="text-primary/80">line {previousStep.line}</span>
                            {previousStep.typeOnly && (
                              <span className="border-border rounded-full border px-1.5 py-0.5 text-[9px]">
                                type only
                              </span>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenPath?.(path)}
                          disabled={!onOpenPath}
                          className={cn(
                            "border-border bg-card flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left font-mono text-[11px] transition-colors",
                            onOpenPath && "hover:border-primary/40",
                          )}
                        >
                          <FileCode2 className="text-primary size-3.5 shrink-0" />
                          <span className="text-foreground min-w-0 flex-1 truncate">{path}</span>
                          <span className="text-muted-foreground shrink-0 text-[9px] uppercase">
                            {position === 0
                              ? "start"
                              : position === result.path.length - 1
                                ? "end"
                                : `hop ${position}`}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {searched && !result && (
              <div className="rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/[0.06] p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                  <Unlink className="size-4" /> No static import chain connects these files.
                </p>
                <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                  That is a real answer, not an error. File-based routes, dynamic imports and
                  generated code can connect pages without an import statement, and the map does not
                  guess those.
                </p>
              </div>
            )}

            <p className="text-muted-foreground border-border border-t pt-4 text-[10px] leading-relaxed">
              The chain is read from the saved map. Click any file to open it in the map, then
              follow its importers and database tables in the inspector.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
