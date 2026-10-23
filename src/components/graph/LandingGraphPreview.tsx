import { useEffect, useState } from "react";
import type { LiveSelfAnalysis } from "@/components/graph/LiveGraphRagExplorer";
import { TiltCard } from "@/components/motion/VariantMotion";

const W = 780;
const H = 640;
const CX = W / 2;
const CY = 316;
const RADIUS_X = 286;
const RADIUS_Y = 228;

/**
 * Live interactive Graph-RAG preview rendered strictly from the real TypeScript AST analysis
 * of flawsom/nykst (or the connected repository). Zero static or hardcoded fallback arrays.
 */
export function LandingGraphPreview({
  className,
  liveData,
  onSelectDomain,
}: {
  className?: string;
  liveData?: LiveSelfAnalysis | null;
  onSelectDomain?: (sampleFile: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 90);
    return () => window.clearTimeout(timer);
  }, []);

  const rawDomains = liveData?.domains?.slice(0, 10) ?? [];

  const satellites = rawDomains.map((d, i) => {
    const angle = (i / Math.max(rawDomains.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...d,
      x: CX + Math.cos(angle) * RADIUS_X,
      y: CY + Math.sin(angle) * RADIUS_Y,
    };
  });

  const stats = liveData?.stats;

  return (
    <TiltCard maxTilt={4} className={className}>
      <div
        className="border-border bg-card/85 relative overflow-hidden rounded-2xl border backdrop-blur"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <div className="border-border/80 flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-400/80" />
            <span className="size-2 rounded-full bg-amber-400/80" />
            <span className="size-2 rounded-full bg-emerald-400/80" />
            <span className="text-muted-foreground ml-2 truncate font-mono text-[10px] tracking-wide">
              nykst://ast/{liveData?.repository ?? "compiling..."}
            </span>
          </div>
          <span className="border-primary/40 bg-primary/15 text-primary flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[9px] tracking-[0.16em] uppercase">
            <span className="bg-primary size-1.5 rounded-full animate-pulse" />
            {stats ? `live AST · ${stats.analyzedFiles} files` : "compiling live AST…"}
          </span>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-0 bg-grid" />
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="relative block h-auto w-full"
            role="img"
            aria-label="Live Nykst Graph-RAG topology showing real AST domains, file counts, and import edges"
          >
            <defs>
              <radialGradient id="landing-halo">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.34" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="landing-edge" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.65" />
                <stop offset="100%" stopColor="var(--node-domain)" stopOpacity="0.18" />
              </linearGradient>
            </defs>

            <circle cx={CX} cy={CY} r={224} fill="url(#landing-halo)" className="animate-halo" />
            <circle
              cx={CX}
              cy={CY}
              r={148}
              fill="none"
              stroke="var(--border)"
              strokeDasharray="2 10"
              strokeOpacity="0.7"
            />
            <circle
              cx={CX}
              cy={CY}
              r={248}
              fill="none"
              stroke="var(--border)"
              strokeDasharray="2 14"
              strokeOpacity="0.45"
            />

            {satellites.map((node, i) => {
              const isHovered = hoveredIdx === i;
              const mx = (CX + node.x) / 2;
              const my = (CY + node.y) / 2;
              const dx = node.x - CX;
              const dy = node.y - CY;
              const len = Math.hypot(dx, dy) || 1;
              const qx = mx + (-dy / len) * len * 0.14;
              const qy = my + (dx / len) * len * 0.14;
              const pathD = mounted
                ? `M ${CX} ${CY} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${node.x.toFixed(1)} ${node.y.toFixed(1)}`
                : `M ${CX} ${CY} Q ${CX} ${CY} ${CX} ${CY}`;
              return (
                <g key={node.domain}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isHovered ? "var(--primary)" : "url(#landing-edge)"}
                    strokeWidth={isHovered ? 2.2 : 1.3}
                    className="edge-flow transition-all duration-700"
                    style={{ transitionDelay: `${i * 35}ms` }}
                  />
                </g>
              );
            })}

            {satellites.map((node, i) => {
              const width = 178;
              const height = 42;
              const isHovered = hoveredIdx === i;
              const sampleFile =
                Array.isArray(node.sampleFiles) && node.sampleFiles[0]
                  ? node.sampleFiles[0]
                  : "src/lib/analysis/engine.server.ts";
              return (
                <g
                  key={node.domain}
                  transform={`translate(${mounted ? node.x : CX}, ${mounted ? node.y : CY})`}
                  className="cursor-pointer transition-all duration-700 ease-out"
                  style={{ transitionDelay: `${i * 35}ms`, opacity: mounted ? 1 : 0 }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => onSelectDomain?.(sampleFile)}
                  data-preview-domain={node.domain}
                >
                  <rect
                    x={-width / 2}
                    y={-height / 2}
                    width={width}
                    height={height}
                    rx={10}
                    fill="var(--surface)"
                    stroke={isHovered ? "var(--primary)" : "var(--border)"}
                    strokeWidth={isHovered ? 1.6 : 1}
                  />
                  <circle
                    cx={-width / 2 + 14}
                    cy={-3}
                    r={3.4}
                    fill={isHovered ? "var(--primary)" : "var(--node-domain)"}
                  />
                  <text
                    x={-width / 2 + 24}
                    y={-2}
                    className="fill-foreground font-mono text-[10.5px] font-semibold tracking-tight"
                  >
                    {node.domain.length > 22 ? `${node.domain.slice(0, 21)}…` : node.domain}
                  </text>
                  <text
                    x={-width / 2 + 24}
                    y={12}
                    className="fill-muted-foreground font-mono text-[8.5px]"
                  >
                    {node.files} files · {node.edgesIn + node.edgesOut} AST edges ·{" "}
                    {node.loc.toLocaleString()} LOC
                  </text>
                </g>
              );
            })}

            <g>
              <circle
                cx={CX}
                cy={CY}
                r={76}
                fill="var(--surface)"
                stroke="var(--primary)"
                strokeWidth={1.8}
              />
              <circle
                cx={CX}
                cy={CY}
                r={94}
                fill="none"
                stroke="var(--primary)"
                strokeOpacity={0.28}
                strokeDasharray="3 8"
              />
              <text
                x={CX}
                y={CY - 14}
                textAnchor="middle"
                className="fill-foreground text-[19px] font-bold tracking-tight"
              >
                {liveData?.repository ? liveData.repository.split("/").pop() : "nykst"}
              </text>
              <text
                x={CX}
                y={CY + 6}
                textAnchor="middle"
                className="fill-primary font-mono text-[8.5px] tracking-[0.24em] uppercase"
              >
                GRAPH-RAG AST
              </text>
              <text
                x={CX}
                y={CY + 24}
                textAnchor="middle"
                className="fill-muted-foreground font-mono text-[8.5px]"
              >
                {stats
                  ? `${stats.internalEdges} edges · ${stats.loc.toLocaleString()} LOC`
                  : "loading live topology…"}
              </text>
            </g>

            <g transform={`translate(${CX - 112}, ${CY + 116})`}>
              <rect
                x={0}
                y={0}
                width={224}
                height={26}
                rx={13}
                fill="var(--surface-2)"
                stroke="var(--primary)"
                strokeOpacity={0.4}
              />
              <text
                x={112}
                y={17}
                textAnchor="middle"
                className="fill-primary font-mono text-[9px] font-semibold tracking-[0.12em] uppercase"
              >
                click any domain to trace blast radius
              </text>
            </g>

            <text
              x={CX}
              y={H - 16}
              textAnchor="middle"
              className="fill-muted-foreground font-mono text-[9px]"
            >
              {stats
                ? `Real-time TypeScript AST telemetry · parsed in ${stats.durationMs}ms · 0 simulated nodes`
                : "Real-time TypeScript AST telemetry · 0 simulated nodes"}
            </text>
          </svg>
        </div>

        <div className="border-border/80 text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 font-mono text-[10px]">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="bg-primary inline-block size-1.5 rounded-full" /> AST root
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-node-domain inline-block size-1.5 rounded-full" /> derived domain
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-node-service inline-block size-1.5 rounded-full" /> SQL & service
              edges
            </span>
          </span>
          <span className="text-primary">ts.createSourceFile · Tarjan SCC</span>
        </div>
      </div>
    </TiltCard>
  );
}
