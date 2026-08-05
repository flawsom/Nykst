import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { GraphNode, NodeKind } from "@/lib/graph-data";

const kindColor: Record<NodeKind, string> = {
  org: "var(--primary)",
  domain: "var(--node-domain)",
  capability: "var(--node-capability)",
  service: "var(--node-service)",
  module: "var(--node-module)",
  file: "var(--node-file)",
};

interface Props {
  center: GraphNode;
  nodes: GraphNode[];
  childKind: NodeKind;
  onSelect: (node: GraphNode) => void;
  onInspect: (node: GraphNode) => void;
  selectedId?: string | undefined;
  /** engineers see repo/technical metadata on every node */
  technical?: boolean;
}

/** Repo-shaped identifier so engineers can map a node to source. */
function repoOf(node: GraphNode) {
  const seg = node.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${node.owners[0]?.replace("@", "") ?? "org"}/${seg}`;
}

function techLine(node: GraphNode) {
  if (!node.expandable && node.detail)
    return `${node.detail.language} · ${node.detail.loc} LOC · ${node.detail.path}`;
  return `${repoOf(node)} · ${node.blast.services} svc · ${node.dependencies.length}↑ ${node.dependents.length}↓`;
}

export function GraphCanvas({
  center,
  nodes,
  childKind,
  onSelect,
  onInspect,
  selectedId,
  technical = false,
}: Props) {
  const children = nodes;
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, [center.id]);

  const W = 1000;
  const H = 700;
  const cx = W / 2;
  const cy = H / 2;

  const points = useMemo(() => {
    const n = Math.max(children.length, 1);
    const rx = n > 8 ? 360 : 320;
    const ry = n > 8 ? 250 : 225;
    return children.map((child, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        node: child,
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry,
      };
    });
  }, [children, cx, cy]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <svg viewBox={`0 0 ${W} ${H}`} className="relative h-full w-full" role="img">
        <defs>
          <radialGradient id="haloGrad">
            <stop offset="0%" stopColor={kindColor[center.kind]} stopOpacity="0.35" />
            <stop offset="100%" stopColor={kindColor[center.kind]} stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={cx} cy={cy} r={190} fill="url(#haloGrad)" className="animate-halo" />

        {points.map((p, i) => {
          const active = hovered === p.node.id || selectedId === p.node.id;
          return (
            <line
              key={`e-${p.node.id}`}
              x1={cx}
              y1={cy}
              x2={mounted ? p.x : cx}
              y2={mounted ? p.y : cy}
              stroke={active ? kindColor[childKind] : "var(--border)"}
              strokeWidth={active ? 1.8 : 1}
              className={cn("transition-all duration-500", active && "edge-flow")}
              style={{ transitionDelay: `${i * 24}ms`, opacity: mounted ? 1 : 0 }}
            />
          );
        })}

        {/* center node */}
        <g className="animate-node-in" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle
            cx={cx}
            cy={cy}
            r={78}
            fill="var(--surface)"
            stroke={kindColor[center.kind]}
            strokeWidth={1.6}
          />
          <circle
            cx={cx}
            cy={cy}
            r={94}
            fill="none"
            stroke={kindColor[center.kind]}
            strokeOpacity={0.25}
            strokeDasharray="2 7"
          />
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            className="fill-foreground text-[18px] font-semibold"
          >
            {truncate(center.label, 16)}
          </text>
          <text
            x={cx}
            y={cy + 18}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px] tracking-widest uppercase"
          >
            {center.kind}
          </text>
          {technical && (
            <text
              x={cx}
              y={cy + 122}
              textAnchor="middle"
              className="fill-muted-foreground font-mono text-[11px]"
            >
              {truncate(techLine(center), 62)}
            </text>
          )}

          <InfoBadge
            x={cx}
            y={cy + 46}
            color={kindColor[center.kind]}
            label={center.label}
            onClick={() => onInspect(center)}
          />
        </g>


        {points.map((p, i) => {
          const active = hovered === p.node.id || selectedId === p.node.id;
          const hasChildren = p.node.expandable;
          const w = Math.min(
            technical ? 268 : 230,
            Math.max(technical ? 190 : 140, p.node.label.length * 9 + 78),
          );
          const h = technical ? 54 : 42;
          return (
            <g
              key={p.node.id}
              transform={`translate(${mounted ? p.x : cx}, ${mounted ? p.y : cy})`}
              className="cursor-pointer transition-transform duration-500 ease-out"
              style={{ transitionDelay: `${i * 30}ms`, opacity: mounted ? 1 : 0 }}
              onMouseEnter={() => setHovered(p.node.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                rx={12}
                fill={active ? "var(--surface-2)" : "var(--surface)"}
                stroke={active ? kindColor[childKind] : "var(--border)"}
                strokeWidth={active ? 1.6 : 1}
                className="transition-all duration-200"
                onClick={() => onSelect(p.node)}
              />
              <circle
                cx={-w / 2 + 18}
                cy={technical ? -7 : 0}
                r={4}
                fill={kindColor[childKind]}
                onClick={() => onSelect(p.node)}
              />
              <text
                x={-w / 2 + 32}
                y={technical ? -3 : 4}
                className="fill-foreground text-[13px] font-medium"
                onClick={() => onSelect(p.node)}
              >
                {truncate(p.node.label, technical ? 22 : 18)}
              </text>
              {technical && (
                <text
                  x={-w / 2 + 32}
                  y={14}
                  className="fill-muted-foreground font-mono text-[9px]"
                  onClick={() => onSelect(p.node)}
                >
                  {truncate(techLine(p.node), 34)}
                </text>
              )}
              {hasChildren && (
                <circle
                  cx={w / 2 - 40}
                  cy={technical ? -7 : 0}
                  r={3}
                  fill={kindColor[childKind]}
                  fillOpacity={0.55}
                />
              )}
              <InfoBadge
                x={w / 2 - 20}
                y={technical ? -7 : 0}
                color={kindColor[childKind]}
                label={p.node.label}
                onClick={() => onInspect(p.node)}
              />

            </g>

          );
        })}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function InfoBadge({
  x,
  y = 0,
  color,
  label,
  onClick,
}: {
  x: number;
  y?: number;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={`Details for ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <circle r={10} fill="var(--surface-2)" stroke={color} strokeOpacity={0.6} strokeWidth={1} />
      <text
        textAnchor="middle"
        y={4}
        className="fill-foreground text-[11px] font-semibold"
        style={{ pointerEvents: "none" }}
      >
        i
      </text>
    </g>
  );
}
