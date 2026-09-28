import { useState, useEffect, useMemo } from "react";
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
  technical?: boolean;
}

/** Above this many children the ring layout overlaps, so switch to a grid. */
const DENSE_THRESHOLD = 14;

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
    const importers = `${node.dependents.length} importer${node.dependents.length === 1 ? "" : "s"}`;
    if (node.analysisRef.type === "file")
      return `${node.detail?.loc ?? 0} LOC · ${importers} · ${node.blast.level} impact`;
    const files = node.analysisRef.paths.length;
    return `${files} file${files === 1 ? "" : "s"} · ${importers} · ${node.blast.level} impact`;
  }
  if (!node.expandable && node.detail)
    return `${node.detail.language} · ${node.detail.loc} LOC · ${node.detail.path}`;
  return `${repoOf(node)} · ${node.language ?? "TypeScript"} · ${node.blast.services} svc · ${node.dependencies.length}↑ ${node.dependents.length}↓`;
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

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, [center.id]);

  const W = 1200;
  const H = 820;
  const cx = W / 2;
  const cy = H / 2;

  const dense = children.length > DENSE_THRESHOLD;
  const points = useMemo(() => {
    if (dense) {
      // Grid of slots around the center, nearest first, so the most important
      // children (they arrive sorted) sit closest to the node they belong to.
      const slots: { x: number; y: number }[] = [];
      for (let row = 0; row < 13; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          const x = 110 + col * 245;
          const y = 40 + row * 62;
          if (Math.abs(x - cx) < 360 && y > cy - 150 && y < cy + 175) continue;
          slots.push({ x, y });
        }
      }
      slots.sort(
        (a, b) => Math.hypot((a.x - cx) / 1.4, a.y - cy) - Math.hypot((b.x - cx) / 1.4, b.y - cy),
      );
      return children.slice(0, slots.length).map((child, i) => ({ node: child, ...slots[i]! }));
    }
    const n = Math.max(children.length, 1);
    const radiusX = n > 8 ? 470 : 410;
    const radiusY = n > 8 ? 330 : 285;

    return children.map((child, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        node: child,
        x: cx + Math.cos(angle) * radiusX,
        y: cy + Math.sin(angle) * radiusY,
      };
    });
  }, [children, cx, cy, dense]);
  const hiddenCount = children.length - points.length;

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <svg viewBox={`0 0 ${W} ${H}`} className="relative h-full w-full" role="img">
        <defs>
          <radialGradient id="haloGrad">
            <stop offset="0%" stopColor={kindColor[center.kind]} stopOpacity="0.4" />
            <stop offset="100%" stopColor={kindColor[center.kind]} stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={cx} cy={cy} r={210} fill="url(#haloGrad)" className="animate-halo" />

        {points.map((p) => {
          const active = hovered === p.node.id || selectedId === p.node.id;
          return (
            <line
              key={`e-${p.node.id}`}
              x1={cx}
              y1={cy}
              x2={mounted ? p.x : cx}
              y2={mounted ? p.y : cy}
              stroke={active ? kindColor[childKind] : "var(--border)"}
              strokeWidth={active ? 2 : 1}
              strokeOpacity={active ? 0.9 : 0.4}
              className="transition-all duration-300"
            />
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
            className="fill-primary text-[11px] tracking-widest uppercase font-mono font-semibold"
          >
            {center.kind}
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
            label="Inspect Details"
            onClick={() => onInspect(center)}
          />
        </g>

        {/* Surrounding circular nodes */}
        {points.map((p, i) => {
          const active = hovered === p.node.id || selectedId === p.node.id;
          const w = dense ? 200 : 260;
          const h = dense ? 46 : 56;
          return (
            <g
              key={p.node.id}
              transform={`translate(${mounted ? p.x : cx}, ${mounted ? p.y : cy})`}
              className="transition-transform duration-500 ease-out group"
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
                strokeWidth={active ? 2 : 1}
                className="transition-all duration-300 shadow-lg cursor-pointer"
                onClick={() => onSelect(p.node)}
              />
              <circle
                cx={-w / 2 + 18}
                cy={-4}
                r={4}
                fill={kindColor[p.node.kind]}
                className="cursor-pointer"
                onClick={() => onSelect(p.node)}
              />
              <text
                x={-w / 2 + 32}
                y={-2}
                className="fill-foreground text-[12px] font-semibold tracking-tight cursor-pointer"
                onClick={() => onSelect(p.node)}
              >
                {truncate(p.node.label, dense ? 17 : 20)}
              </text>
              <text
                x={-w / 2 + 32}
                y={14}
                className="fill-muted-foreground font-mono text-[9px] cursor-pointer"
                onClick={() => onSelect(p.node)}
              >
                {truncate(techLine(p.node), dense ? 26 : 34)}
              </text>

              {/* Original 'i' badge button on each child node */}
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
                  className="fill-primary text-[10px] font-serif font-bold italic"
                >
                  i
                </text>
              </g>
            </g>
          );
        })}
        {hiddenCount > 0 && (
          <text
            x={cx}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted-foreground font-mono text-[11px]"
          >
            +{hiddenCount} more — see the system tree
          </text>
        )}
      </svg>
    </div>
  );
}
