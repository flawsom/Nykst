import { useState, useEffect, useMemo } from "react";
import { ORBIT_PAGE_SIZE, curvedEdgePath, orbitCardSize, radialLayout } from "@/lib/graph-layout";
import { kindLabel, type GraphNode, type NodeKind } from "@/lib/graph-data";

const kindColor: Record<NodeKind, string> = {
  org: "var(--brand-ivory)",
  domain: "var(--node-domain)",
  capability: "var(--node-capability)",
  service: "var(--node-service)",
  module: "var(--node-module)",
  file: "var(--node-file)",
};

/**
 * Edges are structure, so they stay support ink. Sand means the user has
 * selected a path. Bright crimson means the graph found a cycle.
 */
const EDGE_IMPORTER = "var(--subtle-foreground)";
const EDGE_CYCLE = "var(--risk)";
const EDGE_ACTIVE = "var(--brand-sand)";

interface Props {
  center: GraphNode;
  nodes: GraphNode[];
  childKind: NodeKind;
  onSelect: (node: GraphNode) => void;
  onInspect: (node: GraphNode) => void;
  selectedId?: string | undefined;
  technical?: boolean;
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function repoOf(node: GraphNode) {
  if (node.repo) return node.repo;
  const seg = node.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${node.owners[0]?.replace("@", "") ?? "org"}/${seg}`;
}

function techLine(node: GraphNode) {
  if (node.analysisRef) {
    const users = `${node.dependents.length} file${node.dependents.length === 1 ? "" : "s"} use it`;
    if (node.analysisRef.type === "file")
      return `${node.detail?.loc ?? 0} lines · ${users} · ${node.blast.level} impact`;
    const files = node.analysisRef.paths.length;
    return `${files} file${files === 1 ? "" : "s"} · ${users} · ${node.blast.level} impact`;
  }
  if (!node.expandable && node.detail)
    return `${node.detail.language} · ${node.detail.loc} lines · ${node.detail.path}`;
  return `${repoOf(node)} · ${node.language ?? "TypeScript"} · ${node.blast.services} outside services · ${node.dependencies.length} used · ${node.dependents.length} use it`;
}

function InfoBadge({
  x,
  y,
  color,
  label,
  onClick,
}: {
  x: number;
  y: number;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <g transform={`translate(${x}, ${y})`} onClick={onClick} className="cursor-pointer group">
      <rect
        x={-48}
        y={-10}
        width={96}
        height={20}
        rx={10}
        fill="var(--surface-2)"
        stroke={color}
        strokeWidth={1}
        className="transition-all group-hover:scale-105"
      />
      <text
        x={0}
        y={3}
        textAnchor="middle"
        className="fill-foreground text-[10px] font-mono font-semibold"
      >
        ℹ {label}
      </text>
    </g>
  );
}

export function GraphCanvas({
  center,
  nodes,
  childKind,
  onSelect,
  onInspect,
  selectedId,
  technical = true,
}: Props) {
  const children = nodes;
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [sector, setSector] = useState({ centerId: center.id, page: 0 });
  const pageCount = Math.max(1, Math.ceil(children.length / ORBIT_PAGE_SIZE));
  const page = sector.centerId === center.id ? Math.min(sector.page, pageCount - 1) : 0;
  void technical;

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, [center.id]);

  const W = 1200;
  const H = 820;
  const cx = W / 2;
  const cy = H / 2;

  // Always a circle: one orbit up to eight siblings, two staggered orbits above
  // that. No column or grid fallback, so a real repository never collapses into
  // a vertical lineup on /graph.
  const points = useMemo(() => {
    const visible = children.slice(page * ORBIT_PAGE_SIZE, (page + 1) * ORBIT_PAGE_SIZE);
    const slots = radialLayout(visible.length, { width: W, height: H });
    return visible.map((node, index) => ({ node, ...slots[index]! }));
  }, [children, page]);
  const ringSizes = useMemo(() => {
    const sizes = { 0: 0, 1: 0, 2: 0 } as Record<number, number>;
    for (const point of points) sizes[point.ring] = (sizes[point.ring] ?? 0) + 1;
    return sizes;
  }, [points]);
  // Card dimensions live with the orbit geometry, so the radii were chosen for
  // the actual card size rather than an estimate. This is what keeps a 13-node
  // root level from overlapping.
  const cardSize = (ring: 0 | 1 | 2) => orbitCardSize(ring, ringSizes[ring] ?? 0);

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      {pageCount > 1 && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-border bg-background/95 px-3 py-2 text-xs shadow-lg">
          <label className="flex items-center gap-2">
            <span>More items</span>
            <select
              aria-label="More items"
              data-testid="orbit-sector-switcher"
              className="max-w-44 bg-transparent text-foreground"
              value={page}
              onChange={(event) =>
                setSector({ centerId: center.id, page: Number(event.target.value) })
              }
            >
              {Array.from({ length: pageCount }, (_, index) => (
                <option key={index} value={index}>
                  Items {index * ORBIT_PAGE_SIZE + 1}-
                  {Math.min((index + 1) * ORBIT_PAGE_SIZE, children.length)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="relative h-full w-full"
        role="img"
        aria-label={`Map of ${center.label} and the items inside it`}
        data-graph-layout="radial"
      >
        <defs>
          <radialGradient id="haloGrad">
            <stop offset="0%" stopColor={kindColor[center.kind]} stopOpacity="0.4" />
            <stop offset="100%" stopColor={kindColor[center.kind]} stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={cx} cy={cy} r={210} fill="url(#haloGrad)" className="animate-halo" />

        {points.map((p, index) => {
          const active = hovered === p.node.id || selectedId === p.node.id;
          const cycle = p.node.cycle === true;
          const edge = curvedEdgePath(
            { x: cx, y: cy },
            mounted ? { x: p.x, y: p.y } : { x: cx, y: cy },
          );
          return (
            <g key={`e-${p.node.id}`}>
              <path
                d={edge}
                fill="none"
                stroke={active ? EDGE_ACTIVE : cycle ? EDGE_CYCLE : EDGE_IMPORTER}
                strokeWidth={active ? 2.2 : 1.2}
                strokeOpacity={active ? 0.95 : cycle ? 0.6 : 0.35}
                strokeLinecap="round"
                data-edge-kind={cycle ? "cycle" : "importer"}
                className="transition-all duration-300"
              />
              <path
                d={edge}
                fill="none"
                stroke={active ? EDGE_ACTIVE : EDGE_IMPORTER}
                strokeWidth={active ? 2 : 1.4}
                strokeOpacity={active ? 0.95 : 0.5}
                strokeLinecap="round"
                strokeDasharray="4 26"
                className="animate-edge-pulse pointer-events-none"
                style={{ animationDelay: `${(index % 8) * 0.42}s` }}
                data-edge-pulse={cycle ? "cycle" : "importer"}
              />
            </g>
          );
        })}

        {/* Center node */}
        <g className="animate-node-in" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle
            cx={cx}
            cy={cy}
            r={84}
            fill="var(--surface)"
            stroke={kindColor[center.kind]}
            strokeWidth={2}
          />
          <circle
            cx={cx}
            cy={cy}
            r={100}
            fill="none"
            stroke={kindColor[center.kind]}
            strokeOpacity={0.3}
            strokeDasharray="3 8"
          />
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            className="fill-foreground text-[18px] font-bold tracking-tight"
          >
            {truncate(center.label, 16)}
          </text>
          <text
            x={cx}
            y={cy + 18}
            textAnchor="middle"
            className="fill-subtle-foreground text-[11px] tracking-widest uppercase font-mono font-semibold"
          >
            {kindLabel[center.kind]}
          </text>
          <text
            x={cx}
            y={cy + 130}
            textAnchor="middle"
            className="fill-muted-foreground font-mono text-[11px]"
          >
            {truncate(techLine(center), 68)}
          </text>

          <InfoBadge
            x={cx}
            y={cy + 48}
            color={kindColor[center.kind]}
            label="Open details"
            onClick={() => onInspect(center)}
          />
        </g>

        {/* Surrounding circular nodes */}
        {points.map((p, i) => {
          const active = hovered === p.node.id || selectedId === p.node.id;
          const { width: w, height: h } = cardSize(p.ring);
          const labelChars = Math.max(10, Math.floor((w - 44) / 6.4));
          const techChars = Math.max(11, Math.floor((w - 44) / 5.2));
          return (
            <g
              key={p.node.id}
              transform={`translate(${mounted ? p.x : cx}, ${mounted ? p.y : cy})`}
              className="transition-transform duration-500 ease-out group"
              style={{ transitionDelay: `${i * 30}ms`, opacity: mounted ? 1 : 0 }}
              onMouseEnter={() => setHovered(p.node.id)}
              onMouseLeave={() => setHovered(null)}
              data-graph-node={p.node.id}
              data-x={Math.round(p.x)}
              data-y={Math.round(p.y)}
              data-ring={p.ring}
            >
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                rx={12}
                fill={active ? "var(--surface-2)" : "var(--surface)"}
                stroke={p.node.cycle ? EDGE_CYCLE : active ? EDGE_ACTIVE : kindColor[childKind]}
                strokeWidth={active || p.node.cycle ? 2 : 1}
                strokeOpacity={active ? 1 : 0.55}
                className="transition-all duration-300 shadow-lg cursor-pointer"
                onClick={() => onSelect(p.node)}
              />
              <circle
                cx={-w / 2 + 18}
                cy={-4}
                r={4}
                fill={p.node.cycle ? EDGE_CYCLE : kindColor[p.node.kind]}
                className="cursor-pointer"
                onClick={() => onSelect(p.node)}
              />
              <text
                x={-w / 2 + 32}
                y={-2}
                className="fill-foreground text-[12px] font-semibold tracking-tight cursor-pointer"
                onClick={() => onSelect(p.node)}
              >
                {truncate(p.node.label, labelChars)}
              </text>
              <text
                x={-w / 2 + 32}
                y={14}
                className="fill-muted-foreground font-mono text-[9px] cursor-pointer"
                onClick={() => onSelect(p.node)}
              >
                {truncate(techLine(p.node), techChars)}
              </text>

              {/* 'i' badge opens the inspector for this child */}
              <g
                transform={`translate(${w / 2 - 24}, 0)`}
                className="cursor-pointer group/info"
                onClick={(e) => {
                  e.stopPropagation();
                  onInspect(p.node);
                }}
              >
                <circle
                  cx={0}
                  cy={0}
                  r={9}
                  fill="var(--surface-2)"
                  stroke={kindColor[childKind]}
                  strokeWidth={1}
                  className="transition-transform group-hover/info:scale-110"
                />
                <text
                  x={0}
                  y={3.5}
                  textAnchor="middle"
                  className="fill-foreground text-[10px] font-serif font-bold italic"
                >
                  i
                </text>
              </g>
            </g>
          );
        })}

        {/* Edge legend */}
        <g transform={`translate(${cx}, ${H - 18})`}>
          <g transform="translate(-190, 0)">
            <line x1={0} y1={0} x2={22} y2={0} stroke={EDGE_IMPORTER} strokeWidth={2} />
            <text
              x={30}
              y={4}
              className="fill-muted-foreground font-mono text-[10px]"
              data-legend="importer"
            >
              connected to this part
            </text>
          </g>
          <g transform="translate(30, 0)">
            <line x1={0} y1={0} x2={22} y2={0} stroke={EDGE_CYCLE} strokeWidth={2} />
            <text
              x={30}
              y={4}
              className="fill-muted-foreground font-mono text-[10px]"
              data-legend="cycle"
            >
              two-way dependency
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
