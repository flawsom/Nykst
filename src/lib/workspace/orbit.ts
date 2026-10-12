/**
 * Data behind the Orbit map: the repository (or one folder) in the centre and what it contains
 * around it. Pure and derived from the analysis; nothing is invented.
 */
import type { Finding } from "@/lib/analysis/findings";
import { impactOf, type AnalysisIndex, type ImpactLevel } from "@/lib/analysis/impact";
import type { RepoAnalysis } from "@/lib/analysis/types";
import { buildTree, worstSeverity, type TreeNode } from "./model";

export type OrbitKind = "area" | "file" | "services" | "data" | "more";

/** Pseudo folders reachable by drilling into the synthetic nodes. */
export const SERVICES_PATH = "@services";
export const DATA_PATH = "@data";
export const ROOT_FILES_PATH = "@root-files";

export const MAX_ORBIT_NODES = 10;
const IMPACT_SAMPLE = 400;

export interface OrbitNode {
  id: string;
  kind: OrbitKind;
  label: string;
  /** folder or file path, or the pseudo folder for synthetic nodes */
  path: string;
  /** source files below the node */
  files: number;
  /** distinct files outside the node that import something in it (services: files using them) */
  importers: number;
  loc: number;
  level: ImpactLevel;
  /** open findings touching a file under the node */
  findings: number;
  worst: ReturnType<typeof worstSeverity>;
  /** source files below the node */
  paths: string[];
  /** folder to open when the node is clicked; null when there is nothing to open */
  drill: string | null;
  /** the nodes folded into a "+N more" node */
  hidden?: OrbitNode[];
}

const treeCache = new WeakMap<RepoAnalysis, TreeNode>();
function treeOf(analysis: RepoAnalysis) {
  let tree = treeCache.get(analysis);
  if (!tree) {
    tree = buildTree(analysis.files.map((file) => file.path));
    treeCache.set(analysis, tree);
  }
  return tree;
}

function find(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) return node;
  if (path !== "" && !path.startsWith(`${node.path}/`) && node.path !== "") return null;
  for (const child of node.children) {
    const hit = find(child, path);
    if (hit) return hit;
  }
  return null;
}

function leaves(node: TreeNode): string[] {
  return node.kind === "file" ? [node.path] : node.children.flatMap(leaves);
}

function build(
  index: AnalysisIndex,
  findings: Finding[],
  base: Pick<OrbitNode, "id" | "kind" | "label" | "path" | "drill"> & { hidden?: OrbitNode[] },
  rawPaths: string[],
  importerOverride?: number,
): OrbitNode {
  const paths = [...new Set(rawPaths)].filter((path) => index.files.has(path)).sort();
  const inside = new Set(paths);
  const outside = new Set<string>();
  let loc = 0;
  for (const path of paths) {
    loc += index.files.get(path)?.loc ?? 0;
    for (const edge of index.dependents.get(path) ?? [])
      if (!inside.has(edge.path)) outside.add(edge.path);
  }
  const touching = findings.filter((finding) => finding.paths.some((path) => inside.has(path)));
  const level = paths.length ? impactOf(index, paths.slice(0, IMPACT_SAMPLE)).level : "Low";
  return {
    ...base,
    files: paths.length,
    importers: importerOverride ?? outside.size,
    loc,
    level,
    findings: touching.length,
    worst: worstSeverity(touching),
    paths,
  };
}

/** The nodes shown around the centre for a folder ("" is the repository root). */
export function orbitNodes(
  analysis: RepoAnalysis,
  index: AnalysisIndex,
  folderPath: string,
  findings: Finding[] = [],
): OrbitNode[] {
  const fixed: OrbitNode[] = [];
  let rest: OrbitNode[] = [];
  const fromTree = (child: TreeNode): OrbitNode =>
    build(
      index,
      findings,
      {
        id: child.path,
        kind: child.kind === "file" ? "file" : "area",
        label: child.name,
        path: child.path,
        drill: child.kind === "dir" ? child.path : null,
      },
      leaves(child),
    );

  if (folderPath === SERVICES_PATH) {
    rest = analysis.services.map((service) =>
      build(
        index,
        findings,
        {
          id: `service:${service.id}`,
          kind: "services",
          label: service.name,
          path: service.id,
          drill: null,
        },
        service.files,
        service.files.filter((path) => index.files.has(path)).length,
      ),
    );
  } else if (folderPath === DATA_PATH) {
    rest = analysis.resources.map((resource) => {
      const used = resource.uses.map((use) => use.path);
      return build(
        index,
        findings,
        {
          id: `data:${resource.id}`,
          kind: "data",
          label: resource.name,
          path: resource.id,
          drill: null,
        },
        used,
        new Set(used.filter((path) => index.files.has(path))).size,
      );
    });
  } else if (folderPath === ROOT_FILES_PATH) {
    rest = treeOf(analysis)
      .children.filter((c) => c.kind === "file")
      .map(fromTree);
  } else if (folderPath === "") {
    const root = treeOf(analysis);
    const looseFiles: string[] = [];
    for (const child of root.children) {
      if (child.kind === "file") {
        looseFiles.push(child.path);
        continue;
      }
      // "src" with several folders is split into its folders, like src/lib and src/components.
      if (child.path === "src" && child.children.some((c) => c.kind === "dir"))
        rest.push(...child.children.map(fromTree));
      else rest.push(fromTree(child));
    }
    if (looseFiles.length)
      rest.push(
        build(
          index,
          findings,
          {
            id: "root-files",
            kind: "area",
            label: "Repository root files",
            path: ROOT_FILES_PATH,
            drill: ROOT_FILES_PATH,
          },
          looseFiles,
        ),
      );
    if (analysis.services.length) {
      const used = analysis.services.flatMap((service) => service.files);
      fixed.push(
        build(
          index,
          findings,
          {
            id: "services",
            kind: "services",
            label: "External services",
            path: SERVICES_PATH,
            drill: SERVICES_PATH,
          },
          used,
          new Set(used.filter((path) => index.files.has(path))).size,
        ),
      );
    }
    if (analysis.resources.length) {
      const used = analysis.resources.flatMap((resource) => resource.uses.map((use) => use.path));
      fixed.push(
        build(
          index,
          findings,
          { id: "data", kind: "data", label: "Data", path: DATA_PATH, drill: DATA_PATH },
          used,
          new Set(used.filter((path) => index.files.has(path))).size,
        ),
      );
    }
  } else {
    const node = find(treeOf(analysis), folderPath);
    rest = node ? node.children.map(fromTree) : [];
  }

  rest.sort((a, b) => b.loc - a.loc || a.label.localeCompare(b.label));
  if (rest.length + fixed.length <= MAX_ORBIT_NODES) return [...rest, ...fixed];
  const keep = Math.max(MAX_ORBIT_NODES - fixed.length - 1, 1);
  const hidden = rest.slice(keep);
  const more = build(
    index,
    findings,
    {
      id: "more",
      kind: "more",
      label: `+${hidden.length} more`,
      path: folderPath,
      drill: null,
      hidden,
    },
    hidden.flatMap((node) => node.paths),
  );
  return [...rest.slice(0, keep), more, ...fixed];
}

/** The files of a node that the most other files import, for the details panel. */
export function topFiles(index: AnalysisIndex, node: OrbitNode, limit = 5) {
  return node.paths
    .map((path) => ({
      path,
      importers: new Set((index.dependents.get(path) ?? []).map((edge) => edge.path)).size,
    }))
    .sort((a, b) => b.importers - a.importers || a.path.localeCompare(b.path))
    .slice(0, limit);
}

export interface OrbitPoint {
  x: number;
  y: number;
}

const CARD_W = 190;
const CARD_H = 116;

/**
 * Card centres as percentages of the container, on an ellipse starting at the top. More than
 * eight cards use two rings, alternating between them so neighbours never touch.
 */
export function layoutOrbit(count: number, width: number, height: number): OrbitPoint[] {
  if (count <= 0) return [];
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const rx = Math.max(50 - ((CARD_W / 2 + 8) / w) * 100, 5);
  const ry = Math.max(50 - ((CARD_H / 2 + 8) / h) * 100, 5);
  const place = (n: number, i: number, scale: number, offset: number): OrbitPoint => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + offset;
    return {
      x: round(50 + Math.cos(angle) * rx * scale),
      y: round(50 + Math.sin(angle) * ry * scale),
    };
  };
  if (count <= 10) return Array.from({ length: count }, (_, i) => place(count, i, 1, 0));
  const outer = Math.ceil(count / 2);
  const inner = count - outer;
  return Array.from({ length: count }, (_, i) =>
    i % 2 === 0 ? place(outer, i / 2, 1, 0) : place(inner, (i - 1) / 2, 0.58, Math.PI / inner),
  );
}

const round = (value: number) => Math.round(value * 100) / 100;
