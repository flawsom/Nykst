import { useMemo } from "react";
import { SEVERITY_TONE } from "@/lib/workspace/model";
import { useWorkspace } from "./WorkspaceContext";
import { Badge, buttonClass } from "./ui";

const nf = new Intl.NumberFormat("en-US");
const RANK = { high: 3, medium: 2, low: 1 } as const;
const SHOWN = 3;
/** Blast radius is computed lazily: only for the strongest candidates, a few paths each. */
const MAX_RANKED = 40;
const MAX_PATHS = 12;

export function Attention() {
  const { data, index, impact, select, setView } = useWorkspace();
  const { findings, analysis } = data;

  const top = useMemo(() => {
    const bySeverity = [...findings].sort((a, b) => RANK[b.severity] - RANK[a.severity]);
    const scored = bySeverity.map((finding, i) => {
      let reach = 0;
      if (i < MAX_RANKED)
        for (const path of [...new Set(finding.paths)].slice(0, MAX_PATHS))
          if (index.files.has(path)) reach = Math.max(reach, impact([path]).runtimeCount);
      return { finding, reach, i };
    });
    return scored
      .sort(
        (a, b) =>
          RANK[b.finding.severity] - RANK[a.finding.severity] || b.reach - a.reach || a.i - b.i,
      )
      .slice(0, SHOWN);
  }, [findings, index, impact]);

  const mostDepended = useMemo(() => {
    let best: { path: string; count: number } | null = null;
    for (const file of analysis.files) {
      const count = new Set((index.dependents.get(file.path) ?? []).map((e) => e.path)).size;
      if (count > 0 && (!best || count > best.count)) best = { path: file.path, count };
    }
    return best;
  }, [analysis, index]);

  const high = findings.filter((f) => f.severity === "high").length;
  const hub = mostDepended
    ? ` Most-depended-on file: ${mostDepended.path} (${nf.format(mostDepended.count)} importers).`
    : "";

  if (findings.length === 0)
    return (
      <section aria-label="Fix first" className="border-border bg-surface rounded-lg border p-4">
        <p className="text-sm">
          No findings. Checked {nf.format(analysis.stats.sourceFiles)} source files and{" "}
          {nf.format(analysis.stats.internalEdges)} import edges
          {analysis.cycles.length === 0 ? ", with no circular imports" : ""}.{hub}
        </p>
      </section>
    );

  return (
    <section aria-label="Fix first" className="border-border bg-surface rounded-lg border">
      <div className="border-border flex flex-col gap-1 border-b px-4 py-3">
        <h2 className="text-base font-semibold">Fix first</h2>
        <p className="text-muted-foreground text-sm">
          {nf.format(findings.length)} {findings.length === 1 ? "finding" : "findings"}
          {high > 0 ? `: ${high} high` : ""}.{hub}
        </p>
      </div>
      <ol className="divide-border divide-y">
        {top.map(({ finding, reach }) => {
          const files = new Set(finding.paths).size;
          const first = finding.paths.find((p) => index.files.has(p));
          return (
            <li key={finding.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-start gap-2">
                  <Badge tone={SEVERITY_TONE[finding.severity]} className="mt-0.5 shrink-0">
                    {finding.severity}
                  </Badge>
                  <span className="min-w-0 text-sm font-medium break-words">{finding.title}</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  touches {nf.format(files)} {files === 1 ? "file" : "files"}
                  {reach > 0 ? `, would reach ${nf.format(reach)} files` : ""}
                </p>
              </div>
              {first && (
                <button
                  type="button"
                  className={`${buttonClass.ghost} text-primary shrink-0`}
                  onClick={() => select(first)}
                >
                  Open
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <div className="border-border border-t px-4 py-2">
        <button
          type="button"
          className="text-primary min-h-10 text-sm font-medium underline-offset-4 hover:underline"
          onClick={() => setView("findings")}
        >
          All findings ({nf.format(findings.length)})
        </button>
      </div>
    </section>
  );
}
