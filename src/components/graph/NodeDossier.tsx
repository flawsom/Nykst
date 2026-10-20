import { useMemo } from "react";
import { CornerDownRight, Github, Network } from "lucide-react";
import type { GraphNode } from "@/lib/graph-data";
import type { RepoAnalysis } from "@/lib/analysis/types";
import type { RepositorySnapshot } from "@/lib/repository-graph";
import { buildNodeDossier } from "@/lib/dossier";
import { githubBlobUrl } from "@/lib/code-links";
import type { CodeTarget } from "./CodeProblemInspector";

const TESTID = "dossier-row";

/**
 * Deterministic evidence for one graph node: direct importers, transitive
 * dependents, entrypoints, SQL resources, column drift and exported signatures.
 * Every row is a click-to-code target with the exact file and line.
 */
export function NodeDossier({
  node,
  analysis,
  snapshot,
  activeRepo,
  onInspectNode,
  onOpenCode,
}: {
  node: GraphNode;
  analysis?: RepoAnalysis | undefined;
  snapshot?: RepositorySnapshot | undefined;
  activeRepo: string | null;
  onInspectNode: (path: string) => void;
  onOpenCode: (target: CodeTarget) => void;
}) {
  const repository = snapshot?.repository?.full_name ?? activeRepo;
  const ref = snapshot?.repository?.default_branch ?? null;
  const paths = node.analysisRef?.paths;
  // A repository-level node spans every file, so reverse reachability is cached
  // per node instead of being recomputed on each render.
  const sections = useMemo(
    () => buildNodeDossier(analysis ?? null, paths ?? [], { limit: 40 }),
    [analysis, paths],
  );

  return (
    <section
      data-testid="node-dossier"
      className="border-border bg-card/60 mt-4 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-primary font-mono text-[10px] tracking-[0.22em] uppercase">
            Evidence dossier
          </p>
          <h3 className="mt-0.5 truncate text-sm font-semibold">{node.label}</h3>
        </div>
        <span className="text-muted-foreground font-mono text-[10px]">
          {paths?.length ?? 0} file{(paths?.length ?? 0) === 1 ? "" : "s"} in scope · click any row
          to jump to code
        </span>
      </div>

      {!sections.length && (
        <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
          No evidence in this analysis. Re-analyze the repository to build the dossier.
        </p>
      )}

      <div className="mt-3 space-y-4">
        {sections.map((section) => (
          <div key={section.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">{section.title}</p>
                <p className="text-muted-foreground text-[10px]">{section.subtitle}</p>
              </div>
              <span className="text-muted-foreground font-mono text-[10px]">
                {section.rows.length} of {section.total}
              </span>
            </div>

            {section.rows.length ? (
              <ul className="mt-2 space-y-1">
                {section.rows.map((row) => {
                  const line = row.line ?? null;
                  const url = githubBlobUrl({ repository, ref, path: row.path, line });
                  return (
                    <li key={`${section.id}-${row.path}-${line ?? 0}-${row.label}`}>
                      <button
                        type="button"
                        data-testid={TESTID}
                        data-path={row.path}
                        data-line={line ?? ""}
                        onClick={() =>
                          onOpenCode({
                            repository,
                            path: row.path,
                            line,
                            reason: row.detail ?? `${row.label} · ${section.title}`,
                            label: row.label,
                            ref,
                          })
                        }
                        className="border-border bg-surface/60 hover:border-primary/50 hover:bg-surface-2 group flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="text-foreground block truncate font-mono text-[11px]">
                            {row.path}
                          </span>
                          {row.detail && (
                            <span className="text-muted-foreground block truncate text-[10px]">
                              {row.kind} · {row.detail}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {line ? (
                            <span className="border-primary/30 bg-primary/10 text-primary rounded border px-1.5 py-0.5 font-mono text-[10px]">
                              {row.path.split("/").pop()}:{line}
                            </span>
                          ) : null}
                          <CornerDownRight className="text-primary size-3.5 opacity-70 group-hover:opacity-100" />
                        </span>
                      </button>
                      <div className="mt-0.5 flex flex-wrap gap-1 pl-2.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onInspectNode(row.path);
                          }}
                          className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-[10px] transition-colors"
                        >
                          <Network className="size-3" /> Inspect in graph
                        </button>
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-[10px] transition-colors"
                          >
                            <Github className="size-3" /> GitHub
                            {line ? `#L${line}` : ""}
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-1.5 text-[11px]">
                No evidence in this analysis.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
