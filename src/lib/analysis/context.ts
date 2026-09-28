import { chainFor, historyFor, impactOf, indexAnalysis } from "./impact";
import type { RepoAnalysis, RepoHistory } from "./types";

/**
 * A compact, evidence-only briefing about a set of files, sized for an LLM prompt or an
 * MCP tool result. Every claim carries a path, line, commit or PR reference.
 */
export function impactBriefing(
  analysis: RepoAnalysis,
  history: RepoHistory | undefined,
  paths: string[],
  options: { maxItems?: number } = {},
) {
  const max = options.maxItems ?? 40;
  const index = indexAnalysis(analysis);
  const known = paths.filter((path) => index.files.has(path));
  const report = impactOf(index, known);
  const fileHistory = historyFor(history, known);
  const seedSet = new Set(known);
  const external = new Set<string>();
  const uses: { from: string; line: number; imports: string; typeOnly: boolean }[] = [];
  for (const path of known) {
    for (const ref of index.files.get(path)!.imports) {
      if (ref.kind === "external" && ref.target) external.add(ref.target);
      if (ref.kind === "internal" && ref.target && !seedSet.has(ref.target))
        uses.push({ from: path, line: ref.line, imports: ref.target, typeOnly: ref.typeOnly });
    }
  }
  const files = known.slice(0, max).map((path) => {
    const file = index.files.get(path)!;
    return {
      path,
      role: file.role,
      loc: file.loc,
      exports: file.exports.slice(0, 20),
      services: file.services,
      data: file.resources.map((use) => `${use.id} (line ${use.line})`),
      env: file.envVars,
    };
  });
  return {
    target: { files: known.length, unknown: paths.filter((path) => !index.files.has(path)) },
    files,
    uses_internal: uses.slice(0, max),
    uses_packages: [...external].sort(),
    impact: {
      level: report.level,
      runtime_dependents: report.runtimeCount,
      type_only_dependents: report.impacted.length - report.runtimeCount,
      direct_importers: report.direct.slice(0, max).map((item) => ({
        path: item.path,
        line: item.line,
        imports: item.via,
        type_only: item.typeOnly,
      })),
      entrypoints: report.entrypoints.slice(0, max).map((item) => ({
        path: item.path,
        role: item.role,
        chain: chainFor(report, item.path),
      })),
      tests_that_cover_it: report.tests.slice(0, max).map((item) => item.path),
      areas: report.areas.slice(0, 15),
    },
    history: {
      commits: fileHistory.commits.slice(0, 15).map((commit) => ({
        sha: commit.sha.slice(0, 10),
        date: commit.date.slice(0, 10),
        author: commit.author,
        message: commit.message,
      })),
      pull_requests: fileHistory.pullRequests.slice(0, 10).map((pull) => ({
        number: pull.number,
        title: pull.title,
        state: pull.mergedAt ? "merged" : pull.state,
        closes_issues: pull.closes,
      })),
      usually_changed_together: fileHistory.coChange.slice(0, 10),
      authors: fileHistory.authors.slice(0, 5),
    },
    limitations: [...analysis.limitations, ...(history?.limitations ?? [])],
  };
}
