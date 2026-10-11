import type { ImpactLevel } from "./impact";

export interface ProposedEdit {
  path: string;
  /** the complete new content of the file; null deletes it */
  content: string | null;
}

export type IssueSeverity = "error" | "warning" | "info";

export interface VerifyIssue {
  severity: IssueSeverity;
  /** which check produced it, e.g. "removed-export", "signature", "syntax" */
  check: string;
  path: string;
  line?: number;
  message: string;
  /** supporting detail: the other side of the problem, a suggestion */
  detail?: string;
}

export interface VerifyReport {
  /** blocked: something provably breaks; review: needs a look; clear: nothing found */
  verdict: "blocked" | "review" | "clear";
  counts: { errors: number; warnings: number; infos: number };
  issues: VerifyIssue[];
  files: { path: string; status: "new" | "modified" | "deleted" | "other"; loc: number }[];
  impact: {
    level: ImpactLevel;
    /** files that import the changed files, directly or indirectly, at runtime */
    dependents: number;
    entrypoints: string[];
    /** tests that import the changed code, plus any tests in the change */
    tests: string[];
    areas: { area: string; files: number }[];
  };
  checked: string[];
  notChecked: string[];
  /** what the report was checked against */
  basis: { commit: string; analyzedAt: string };
}
