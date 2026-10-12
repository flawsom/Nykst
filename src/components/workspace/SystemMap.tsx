import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ImpactLevel } from "@/lib/analysis/impact";
import type { Finding } from "@/lib/analysis/findings";
import { IMPACT_TONE, SEVERITY_TONE } from "@/lib/workspace/model";
import { buildHierarchy, squarify, type HNode } from "@/lib/workspace/treemap";
import { useWorkspace } from "./WorkspaceContext";
import { Badge, buttonClass } from "./ui";

const nf = new Intl.NumberFormat("en-US");
const HEADER = 20;
const BLAST_CAP = 300;
const MAX_TILES = 700;

type Tone = "danger" | "warn" | "info" | "none";
type Mode = "findings" | "blast";
const SEV = { high: 3, medium: 2, low: 1 } as const;
const LEVEL_TONE: Record<ImpactLevel, Tone> = {
  Low: "none",
  Moderate: "info",
  High: "warn",
  Critical: "danger",
};
const TONE_RANK: Record<Tone, number> = { none: 0, info: 1, warn: 2, danger: 3 };
const FILE_TINT: Record<Tone, string> = {
  danger: "bg-danger-soft border-danger/50",
  warn: "bg-warn-soft border-warn/50",
  info: "bg-info-soft border-info/50",
  none: "bg-surface-2 border-border",
};
const DIR_TINT: Record<Tone, string> = { ...FILE_TINT, none: "bg-surface border-border" };
const SWATCH: Record<Tone, string> = {
  danger: "bg-danger-soft border-danger/50",
  warn: "bg-warn-soft border-warn/50",
  info: "bg-info-soft border-info/50",
  none: "bg-surface-2 border-border",
};

interface Tile {
  node: HNode;
  x: number;
  y: number;
  w: number;
  h: number;
  level: 0 | 1;
  /** folder tile that holds nested tiles */
  open: boolean;
}

function layout(current: HNode, width: number, height: number): Tile[] {
  const tiles: Tile[] = [];
  const place = (
    nodes: HNode[],
    rect: { x: number; y: number; w: number; h: number },
    level: 0 | 1,
  ) => {
    const byId = new Map(nodes.map((n) => [n.path, n]));
    const placed = squarify(
      nodes.map((n) => ({ id: n.path, value: Math.max(1, n.loc) })),
      rect,
    );
    for (const p of placed) {
      if (tiles.length >= MAX_TILES) return;
      if (p.w < 5 || p.h < 5) continue;
      const node = byId.get(p.id)!;
      const roomy = level === 0 && node.kind === "dir" && p.w >= 84 && p.h >= 56;
      tiles.push({ node, x: p.x, y: p.y, w: p.w, h: p.h, level, open: roomy });
      if (roomy)
        place(
          node.children.slice(0, 60),
          { x: p.x + 3, y: p.y + HEADER, w: p.w - 6, h: p.h - HEADER - 3 },
          1,
        );
    }
  };
  place(current.children, { x: 0, y: 0, w: width, h: height }, 0);
  return tiles;
}

function chainTo(node: HNode, path: string): HNode[] | null {
  if (node.path === path) return [node];
  for (const child of node.children) {
    if (child.kind !== "dir") continue;
    const rest = chainTo(child, path);
    if (rest) return [node, ...rest];
  }
  return null;
}

const plural = (n: number, word: string) => `${nf.format(n)} ${word}${n === 1 ? "" : "s"}`;

function findingsText(list: Finding[] | undefined) {
  if (!list || list.length === 0) return "no findings";
  const high = list.filter((f) => f.severity === "high").length;
  return `${plural(list.length, "finding")}${high ? `, ${high} high` : ""}`;
}

export function SystemMap() {
  const { data, index, selected, select, impact, findingsByPath } = useWorkspace();
  const [zoom, setZoom] = useState("");
  const [mode, setMode] = useState<Mode>("findings");
  const [hover, setHover] = useState<Tile | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const read = () => setSize({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const root = useMemo(
    () => buildHierarchy(data.analysis.files.map((f) => ({ path: f.path, loc: f.loc }))),
    [data.analysis],
  );
  const chain = useMemo(() => chainTo(root, zoom) ?? [root], [root, zoom]);
  const current = chain[chain.length - 1]!;

  /** worst severity and count of findings at or under every folder */
  const folderRisk = useMemo(() => {
    const map = new Map<string, { sev: number; ids: Set<string> }>();
    for (const finding of data.findings)
      for (const path of finding.paths) {
        const parts = path.split("/");
        for (let i = 1; i <= parts.length; i++) {
          const key = parts.slice(0, i).join("/");
          const entry = map.get(key) ?? { sev: 0, ids: new Set<string>() };
          entry.sev = Math.max(entry.sev, SEV[finding.severity]);
          entry.ids.add(finding.id);
          map.set(key, entry);
        }
      }
    return map;
  }, [data.findings]);

  const tiles = useMemo(
    () => (size.w > 40 && size.h > 40 ? layout(current, size.w, size.h) : []),
    [current, size],
  );

  const blast = useMemo(() => {
    const levels = new Map<string, ImpactLevel>();
    if (mode !== "blast") return levels;
    tiles
      .filter((t) => t.node.kind === "file")
      .sort((a, b) => b.w * b.h - a.w * a.h)
      .slice(0, BLAST_CAP)
      .forEach((t) => levels.set(t.node.path, impact([t.node.path]).level));
    return levels;
  }, [mode, tiles, impact]);

  const dependentCount = (path: string) =>
    new Set((index.dependents.get(path) ?? []).map((e) => e.path)).size;
  const maxDependents = useMemo(
    () =>
      Math.max(
        1,
        ...tiles.filter((t) => t.node.kind === "file").map((t) => dependentCount(t.node.path)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiles, index],
  );

  const toneOf = (tile: Tile): Tone => {
    const { node } = tile;
    if (mode === "findings") {
      const sev =
        node.kind === "file"
          ? Math.max(0, ...(findingsByPath.get(node.path) ?? []).map((f) => SEV[f.severity]))
          : (folderRisk.get(node.path)?.sev ?? 0);
      return sev === 3 ? "danger" : sev === 2 ? "warn" : sev === 1 ? "info" : "none";
    }
    if (node.kind === "file") return LEVEL_TONE[blast.get(node.path) ?? "Low"];
    let best: Tone = "none";
    for (const t of tiles)
      if (t.level === 1 && t.node.path.startsWith(`${node.path}/`) && t.node.kind === "file") {
        const tone = LEVEL_TONE[blast.get(t.node.path) ?? "Low"];
        if (TONE_RANK[tone] > TONE_RANK[best]) best = tone;
      }
    return best;
  };

  const label = (tile: Tile) => {
    const { node } = tile;
    if (node.kind === "file") {
      const list = findingsByPath.get(node.path);
      return `${node.path}, ${plural(node.loc, "line")}, imported by ${plural(dependentCount(node.path), "file")}, ${findingsText(list)}`;
    }
    const count = folderRisk.get(node.path)?.ids.size ?? 0;
    return `${node.path}, folder, ${plural(node.loc, "line")}, ${count ? plural(count, "finding") : "no findings"}. Zoom in`;
  };

  const byPath = new Map(tiles.map((t) => [t.node.path, t]));
  const selectedTile = selected ? byPath.get(selected) : undefined;
  const edges = useMemo(() => {
    if (!selected || !selectedTile) return [];
    const out: { to: Tile; kind: "imports" | "importer" }[] = [];
    const seen = new Set<string>();
    for (const [list, kind] of [
      [index.dependencies.get(selected) ?? [], "imports"],
      [index.dependents.get(selected) ?? [], "importer"],
    ] as const)
      for (const edge of list) {
        const to = byPath.get(edge.path);
        if (to && !seen.has(`${kind}${edge.path}`)) {
          seen.add(`${kind}${edge.path}`);
          out.push({ to, kind });
        }
      }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedTile, index, tiles]);

  const activate = (tile: Tile) => {
    setHover(null);
    if (tile.node.kind === "file") select(tile.node.path);
    else setZoom(tile.node.path);
  };

  const legend: [Tone, string][] =
    mode === "findings"
      ? [
          ["danger", "high finding"],
          ["warn", "medium"],
          ["info", "low"],
          ["none", "none open"],
        ]
      : [
          ["danger", "Critical impact"],
          ["warn", "High"],
          ["info", "Moderate"],
          ["none", "Low"],
        ];

  return (
    <section aria-label="System map" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Map location" className="min-w-0">
          <ol className="flex flex-wrap items-center gap-0.5 text-sm">
            {chain.map((node, i) => {
              const last = i === chain.length - 1;
              return (
                <li key={node.path || "root"} className="flex items-center gap-0.5">
                  {i > 0 && <ChevronRight className="text-subtle size-3.5" aria-hidden />}
                  <button
                    type="button"
                    aria-current={last ? "location" : undefined}
                    disabled={last}
                    onClick={() => setZoom(node.path)}
                    className={`${buttonClass.ghost} min-h-9 px-2 font-mono text-xs ${last ? "text-foreground" : ""}`}
                  >
                    {i === 0 ? data.repository.split("/").pop() || "repo" : node.name}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div role="group" aria-label="Color by" className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Color by:</span>
          {(
            [
              ["findings", "Findings"],
              ["blast", "Blast radius"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`min-h-9 rounded-md border px-2.5 text-xs font-medium ${
                mode === value
                  ? "border-primary bg-surface-2 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={canvas}
        className="border-border bg-background relative h-[420px] w-full overflow-hidden rounded-lg border md:h-[max(480px,60vh)]"
      >
        {tiles.map((tile) => {
          const { node } = tile;
          const isFile = node.kind === "file";
          const tone = toneOf(tile);
          const isSel = isFile && node.path === selected;
          const roomy = tile.w >= 44 && tile.h >= 22;
          const deps = isFile ? dependentCount(node.path) : 0;
          return (
            <button
              key={node.path}
              type="button"
              aria-label={label(tile)}
              aria-pressed={isSel || undefined}
              onClick={() => activate(tile)}
              onMouseEnter={() => setHover(tile)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(tile)}
              onBlur={() => setHover(null)}
              style={{ left: tile.x + 1, top: tile.y + 1, width: tile.w - 2, height: tile.h - 2 }}
              className={`focus-visible:ring-primary absolute flex flex-col overflow-hidden rounded-md border text-left transition-colors outline-none hover:brightness-125 focus-visible:z-20 focus-visible:ring-2 ${
                isFile ? FILE_TINT[tone] : DIR_TINT[tone]
              } ${isSel ? "ring-primary z-10 ring-2" : ""}`}
            >
              {roomy && (
                <span
                  className={`block truncate px-1.5 pt-0.5 text-xs leading-4 ${
                    isFile ? "text-foreground font-mono" : "text-muted-foreground font-semibold"
                  }`}
                >
                  {node.name}
                </span>
              )}
              {roomy && isFile && tile.h >= 40 && (
                <span className="text-muted-foreground tabular block truncate px-1.5 text-xs leading-4">
                  {nf.format(node.loc)} lines
                  {deps > 0 && tile.w >= 110 ? ` · ${nf.format(deps)} importers` : ""}
                </span>
              )}
              {isFile && deps > 0 && tile.w >= 70 && tile.h >= 44 && (
                <span
                  aria-hidden
                  className="bg-foreground/30 absolute bottom-0 left-0 h-1"
                  style={{ width: `${Math.max(4, (deps / maxDependents) * 100)}%` }}
                />
              )}
            </button>
          );
        })}

        {edges.length > 0 && selectedTile && (
          <svg
            className="pointer-events-none absolute inset-0 z-10"
            width={size.w}
            height={size.h}
            aria-hidden
          >
            {edges.map(({ to, kind }) => (
              <line
                key={`${kind}${to.node.path}`}
                x1={selectedTile.x + selectedTile.w / 2}
                y1={selectedTile.y + selectedTile.h / 2}
                x2={to.x + to.w / 2}
                y2={to.y + to.h / 2}
                strokeWidth={1.5}
                strokeDasharray={kind === "importer" ? "4 3" : undefined}
                className={kind === "imports" ? "stroke-primary/50" : "stroke-foreground/30"}
              />
            ))}
          </svg>
        )}

        {tiles.length === 0 && size.w > 0 && (
          <p className="text-muted-foreground p-4 text-sm">No files to draw here.</p>
        )}

        {hover && <Tooltip tile={hover} size={size} dependents={dependentCount} />}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span>Tile size = lines of code. Click a folder to zoom, a file to inspect it.</span>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {legend.map(([tone, text]) => (
            <li key={text} className="flex items-center gap-1.5">
              <span aria-hidden className={`size-3 rounded-sm border ${SWATCH[tone]}`} />
              {text}
            </li>
          ))}
        </ul>
        <span>Bar on a tile = how many files import it.</span>
      </div>

      <details className="border-border bg-surface rounded-lg border">
        <summary className="min-h-10 cursor-pointer px-3 py-2.5 text-sm font-medium">
          Show as list
        </summary>
        <ul className="divide-border border-border max-h-96 divide-y overflow-auto border-t">
          {current.children.map((node) => (
            <li key={node.path} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <button
                type="button"
                className="hover:bg-muted min-h-9 min-w-0 truncate rounded px-1 text-left font-mono text-xs"
                onClick={() => (node.kind === "file" ? select(node.path) : setZoom(node.path))}
              >
                {node.name}
                {node.kind === "dir" ? "/" : ""}
              </button>
              <span className="text-muted-foreground tabular shrink-0 text-xs">
                {nf.format(node.loc)} lines ·{" "}
                {node.kind === "file"
                  ? `${findingsText(findingsByPath.get(node.path))} · ${plural(dependentCount(node.path), "importer")}`
                  : plural(folderRisk.get(node.path)?.ids.size ?? 0, "finding")}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function Tooltip(props: {
  tile: Tile;
  size: { w: number; h: number };
  dependents: (path: string) => number;
}) {
  const { tile, size, dependents } = props;
  const { impact, findingsByPath } = useWorkspace();
  const { node } = tile;
  const isFile = node.kind === "file";
  const level = isFile ? impact([node.path]).level : null;
  const list = findingsByPath.get(node.path);
  const W = 260;
  const left = Math.max(4, Math.min(tile.x + 8, size.w - W - 4));
  const top = Math.max(4, Math.min(tile.y + tile.h + 6, size.h - 130));
  return (
    <div
      aria-hidden
      style={{ left, top, width: W }}
      className="border-border bg-card pointer-events-none absolute z-30 rounded-lg border p-3 text-xs shadow-lg"
    >
      <p className="font-mono text-xs break-all">{node.path}</p>
      <p className="text-muted-foreground tabular mt-1">
        {nf.format(node.loc)} lines
        {isFile
          ? ` · imported by ${plural(dependents(node.path), "file")}`
          : " · folder, click to zoom"}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {isFile && list && list.length > 0 && (
          <Badge
            tone={
              SEVERITY_TONE[
                list.some((f) => f.severity === "high")
                  ? "high"
                  : list.some((f) => f.severity === "medium")
                    ? "medium"
                    : "low"
              ]
            }
          >
            {findingsText(list)}
          </Badge>
        )}
        {isFile && (!list || list.length === 0) && <Badge>no findings</Badge>}
        {level && <Badge tone={IMPACT_TONE[level]}>Impact: {level}</Badge>}
      </div>
    </div>
  );
}
