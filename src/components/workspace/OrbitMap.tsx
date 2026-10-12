import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Info, X } from "lucide-react";
import { IMPACT_TONE, SEVERITY_TONE } from "@/lib/workspace/model";
import { layoutOrbit, orbitNodes, topFiles, type OrbitNode } from "@/lib/workspace/orbit";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./WorkspaceContext";
import { Badge, FileLink, buttonClass } from "./ui";

const nf = new Intl.NumberFormat("en-US");
const NARROW = 640;
const DOT = { ok: "bg-ok", info: "bg-info", warn: "bg-warn", danger: "bg-danger" } as const;

interface Crumb {
  path: string;
  label: string;
}

const plural = (n: number, word: string) => `${nf.format(n)} ${word}${n === 1 ? "" : "s"}`;

function stats(node: OrbitNode) {
  const size = node.kind === "file" ? `${nf.format(node.loc)} LOC` : plural(node.files, "file");
  return `${size} · ${plural(node.importers, "importer")} · ${node.level} impact`;
}

export function OrbitMap() {
  const { data, index, select, findingsByPath } = useWorkspace();
  const repoName = data.repository.split("/").pop() || data.repository;
  const [trail, setTrail] = useState<Crumb[]>([{ path: "", label: repoName }]);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const current = trail[trail.length - 1]!;
  const nodes = useMemo(
    () => orbitNodes(data.analysis, index, current.path, data.findings),
    [data.analysis, data.findings, index, current.path],
  );

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setSize({ w: element.clientWidth, h: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setDetailsId(null), [current.path]);

  const narrow = size.w < NARROW;
  const points = useMemo(
    () => layoutOrbit(nodes.length, size.w, size.h),
    [nodes.length, size.w, size.h],
  );

  const totals = useMemo(() => {
    if (current.path === "")
      return { files: data.analysis.stats.sourceFiles, findings: data.findings.length };
    const paths = new Set(nodes.flatMap((node) => node.paths));
    const ids = new Set<string>();
    for (const path of paths) for (const f of findingsByPath.get(path) ?? []) ids.add(f.id);
    return { files: paths.size, findings: ids.size };
  }, [current.path, data, nodes, findingsByPath]);

  const up = () => setTrail((t) => (t.length > 1 ? t.slice(0, -1) : t));
  const act = (node: OrbitNode) => {
    if (node.kind === "file") select(node.path);
    else if (node.drill !== null) setTrail((t) => [...t, { path: node.drill!, label: node.label }]);
    else setDetailsId((id) => (id === node.id ? null : node.id));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && trail.length > 1) {
      event.preventDefault();
      up();
    }
  };

  const all = nodes.flatMap((node) => [node, ...(node.hidden ?? [])]);
  const details = all.find((node) => node.id === detailsId) ?? null;
  const more = nodes.find((node) => node.kind === "more");

  const centre = (
    <>
      <span className="text-subtle text-xs font-semibold tracking-wider uppercase">
        {current.path === "" ? "Repository" : "Folder"}
      </span>
      <span className="w-full truncate text-base font-semibold" title={current.label}>
        {current.label}
      </span>
      <span className="text-muted-foreground tabular text-xs">
        {plural(totals.files, "file")} · {plural(totals.findings, "finding")}
      </span>
    </>
  );

  return (
    <section className="flex flex-col gap-3" aria-label="Orbit map" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm">
            {trail.map((crumb, i) => (
              <li key={`${crumb.path}${i}`} className="flex items-center gap-1">
                {i > 0 && (
                  <span aria-hidden className="text-subtle">
                    /
                  </span>
                )}
                {i === trail.length - 1 ? (
                  <span aria-current="page" className="px-1 font-medium">
                    {crumb.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted min-h-8 rounded px-1 transition-colors"
                    onClick={() => setTrail((t) => t.slice(0, i + 1))}
                  >
                    {crumb.label}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {trail.length > 1 && (
          <button type="button" className={buttonClass.ghost} onClick={up}>
            <ArrowUp className="size-4" aria-hidden /> Up one level
          </button>
        )}
      </div>

      <div
        ref={box}
        className={cn(
          "border-border bg-surface relative overflow-hidden rounded-lg border",
          narrow ? "flex flex-col gap-2 p-2" : "h-[72vh] min-h-[600px]",
        )}
      >
        {narrow ? (
          <div className="border-primary bg-background flex flex-col gap-0.5 rounded-lg border p-3">
            {centre}
          </div>
        ) : (
          <>
            <svg aria-hidden className="absolute inset-0 size-full">
              {points.map((p, i) => (
                <line
                  key={nodes[i]!.id}
                  x1="50%"
                  y1="50%"
                  x2={`${p.x}%`}
                  y2={`${p.y}%`}
                  className="stroke-border"
                  strokeWidth={1}
                />
              ))}
            </svg>
            <div className="border-primary bg-background absolute top-1/2 left-1/2 flex size-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full border px-4 text-center">
              {centre}
            </div>
          </>
        )}
        {nodes.length === 0 && (
          <p className="text-muted-foreground p-3 text-sm">Nothing to show in this folder.</p>
        )}
        <ul
          className={cn(narrow ? "grid grid-cols-1 gap-2" : "contents")}
          aria-label={`Contents of ${current.label}`}
        >
          {nodes.map((node, i) => (
            <Card
              key={node.id}
              node={node}
              open={detailsId === node.id}
              onAct={() => act(node)}
              onInfo={() => setDetailsId((id) => (id === node.id ? null : node.id))}
              {...(!narrow && points[i] ? { at: points[i] } : {})}
            />
          ))}
        </ul>
      </div>

      {details && (
        <div
          id="orbit-details"
          role="region"
          aria-label={`Details for ${details.label}`}
          className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold" title={details.label}>
                {details.label}
              </h3>
              <p className="text-muted-foreground text-xs">
                {stats(details)} · {plural(details.findings, "open finding")}
              </p>
            </div>
            <button
              type="button"
              className={buttonClass.ghost}
              aria-label="Close details"
              onClick={() => setDetailsId(null)}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div>
            <h4 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
              Most depended-on files
            </h4>
            {details.paths.length === 0 ? (
              <p className="text-muted-foreground text-sm">No source files.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {topFiles(index, details).map((file) => (
                  <li key={file.path} className="flex items-center justify-between gap-3">
                    <FileLink path={file.path} />
                    <span className="text-muted-foreground tabular shrink-0 text-xs">
                      {plural(file.importers, "importer")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {more?.hidden && (
        <details className="border-border bg-surface rounded-lg border">
          <summary className="min-h-10 cursor-pointer px-3 py-2.5 text-sm font-medium">
            All {nodes.length - 1 + more.hidden.length} items in {current.label}
          </summary>
          <ul className="divide-border border-border divide-y border-t">
            {more.hidden.map((node) => (
              <li key={node.id} className="flex items-center justify-between gap-3 px-3 py-1">
                <button
                  type="button"
                  className={cn(buttonClass.ghost, "min-w-0 justify-start")}
                  onClick={() => act(node)}
                >
                  <span className="truncate">{node.label}</span>
                </button>
                <span className="text-muted-foreground tabular shrink-0 text-xs">
                  {stats(node)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Card({
  node,
  at,
  open,
  onAct,
  onInfo,
}: {
  node: OrbitNode;
  at?: { x: number; y: number };
  open: boolean;
  onAct(): void;
  onInfo(): void;
}) {
  const actionable = node.kind !== "more";
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={cn("size-2.5 shrink-0 rounded-full", DOT[IMPACT_TONE[node.level]])}
        />
        <span className="truncate text-sm font-semibold" title={node.label}>
          {node.label}
        </span>
      </span>
      <span className="text-muted-foreground text-xs">{stats(node)}</span>
      {node.findings > 0 && node.worst && (
        <span>
          <Badge tone={SEVERITY_TONE[node.worst]}>{plural(node.findings, "finding")}</Badge>
        </span>
      )}
    </>
  );
  const bodyClass = "flex w-full flex-col items-start gap-1 p-3 pr-10 text-left";
  return (
    <li
      className={cn(
        "border-border bg-card relative rounded-lg border",
        at &&
          "absolute w-[190px] -translate-x-1/2 -translate-y-1/2 motion-safe:transition-[left,top] motion-safe:duration-200",
        actionable && "hover:border-primary focus-within:border-primary",
      )}
      style={at ? { left: `${at.x}%`, top: `${at.y}%` } : undefined}
    >
      {actionable ? (
        <button type="button" className={cn(bodyClass, "rounded-lg")} onClick={onAct}>
          {body}
        </button>
      ) : (
        <div className={bodyClass}>{body}</div>
      )}
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground hover:bg-muted absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-md"
        aria-label={`Details for ${node.label}`}
        aria-expanded={open}
        aria-controls="orbit-details"
        onClick={onInfo}
      >
        <Info className="size-4" aria-hidden />
      </button>
    </li>
  );
}
