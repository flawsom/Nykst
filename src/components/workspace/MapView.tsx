import { useState, type KeyboardEvent } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { chainFor, type Edge } from "@/lib/analysis/impact";
import { IMPACT_TONE, SEVERITY_TONE, worstSeverity } from "@/lib/workspace/model";
import { Attention } from "./Attention";
import { SystemMap } from "./SystemMap";
import { useWorkspace } from "./WorkspaceContext";
import { Badge, EmptyState, FileLink, SectionTitle, buttonClass } from "./ui";

const nf = new Intl.NumberFormat("en-US");
const base = (path: string) => path.split("/").pop() ?? path;
const unique = (edges: Edge[]) => {
  const seen = new Set<string>();
  return edges.filter((edge) => (seen.has(edge.path) ? false : (seen.add(edge.path), true)));
};

export function MapView() {
  const { selected } = useWorkspace();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      {selected ? <Neighbourhood path={selected} /> : <Overview />}
    </div>
  );
}

/* --------------------------------- overview --------------------------------- */

function Chip({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" }) {
  return (
    <li className="border-border bg-surface flex items-baseline gap-1.5 rounded-md border px-2.5 py-1">
      <span
        className={`tabular text-sm font-semibold ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : ""}`}
      >
        {nf.format(value)}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </li>
  );
}

function Overview() {
  const { data } = useWorkspace();
  const { analysis } = data;
  const high = data.findings.filter((f) => f.severity === "high").length;
  return (
    <>
      <h2 className="sr-only">Repository map</h2>
      <ul aria-label="Repository totals" className="flex flex-wrap gap-2">
        <Chip label="files" value={analysis.stats.sourceFiles} />
        <Chip label="import edges" value={analysis.stats.internalEdges} />
        <Chip label="services" value={analysis.services.length} />
        <Chip label="data resources" value={analysis.resources.length} />
        <Chip
          label="circular imports"
          value={analysis.cycles.length}
          {...(analysis.cycles.length > 0 ? { tone: "warn" as const } : {})}
        />
        <Chip
          label={high > 0 ? `findings, ${high} high` : "findings"}
          value={data.findings.length}
          {...(high > 0 ? { tone: "danger" as const } : {})}
        />
      </ul>
      <SystemMap />
      <Attention />
      <details className="border-border bg-surface rounded-lg border">
        <summary className="min-h-10 cursor-pointer px-3 py-2.5 text-sm font-medium">
          External services and data ({analysis.services.length + analysis.resources.length})
        </summary>
        <div className="border-border grid gap-6 border-t p-3 md:grid-cols-2">
          <Collapsible
            title="External services"
            empty="No external services were detected."
            rows={analysis.services.map((s) => ({
              key: s.id,
              node: (
                <>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm">{s.name}</span>
                    <Badge>{s.category}</Badge>
                  </span>
                  <span className="text-muted-foreground tabular shrink-0 text-xs">
                    {nf.format(s.files.length)} files
                  </span>
                </>
              ),
            }))}
          />
          <Collapsible
            title="Data"
            empty="No database tables, functions or buckets were detected."
            rows={analysis.resources.map((r) => ({
              key: r.id,
              node: (
                <>
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge>{r.kind}</Badge>
                    <span className="truncate font-mono text-sm">{r.name}</span>
                  </span>
                  <span className="text-muted-foreground tabular shrink-0 text-xs">
                    {nf.format(r.uses.length)} uses
                  </span>
                </>
              ),
            }))}
          />
        </div>
      </details>
      <details className="border-border bg-surface rounded-lg border">
        <summary className="min-h-10 cursor-pointer px-3 py-2.5 text-sm font-medium">
          What this analysis cannot see
        </summary>
        <div className="border-border border-t p-3">
          {analysis.limitations.length === 0 ? (
            <p className="text-muted-foreground text-sm">No limitations were reported.</p>
          ) : (
            <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {analysis.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </>
  );
}

function Collapsible(props: {
  title: string;
  empty: string;
  rows: { key: string; node: React.ReactNode }[];
}) {
  const [all, setAll] = useState(false);
  const shown = all ? props.rows : props.rows.slice(0, 8);
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>
        {props.title} ({props.rows.length})
      </SectionTitle>
      {props.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{props.empty}</p>
      ) : (
        <ul className="divide-border border-border bg-surface divide-y rounded-lg border">
          {shown.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 px-3 py-2">
              {row.node}
            </li>
          ))}
        </ul>
      )}
      {props.rows.length > 8 && (
        <button
          type="button"
          className={`${buttonClass.ghost} self-start`}
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
        >
          {all ? "Show fewer" : `Show all ${props.rows.length}`}
        </button>
      )}
    </section>
  );
}

/* ------------------------------- neighbourhood ------------------------------- */

const MAX_NODES = 8;
const NODE_W = 240;
const NODE_H = 40;
const GAP = 12;
const COL_X = { left: 8, center: 330, right: 652 } as const;

interface GraphNode {
  path: string;
  x: number;
  y: number;
  clickable: boolean;
  label: string;
  role: string;
}

function Neighbourhood({ path }: { path: string }) {
  const { index, select, impact, findingsByPath } = useWorkspace();
  const file = index.files.get(path);
  const report = impact([path]);
  const imports = unique(index.dependencies.get(path) ?? []);
  const importedBy = unique(index.dependents.get(path) ?? []);
  const rawImports = index.dependencies.get(path) ?? [];
  const rawImportedBy = index.dependents.get(path) ?? [];

  const rows = Math.max(1, Math.min(MAX_NODES + 1, Math.max(imports.length, importedBy.length)));
  const height = rows * (NODE_H + GAP) + GAP;
  const centerY = (height - NODE_H) / 2;

  const place = (edges: Edge[], x: number): GraphNode[] => {
    const shown = edges.slice(0, MAX_NODES);
    const nodes: GraphNode[] = shown.map((edge, i) => ({
      path: edge.path,
      x,
      y: GAP + i * (NODE_H + GAP),
      clickable: true,
      label: base(edge.path),
      role: index.files.get(edge.path)?.role ?? "unknown",
    }));
    if (edges.length > MAX_NODES)
      nodes.push({
        path: "",
        x,
        y: GAP + MAX_NODES * (NODE_H + GAP),
        clickable: false,
        label: `+${edges.length - MAX_NODES} more`,
        role: "see list below",
      });
    return nodes;
  };
  const left = place(imports, COL_X.left);
  const right = place(importedBy, COL_X.right);

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const mid = (x1 + x2) / 2;
    return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
  };
  const cy = centerY + NODE_H / 2;
  const label = `Neighbourhood of ${path}: imports ${imports.length} files, imported by ${importedBy.length} files.`;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div>
          <button type="button" className={buttonClass.ghost} onClick={() => select(null)}>
            <ArrowLeft className="size-4" aria-hidden /> Back to the map
          </button>
        </div>
        <h2 className="font-mono text-base font-semibold break-all">{path}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {file && <Badge>{file.role}</Badge>}
          {file && <Badge>{nf.format(file.loc)} LOC</Badge>}
          <Badge tone={IMPACT_TONE[report.level]}>Impact: {report.level}</Badge>
          <span className="text-muted-foreground text-sm">
            {nf.format(report.runtimeCount)} runtime dependents · {report.entrypoints.length} entry
            points reached · {report.tests.length} tests reached
          </span>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Neighbourhood</SectionTitle>
        <div className="border-border bg-surface rounded-lg border p-2">
          <svg viewBox={`0 0 900 ${height}`} width="100%" role="img" aria-label={label}>
            <title>{label}</title>
            {left.map((n, i) => (
              <path
                key={`el${i}`}
                d={curve(n.x + NODE_W, n.y + NODE_H / 2, COL_X.center, cy)}
                className="stroke-border fill-none"
                strokeWidth={1.5}
              />
            ))}
            {right.map((n, i) => (
              <path
                key={`er${i}`}
                d={curve(COL_X.center + NODE_W, cy, n.x, n.y + NODE_H / 2)}
                className="stroke-border fill-none"
                strokeWidth={1.5}
              />
            ))}
            <text x={COL_X.left} y={10} className="fill-subtle" fontSize={11}>
              IMPORTS
            </text>
            <text x={COL_X.right} y={10} className="fill-subtle" fontSize={11}>
              IMPORTED BY
            </text>
            <GraphBox
              node={{
                path,
                x: COL_X.center,
                y: centerY,
                clickable: false,
                label: base(path),
                role: file?.role ?? "unknown",
              }}
              center
              findings={findingsByPath.get(path)}
            />
            {[...left, ...right].map((n, i) => (
              <GraphBox
                key={`${n.path}${i}`}
                node={n}
                findings={findingsByPath.get(n.path)}
                onSelect={() => select(n.path)}
              />
            ))}
          </svg>
        </div>
        <p className="text-subtle text-xs">
          Dots mark files with open findings (amber medium or low, red high). The lists below hold
          the same information as text.
        </p>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <EdgeList title="Imports" edges={rawImports} />
        <EdgeList title="Imported by" edges={rawImportedBy} />
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Entry points affected ({report.entrypoints.length})</SectionTitle>
        {report.entrypoints.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No route or API entry point reaches this file through runtime imports.
          </p>
        ) : (
          <ul className="divide-border border-border bg-surface divide-y rounded-lg border">
            {report.entrypoints.slice(0, 10).map((item) => (
              <li key={item.path} className="flex flex-col gap-1 px-3 py-2">
                <FileLink path={item.path} />
                <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
                  {chainFor(report, item.path).map((step, i, all) => (
                    <li key={`${step}${i}`} className="flex items-center gap-1">
                      <span className="font-mono" title={step}>
                        {base(step)}
                      </span>
                      {i < all.length - 1 && <ChevronRight className="size-3" aria-hidden />}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
        {report.entrypoints.length > 10 && (
          <p className="text-muted-foreground text-xs">
            Showing 10 of {report.entrypoints.length} entry points.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Tests that reach this file ({report.tests.length})</SectionTitle>
        {report.tests.length === 0 ? (
          <EmptyState title="No test imports this file or anything that depends on it." />
        ) : (
          <ul className="divide-border border-border bg-surface divide-y rounded-lg border">
            {report.tests.slice(0, 15).map((item) => (
              <li key={item.path} className="flex min-h-10 items-center px-3 py-2">
                <FileLink path={item.path} />
              </li>
            ))}
          </ul>
        )}
        {report.tests.length > 15 && (
          <p className="text-muted-foreground text-xs">
            Showing 15 of {report.tests.length} tests.
          </p>
        )}
      </section>
    </>
  );
}

function GraphBox(props: {
  node: GraphNode;
  center?: boolean;
  findings?: import("@/lib/analysis/findings").Finding[] | undefined;
  onSelect?: () => void;
}) {
  const { node, center, findings, onSelect } = props;
  const severity = worstSeverity(findings);
  const text = node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label;
  const interactive = node.clickable && onSelect;
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.();
    }
  };
  return (
    <g
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `Open ${node.path}`,
            onClick: onSelect,
            onKeyDown: onKey,
            className: "cursor-pointer outline-none [&:focus-visible>rect]:stroke-primary",
          }
        : { role: "img", "aria-label": center ? `Selected file ${node.path}` : node.label })}
    >
      <title>{node.path || node.label}</title>
      <rect
        x={node.x}
        y={node.y}
        width={NODE_W}
        height={NODE_H}
        rx={8}
        strokeWidth={center ? 2 : 1.5}
        className={
          center
            ? "fill-surface-2 stroke-primary"
            : node.clickable
              ? "fill-surface stroke-border hover:stroke-primary"
              : "fill-background stroke-border"
        }
        strokeDasharray={node.clickable || center ? undefined : "4 3"}
      />
      <text x={node.x + 12} y={node.y + 17} fontSize={13} className="fill-foreground font-mono">
        {text}
      </text>
      <text x={node.x + 12} y={node.y + 32} fontSize={11} className="fill-muted-foreground">
        {node.role}
      </text>
      {severity && (
        <circle
          cx={node.x + NODE_W - 14}
          cy={node.y + 14}
          r={5}
          className={SEVERITY_TONE[severity] === "danger" ? "fill-danger" : "fill-warn"}
        />
      )}
    </g>
  );
}

function EdgeList({ title, edges }: { title: string; edges: Edge[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? edges : edges.slice(0, 25);
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>
        {title} ({edges.length})
      </SectionTitle>
      {edges.length === 0 ? (
        <p className="text-muted-foreground text-sm">None.</p>
      ) : (
        <ul className="divide-border border-border bg-surface divide-y rounded-lg border">
          {shown.map((edge, i) => (
            <li
              key={`${edge.path}:${edge.line}:${i}`}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <FileLink path={edge.path} line={edge.line} />
              {edge.typeOnly && <Badge>type only</Badge>}
            </li>
          ))}
        </ul>
      )}
      {edges.length > 25 && (
        <button
          type="button"
          className={`${buttonClass.ghost} self-start`}
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
        >
          {all ? "Show fewer" : `Show all ${edges.length}`}
        </button>
      )}
    </section>
  );
}
