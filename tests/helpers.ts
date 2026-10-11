import { analyzeRepository, wantsContent } from "../src/lib/analysis/engine.server";
import type { HistoryCommit, RepoAnalysis, RepoHistory } from "../src/lib/analysis/types";

/** Analyze an in-memory repository: { "src/a.ts": "import ..." } */
export async function analyzeFixture(files: Record<string, string>): Promise<RepoAnalysis> {
  const paths = Object.keys(files);
  const contents = new Map<string, string>();
  for (const [path, text] of Object.entries(files))
    if (wantsContent(path, text.length)) contents.set(path, text);
  return analyzeRepository({ ref: "fixture", paths, contents });
}

let counter = 0;
export function commit(
  message: string,
  files: string[],
  date: string,
  author = "alex",
  extra: Partial<HistoryCommit> = {},
): HistoryCommit {
  counter += 1;
  return { sha: counter.toString(16).padStart(40, "a"), message, author, date, files, ...extra };
}

export function historyOf(commits: HistoryCommit[]): RepoHistory {
  return { generatedAt: "2026-10-01T00:00:00Z", commits, pullRequests: [], limitations: [] };
}
