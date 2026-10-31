import { indexAnalysis } from "./impact";
import type { RepoAnalysis } from "./types";

export type DomainSummary = {
  domain: string;
  files: number;
  loc: number;
  edgesOut: number;
  edgesIn: number;
  sampleFiles: string[];
};

/**
 * Group real files into the two-level areas shown in the map preview. The
 * counts are computed from the compiled import graph, never from labels.
 */
export function domainSummaries(analysis: RepoAnalysis): DomainSummary[] {
  const index = indexAnalysis(analysis);
  const domainMap = new Map<string, DomainSummary>();
  const domainOf = (path: string) => {
    const parts = path.split("/");
    return parts.length > 2 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? "root");
  };

  for (const file of analysis.files) {
    const domain = domainOf(file.path);
    const entry = domainMap.get(domain) ?? {
      domain,
      files: 0,
      loc: 0,
      edgesOut: 0,
      edgesIn: 0,
      sampleFiles: [],
    };
    entry.files += 1;
    entry.loc += file.loc;
    if (entry.sampleFiles.length < 4) entry.sampleFiles.push(file.path);
    for (const dependency of index.dependencies.get(file.path) ?? []) {
      if (domainOf(dependency.path) !== domain) entry.edgesOut += 1;
    }
    for (const dependent of index.dependents.get(file.path) ?? []) {
      if (domainOf(dependent.path) !== domain) entry.edgesIn += 1;
    }
    domainMap.set(domain, entry);
  }

  return [...domainMap.values()].sort((a, b) => b.edgesIn + b.edgesOut - (a.edgesIn + a.edgesOut));
}
