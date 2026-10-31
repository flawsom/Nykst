import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const W = 780;
const H = 640;
const CX = W / 2;
const CY = 316;
const RADIUS_X = 286;
const RADIUS_Y = 228;

export type LandingMapData = {
  repository: string;
  generatedAt?: string;
  stats: {
    analyzedFiles: number;
    internalEdges: number;
    loc: number;
  };
  domains: Array<{
    domain: string;
    files: number;
    loc: number;
    edgesOut: number;
    edgesIn: number;
    sampleFiles: string[];
  }>;
};

/**
 * The hero shows the last compiled map immediately, then swaps to the live
 * analysis when it arrives. That is real evidence, not a loading illustration,
 * and the first screen never depends on a slow request to become useful.
 */
export function LandingGraphPreview({
  className,
  data,
  isLive,
  onSelectDomain,
  onRetry,
  retryLabel,
}: {
  className?: string;
  data: LandingMapData;
  isLive: boolean;
  onSelectDomain?: (sampleFile: string) => void;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 80);
    return () => window.clearTimeout(timer);
  }, []);

  const rawDomains = data.domains.slice(0, 10);
  const satellites = rawDomains.map((domain, index) => {
    const angle = (index / Math.max(rawDomains.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...domain,
      x: CX + Math.cos(angle) * RADIUS_X,
      y: CY + Math.sin(angle) * RADIUS_Y,
    };
  });
  const stats = data.stats;
  const savedDate = data.generatedAt
    ? new Date(data.generatedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className={className}>
      <div
        className="border-border bg-card relative overflow-hidden rounded-2xl border"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <div className="border-border/80 flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`size-1.5 shrink-0 rounded-full ${isLive ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}
            />
            <span className="text-muted-foreground truncate font-mono text-[10px] tracking-[0.14em] uppercase">
              {data.repository} · system map
            </span>
          </div>
          <span className="text-muted-foreground shrink-0 font-mono text-[9px] tracking-[0.14em] uppercase">
            {isLive ? "Live analysis" : savedDate ? `Saved ${savedDate}` : "Saved analysis"}
          </span>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="relative block h-auto w-full"
            role="img"
            aria-label={`Nykst system map of ${data.repository}, showing ${stats.analyzedFiles} files and ${stats.internalEdges} import connections in ${rawDomains.length} areas`}
          >
            <circle
              cx={CX}
              cy={CY}
              r={148}
              fill="none"
              stroke="var(--border)"
              strokeDasharray="2 10"
              strokeOpacity="0.75"
            />
            <circle
              cx={CX}
              cy={CY}
              r={248}
              fill="none"
              stroke="var(--border)"
              strokeDasharray="2 14"
              strokeOpacity="0.5"
              className="animate-orbit-pulse"
            />

            {satellites.map((node, index) => {
              const isHovered = hoveredIdx === index;
              const mx = (CX + node.x) / 2;
              const my = (CY + node.y) / 2;
              const dx = node.x - CX;
              const dy = node.y - CY;
              const length = Math.hypot(dx, dy) || 1;
              const qx = mx + (-dy / length) * length * 0.14;
              const qy = my + (dx / length) * length * 0.14;
              const path = mounted
                ? `M ${CX} ${CY} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${node.x.toFixed(1)} ${node.y.toFixed(1)}`
                : `M ${CX} ${CY} Q ${CX} ${CY} ${CX} ${CY}`;
              return (
                <g key={node.domain}>
                  <path
                    d={path}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={isHovered ? 1.8 : 1}
                    strokeOpacity={isHovered ? 0.9 : 0.3}
                    strokeDasharray={isHovered ? "5 9" : undefined}
                    className={`pointer-events-none transition-all duration-500 ${isHovered ? "animate-edge-pulse" : ""}`}
                  />
                </g>
              );
            })}

            {satellites.map((node, index) => {
              const width = 178;
              const height = 42;
              const isHovered = hoveredIdx === index;
              const sampleFile = node.sampleFiles[0] ?? "";
              const canOpen = Boolean(sampleFile && onSelectDomain);
              return (
                <g
                  key={node.domain}
                  transform={`translate(${mounted ? node.x : CX}, ${mounted ? node.y : CY})`}
                  className={canOpen ? "cursor-pointer" : undefined}
                  style={{
                    transition: "transform 600ms cubic-bezier(0.22, 1, 0.36, 1), filter 300ms ease",
                    transitionDelay: `${index * 28}ms`,
                    opacity: mounted ? 1 : 0,
                    filter:
                      isHovered && canOpen ? "drop-shadow(0 0 7px var(--primary))" : undefined,
                  }}
                  onMouseEnter={() => setHoveredIdx(index)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => {
                    if (canOpen) onSelectDomain?.(sampleFile);
                  }}
                  data-preview-domain={node.domain}
                >
                  <rect
                    x={-width / 2}
                    y={-height / 2}
                    width={width}
                    height={height}
                    rx={8}
                    fill="var(--surface)"
                    stroke={isHovered && canOpen ? "var(--primary)" : "var(--border)"}
                    strokeWidth={isHovered && canOpen ? 1.4 : 1}
                  />
                  <circle
                    cx={-width / 2 + 14}
                    cy={-3}
                    r={3}
                    fill={isHovered ? "var(--primary)" : "var(--muted-foreground)"}
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
                    {node.files} files · {node.edgesIn + node.edgesOut} connections ·{" "}
                    {node.loc.toLocaleString()} lines
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
                strokeWidth={1.5}
              />
              <circle
                cx={CX}
                cy={CY}
                r={94}
                fill="none"
                stroke="var(--primary)"
                strokeOpacity={0.25}
                strokeDasharray="3 8"
                className="animate-orbit-pulse"
              />
              <text
                x={CX}
                y={CY - 14}
                textAnchor="middle"
                className="fill-foreground font-display text-[19px] font-semibold tracking-tight"
              >
                {data.repository.split("/").pop()}
              </text>
              <text
                x={CX}
                y={CY + 6}
                textAnchor="middle"
                className="fill-primary font-mono text-[8.5px] tracking-[0.24em] uppercase"
              >
                Real project map
              </text>
              <text
                x={CX}
                y={CY + 24}
                textAnchor="middle"
                className="fill-muted-foreground font-mono text-[8.5px]"
              >
                {stats.internalEdges} connections · {stats.loc.toLocaleString()} lines
              </text>
            </g>

            <text
              x={CX}
              y={H - 16}
              textAnchor="middle"
              className="fill-muted-foreground font-mono text-[9px]"
            >
              {isLive
                ? "Read from this repository in this page load"
                : "The last compiled map. Live analysis starts when the server answers."}
            </text>
          </svg>
        </div>

        <div className="border-border/80 text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 font-mono text-[10px]">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="bg-primary inline-block size-1.5 rounded-full" /> Repository root
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-node-domain inline-block size-1.5 rounded-full" /> project area
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-node-service inline-block size-1.5 rounded-full" /> service or
              data
            </span>
          </span>
          {isLive ? (
            <span className="text-primary">
              {stats.analyzedFiles} files · {stats.internalEdges} connections
            </span>
          ) : onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="text-primary inline-flex items-center gap-1.5 hover:underline"
            >
              <RefreshCw className="size-3" /> {retryLabel ?? "Refresh live map"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
