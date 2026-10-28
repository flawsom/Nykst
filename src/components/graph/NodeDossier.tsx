import { useMemo, useState } from "react";
import { CornerDownRight, Github, Network, Search } from "lucide-react";
import type { GraphNode } from "@/lib/graph-data";
import type { RepoAnalysis } from "@/lib/analysis/types";
import type { RepositorySnapshot } from "@/lib/repository-graph";
import { buildNodeDossier } from "@/lib/dossier";
import { githubBlobUrl } from "@/lib/code-links";
import type { CodeTarget } from "./CodeProblemInspector";

const TESTID = "impact-teleport-row";
const FIRST_PAINT = 40;
const MAX_ROWS = 1000;

const KIND_FILTERS = [
  "all",
  "importer",
  "dependent",
  "entrypoint",
  "test",
  "resource",
  "drift",
  "symbol",
] as const;

/**
 * Deterministic evidence for one graph node: direct importers, transitive
 * dependents, entrypoints, covering tests, SQL resources, column drift and
 * exported signatures. Every row is a click-to-code target with the exact file
 * and line. A capped list always states its total and can be expanded to 1000
 * rows per section.
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
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<(typeof KIND_FILTERS)[number]>("all");

  // A repository-level node spans every file, so reverse reachability is cached
  // per node instead of being recomputed on each render. The full list is built
  // once and the display cap is applied after filtering, so a filter can reach
  // a row that the first paint would otherwise hide.
  const sections = useMemo(
    () => buildNodeDossier(analysis ?? null, paths ?? [], { limit: MAX_ROWS }),
    [analysis, paths],
  );

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return sections.map((section) => {
      const rows = section.rows.filter((row) => {
        if (kindFilter !== "all" && row.kind !== kindFilter) return false;
        if (!query) return true;
        return `${row.path} ${row.label} ${row.detail ?? ""}`.toLowerCase().includes(query);
      });
      return { ...section, filtered: rows, shown: rows.slice(0, showAll ? MAX_ROWS : FIRST_PAINT) };
    });
  }, [sections, filter, kindFilter, showAll]);

  const totalRows = sections.reduce((total, section) => total + section.total, 0);
  const hiddenRows = visible.reduce(
    (total, section) =>
      total +
      Math.max(0, section.filtered.length - section.shown.length) +
      Math.max(0, section.total - section.rows.length),
    0,
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
          {paths?.length ?? 0} file{(paths?.length ?? 0) === 1 ? "" : "s"} in scope ·{" "}
          {totalRows.toLocaleString("en-US")} evidence rows · click any row to jump to code
        </span>
      </div>

      {!sections.length ? (
        <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
          No evidence in this analysis. Re-analyze the repository to build the dossier.
        </p>
      ) : (
        <>
          <div className="border-border mt-3 flex flex-wrap items-center gap-2 border-y py-2">
            <label className="border-border bg-surface flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5">
              <Search className="text-muted-foreground size-3.5 shrink-0" />
              <span className="sr-only">Filter dossier rows by file or symbol</span>
              <input
                data-testid="dossier-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter by file, symbol or finding"
                className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-[11px] outline-none"
              />
            </label>
            <label className="border-border bg-surface flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
              <span className="text-muted-foreground text-[10px] uppercase">Kind</span>
              <select
                data-testid="dossier-kind-filter"
                aria-label="Filter dossier rows by kind"
                value={kindFilter}
                onChange={(event) =>
                  setKindFilter(event.target.value as (typeof KIND_FILTERS)[number])
                }
                className="text-foreground bg-transparent text-[11px] outline-none"
              >
                {KIND_FILTERS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              data-testid="dossier-show-all"
              aria-expanded={showAll}
              onClick={() => setShowAll((value) => !value)}
              className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold"
            >
              {showAll ? "Show first 40 rows" : `Show all rows (up to ${MAX_ROWS})`}
            </button>
            <span className="text-muted-foreground font-mono text-[10px]" aria-live="polite">
              {hiddenRows > 0
                ? `${hiddenRows.toLocaleString("en-US")} rows hidden by the display cap`
                : "every matching row is shown"}
            </span>
          </div>

          <div className="mt-3 space-y-4">
            {visible.map((section) => (
              <div key={section.id} data-dossier-section={section.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">{section.title}</p>
                    <p className="text-muted-foreground text-[10px]">{section.subtitle}</p>
                  </div>
                  <span
                    data-testid={`dossier-count-${section.id}`}
                    className="text-muted-foreground font-mono text-[10px]"
                  >
                    {section.shown.length} of {section.filtered.length} shown · {section.total}{" "}
                    {section.rowKind} · {section.distinct} distinct{" "}
                    {section.id === "resources"
                      ? "tables"
                      : section.id === "symbols"
                        ? "symbols"
                        : "files"}
                  </span>
                </div>

                {section.shown.length ? (
                  <ul className="mt-2 space-y-1">
                    {section.shown.map((row) => {
                      const line = row.line ?? null;
                      const url = githubBlobUrl({ repository, ref, path: row.path, line });
                      return (
                        <li key={`${section.id}-${row.path}-${line ?? 0}-${row.label}`}>
                          <button
                            type="button"
                            data-testid={TESTID}
                            data-dossier-row="true"
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
                              <span className="text-muted-foreground block truncate text-[10px]">
                                {row.kind} · {row.label}
                                {row.detail ? ` · ${row.detail}` : ""}
                              </span>
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
                    {section.filtered.length
                      ? "No row matches the current filter."
                      : section.emptyLabel}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
