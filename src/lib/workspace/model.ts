/**
 * Client-side model of the workspace: one repository's analysis, history and findings, plus
 * small pure helpers the views share. Everything here derives from the analysis; nothing is
 * invented. Safe to import from the browser.
 */
import { computeFindings, type Finding } from "@/lib/analysis/findings";
import { indexAnalysis, type AnalysisIndex } from "@/lib/analysis/impact";
import { ANALYSIS_VERSION, type RepoAnalysis, type RepoHistory } from "@/lib/analysis/types";
import type { VerifyReport } from "@/lib/analysis/verify-types";

export type WorkspaceSource = "github" | "demo";

/** A real verification result captured ahead of time, shown in the read-only demo. */
export interface RecordedChange {
  title: string;
  description: string;
  files: {
    path: string;
    status: "new" | "modified" | "deleted";
    before: string | null;
    after: string | null;
  }[];
  report: VerifyReport;
  patch: string;
}

export interface WorkspaceData {
  source: WorkspaceSource;
  repository: string;
  /** when the analysis ran */
  createdAt: string;
  analysis: RepoAnalysis;
  history: RepoHistory | undefined;
  findings: Finding[];
  recorded?: RecordedChange;
}

export type WorkspaceView = "map" | "findings" | "activity" | "change";

/** The stored snapshot as the API returns it. */
export interface StoredSnapshot {
  repository_full_name: string;
  created_at: string;
  payload: {
    analysis?: RepoAnalysis;
    history?: RepoHistory;
    findings?: Finding[];
    issues?: Record<string, unknown>[];
    recorded?: RecordedChange;
  };
}

export type SnapshotResult =
  | { ok: true; data: WorkspaceData }
  | { ok: false; reason: "no-analysis" | "outdated"; repository: string };

export function toWorkspace(snapshot: StoredSnapshot, source: WorkspaceSource): SnapshotResult {
  const { analysis, history } = snapshot.payload;
  const repository = snapshot.repository_full_name;
  if (!analysis?.files) return { ok: false, reason: "no-analysis", repository };
  if ((analysis.version ?? 1) < ANALYSIS_VERSION)
    return { ok: false, reason: "outdated", repository };
  return {
    ok: true,
    data: {
      source,
      repository,
      createdAt: snapshot.created_at,
      analysis,
      history,
      findings: snapshot.payload.findings ?? computeFindings(analysis, history),
      ...(snapshot.payload.recorded ? { recorded: snapshot.payload.recorded } : {}),
    },
  };
}

/* --------------------------------- file tree --------------------------------- */

export interface TreeNode {
  name: string;
  path: string;
  kind: "dir" | "file";
  children: TreeNode[];
  /** files below a folder; 1 for a file */
  files: number;
}

/** Folders first, then files, each alphabetically; single-child folders are joined (a/b/c). */
export function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", kind: "dir", children: [], files: 0 };
  for (const path of paths) {
    const parts = path.split("/");
    let cursor = root;
    parts.forEach((part, index) => {
      const full = parts.slice(0, index + 1).join("/");
      const isFile = index === parts.length - 1;
      let next = cursor.children.find((child) => child.path === full);
      if (!next) {
        next = { name: part, path: full, kind: isFile ? "file" : "dir", children: [], files: 0 };
        cursor.children.push(next);
      }
      cursor = next;
    });
  }
  const finish = (node: TreeNode): TreeNode => {
    node.children = node.children.map(finish);
    node.files =
      node.kind === "file" ? 1 : node.children.reduce((sum, child) => sum + child.files, 0);
    node.children.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1,
    );
    if (
      node.kind === "dir" &&
      node.path &&
      node.children.length === 1 &&
      node.children[0]!.kind === "dir"
    ) {
      const only = node.children[0]!;
      return { ...only, name: `${node.name}/${only.name}` };
    }
    return node;
  };
  return finish(root);
}

/* ---------------------------------- helpers ---------------------------------- */

export function findingsByPath(findings: Finding[]) {
  const map = new Map<string, Finding[]>();
  for (const finding of findings)
    for (const path of new Set(finding.paths)) map.set(path, [...(map.get(path) ?? []), finding]);
  return map;
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 } as const;
export function worstSeverity(findings: Finding[] | undefined) {
  let worst: Finding["severity"] | null = null;
  for (const finding of findings ?? [])
    if (!worst || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[worst]) worst = finding.severity;
  return worst;
}

/** Files matching a query by path or exported name, best first. */
export function searchFiles(index: AnalysisIndex, query: string, limit = 30) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { path: string; score: number; match?: string }[] = [];
  for (const file of index.analysis.files) {
    const path = file.path.toLowerCase();
    const base = path.split("/").pop() ?? path;
    let score = 0;
    let match: string | undefined;
    if (base === q) score = 100;
    else if (base.startsWith(q)) score = 80;
    else if (base.includes(q)) score = 60;
    else if (path.includes(q)) score = 40;
    else {
      const name = file.exports.find((item) => item.toLowerCase().includes(q));
      if (name) {
        score = 30;
        match = name;
      }
    }
    if (score)
      scored.push({
        path: file.path,
        score: score - path.length / 1000,
        ...(match ? { match } : {}),
      });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const IMPACT_TONE = {
  Low: "ok",
  Moderate: "info",
  High: "warn",
  Critical: "danger",
} as const;

export const SEVERITY_TONE = { low: "info", medium: "warn", high: "danger" } as const;

export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (Number.isNaN(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export { indexAnalysis };
