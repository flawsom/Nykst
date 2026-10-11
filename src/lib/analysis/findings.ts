import { cyclePath } from "./cycles";
import { isFixLike, shortHash } from "./history-utils";
import { indexAnalysis } from "./impact";
import type { AnalyzedFile, RepoAnalysis, RepoHistory } from "./types";

/**
 * Findings are problems that can be proven from the analysis: every one points at files and,
 * where possible, lines. Nothing here is estimated or invented. Ids are stable between
 * analyses of the same repository so the memory layer can tell "fixed" from "still open".
 */

export type FindingKind =
  | "cycle"
  | "unresolved-import"
  | "module-scope-secret"
  | "undeclared-package"
  | "no-tests"
  | "untested-hotspot"
  | "orphan"
  | "fix-churn"
  | "issue-mention";

export type Severity = "low" | "medium" | "high";

export interface FindingEvidence {
  path: string;
  line?: number;
  note?: string;
  url?: string;
}

export interface Finding {
  /** stable across analyses, e.g. "cycle:3fa9c1d2" */
  id: string;
  kind: FindingKind;
  severity: Severity;
  title: string;
  detail: string;
  why: string;
  fix: string;
  /** files the finding is about; a node shows the findings of the files under it */
  paths: string[];
  evidence: FindingEvidence[];
}

export interface IssueLike {
  number: number;
  title: string;
  body?: string | null;
  state?: string;
  html_url?: string;
  labels?: unknown;
  pull_request?: unknown;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const PUBLIC_ENV = /^(VITE_|NEXT_PUBLIC_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_|NUXT_PUBLIC_)/;
const SECRET_NAME =
  /(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|API_?KEY|SERVICE_ROLE|CREDENTIAL|_KEY$|^KEY$)/i;
const PUBLIC_KEY_NAME = /(PUBLISHABLE|ANON|PUBLIC)/i;
const ENTRY_NAME =
  /^(index|main|app|server|entry|root|layout|page|route|loading|error|global-error|not-found|template|default|middleware|instrumentation|sitemap|robots|manifest|icon|apple-icon|opengraph-image|twitter-image|worker|handler|_app|_document|\+.*)$/i;
/** Folders whose files are loaded by tools, docs or tests rather than imported by code. */
const NOT_APPLICATION_CODE =
  /(^|\/)(docs?|examples?|fixtures?|__mocks__|__fixtures__|e2e|stories|\.storybook|\.[a-z][\w-]*)\//i;
const GENERATED_PATH =
  /(^|\/)(generated|__generated__|\.generated|\.next|\.prisma|\.output|dist)\//i;
const GENERIC_NAMES =
  /^(index|page|layout|route|loading|error|main|utils?|types?|constants?|config|client|server|api|helpers?)$/i;

function basename(path: string) {
  return path.split("/").pop() ?? path;
}

/** Short, readable name: the file name, plus its folder when the name alone is ambiguous. */
function shortName(path: string) {
  const parts = path.split("/");
  const name = parts[parts.length - 1] ?? path;
  const bare = name.replace(/\.[^.]+$/, "");
  return GENERIC_NAMES.test(bare) && parts.length > 1 ? `${parts[parts.length - 2]}/${name}` : name;
}

function stem(path: string) {
  return basename(path).replace(/\.[^.]+$/, "");
}

function isProduction(file: AnalyzedFile) {
  return !["test", "generated", "script", "config"].includes(file.role);
}

function labelsOf(issue: IssueLike): string {
  const raw = issue.labels;
  if (!Array.isArray(raw)) return "";
  return raw
    .map((label) =>
      typeof label === "string" ? label : ((label as { name?: unknown } | null)?.name ?? ""),
    )
    .filter((name): name is string => typeof name === "string")
    .join(" ")
    .toLowerCase();
}

export function isSecretEnvName(name: string) {
  return !PUBLIC_ENV.test(name) && !PUBLIC_KEY_NAME.test(name) && SECRET_NAME.test(name);
}

/**
 * Whether importing `pkg` from a package is covered by a package.json. Workspace packages,
 * virtual modules ("astro:content") and tool aliases ("@docusaurus/Head": npm names are
 * lowercase) are never installed from the registry, so they count as declared. Returns null
 * for repositories without any package.json, where the question has no answer.
 */
export function createDependencyChecker(analysis: RepoAnalysis) {
  if (!analysis.packageDeps.length) return null;
  const workspaceNames = new Set(analysis.packages.map((pkg) => pkg.name));
  const declared = new Map(analysis.packageDeps.map((pkg) => [pkg.dir, new Set(pkg.deps)]));
  const dirs = [...declared.keys()].sort((a, b) => b.length - a.length);
  return {
    isDeclared(packageDir: string, pkg: string) {
      if (workspaceNames.has(pkg) || /[:A-Z]/.test(pkg)) return true;
      const chain = dirs.filter(
        (dir) => dir === "" || packageDir === dir || packageDir.startsWith(`${dir}/`),
      );
      return chain.some((dir) => {
        const set = declared.get(dir)!;
        return set.has(pkg) || set.has(`@types/${pkg.replace(/^@/, "").replace("/", "__")}`);
      });
    },
  };
}

export function computeFindings(
  analysis: RepoAnalysis,
  history?: RepoHistory,
  issues: IssueLike[] = [],
): Finding[] {
  const index = indexAnalysis(analysis);
  const out: Finding[] = [];
  const files = analysis.files;

  /* ------------------------------ import cycles ------------------------------ */
  const runtime = new Map<string, string[]>();
  for (const file of files)
    runtime.set(
      file.path,
      file.imports
        .filter((ref) => ref.kind === "internal" && !ref.typeOnly && ref.target)
        .map((ref) => ref.target!),
    );
  for (const members of analysis.cycles) {
    const start = members[0]!;
    const chain = cyclePath(runtime, members, start);
    out.push({
      id: `cycle:${shortHash(members.join("|"))}`,
      kind: "cycle",
      severity: members.length >= 8 ? "high" : "medium",
      title: `Circular import between ${members.length} files`,
      detail: chain.map(basename).join(" → "),
      why: "Files that import each other load in an order you don't control, so values can be undefined at import time, and none of them can be changed or tested on its own.",
      fix: "Move what they share into a third module that both import, or break the loop by passing the value in as an argument instead of importing it.",
      paths: members,
      evidence: chain.slice(0, -1).map((path, i) => {
        const next = chain[i + 1]!;
        const ref = index.files
          .get(path)
          ?.imports.find((item) => item.target === next && !item.typeOnly);
        return { path, ...(ref ? { line: ref.line } : {}), note: `imports ${basename(next)}` };
      }),
    });
  }

  /* ---------------------------- unresolved imports ---------------------------- */
  for (const file of files)
    for (const ref of file.imports) {
      if (ref.kind !== "unresolved") continue;
      // produced by a build step (prisma generate, codegen), so it is not in the repository
      if (GENERATED_PATH.test(ref.specifier) || GENERATED_PATH.test(`${ref.target ?? ""}/`))
        continue;
      out.push({
        id: `unresolved:${file.path}:${ref.specifier}`,
        kind: "unresolved-import",
        severity: isProduction(file) ? "high" : "low",
        title: `Import "${ref.specifier}" does not resolve`,
        detail: `${file.path}:${ref.line}`,
        why: "The import points at a file or package that can't be found, so this file fails to load or build.",
        fix: "Correct the path, add the missing file, or install and declare the package.",
        paths: [file.path],
        evidence: [{ path: file.path, line: ref.line, note: `import "${ref.specifier}"` }],
      });
    }

  /* ------------------------ secrets read at import time ------------------------ */
  for (const file of files) {
    if (!isProduction(file)) continue;
    for (const env of file.moduleScopeEnv) {
      if (!isSecretEnvName(env.name)) continue;
      out.push({
        id: `secret:${file.path}:${env.name}`,
        kind: "module-scope-secret",
        severity: file.role === "component" || file.role === "route" ? "high" : "medium",
        title: `${env.name} is read when the module loads`,
        detail: `${file.path}:${env.line}`,
        why: "A value read at import time is fixed before the runtime provides it (serverless and edge runtimes such as Cloudflare Workers) and can leak into any client bundle that imports this file. In a long-running Node server it is usually fine.",
        fix: "Read it inside the function that needs it, and fail clearly if it is missing.",
        paths: [file.path],
        evidence: [{ path: file.path, line: env.line, note: `reads ${env.name} at module scope` }],
      });
    }
  }

  /* ----------------------- packages imported but not declared ----------------------- */
  const dependencies = createDependencyChecker(analysis);
  if (dependencies) {
    const grouped = new Map<
      string,
      { dir: string; pkg: string; refs: FindingEvidence[]; paths: Set<string> }
    >();
    for (const file of files) {
      if (file.role === "generated") continue;
      for (const ref of file.imports) {
        if (ref.kind !== "external" || !ref.target) continue;
        if (dependencies.isDeclared(file.packageDir, ref.target)) continue;
        const key = `${file.packageDir}|${ref.target}`;
        const entry = grouped.get(key) ?? {
          dir: file.packageDir,
          pkg: ref.target,
          refs: [],
          paths: new Set(),
        };
        entry.refs.push({ path: file.path, line: ref.line, note: `import "${ref.specifier}"` });
        entry.paths.add(file.path);
        grouped.set(key, entry);
      }
    }
    for (const entry of grouped.values())
      out.push({
        id: `undeclared:${entry.dir}:${entry.pkg}`,
        kind: "undeclared-package",
        severity: "medium",
        title: `"${entry.pkg}" is imported but not in package.json`,
        detail: `${entry.paths.size} file${entry.paths.size === 1 ? "" : "s"} in ${entry.dir || "the repository root"}`,
        why: "It only works because something else happens to install it. A clean install, a different package manager or a deploy can break it.",
        fix: `Add "${entry.pkg}" to the dependencies of ${entry.dir ? `${entry.dir}/package.json` : "package.json"}.`,
        paths: [...entry.paths],
        evidence: entry.refs.slice(0, 5),
      });
  }

  /* --------------------------------- test coverage --------------------------------- */
  const tests = files.filter((file) => file.role === "test");
  if (!tests.length) {
    if (files.length >= 10)
      out.push({
        id: "no-tests:repo",
        kind: "no-tests",
        severity: "medium",
        title: "No test files found",
        detail: `${files.length} source files and none that look like tests`,
        why: "Nothing checks that a change keeps the rest of the code working.",
        fix: "Start with a test for the most depended-on files listed under Architecture.",
        paths: [],
        evidence: [],
      });
  } else {
    const covered = new Set<string>();
    const queue = tests.map((test) => test.path);
    for (const path of queue) covered.add(path);
    for (let head = 0; head < queue.length; head += 1)
      for (const edge of index.dependencies.get(queue[head]!) ?? []) {
        if (edge.typeOnly || covered.has(edge.path)) continue;
        covered.add(edge.path);
        queue.push(edge.path);
      }
    const hotspots = files
      .filter((file) => isProduction(file) && !covered.has(file.path) && file.role !== "types")
      .map((file) => ({
        file,
        users: new Set(
          (index.dependents.get(file.path) ?? [])
            .filter((edge) => !edge.typeOnly && index.files.get(edge.path)?.role !== "test")
            .map((edge) => edge.path),
        ),
      }))
      .filter((item) => item.users.size >= 5)
      .sort((a, b) => b.users.size - a.users.size)
      .slice(0, 20);
    for (const { file, users } of hotspots)
      out.push({
        id: `untested:${file.path}`,
        kind: "untested-hotspot",
        severity: users.size >= 15 ? "high" : "medium",
        title: `${shortName(file.path)} is used by ${users.size} files but no test reaches it`,
        detail: file.path,
        why: "A change here can break many files while nothing in the test suite would notice.",
        fix: "Add a test that imports this module, or one of the files that use it, and run it in CI.",
        paths: [file.path],
        evidence: [...users].slice(0, 4).map((path) => ({ path, note: "uses it, untested" })),
      });
  }

  /* ----------------------------- files nothing imports ----------------------------- */
  const orphans = files
    .filter((file) => {
      if (!["lib", "component", "hook", "server"].includes(file.role)) return false;
      if (ENTRY_NAME.test(stem(file.path)) || NOT_APPLICATION_CODE.test(file.path)) return false;
      if ((index.dependents.get(file.path) ?? []).length) return false;
      return file.exports.length > 0;
    })
    .slice(0, 30);
  for (const file of orphans)
    out.push({
      id: `orphan:${file.path}`,
      kind: "orphan",
      severity: "low",
      title: `${file.path} is not imported anywhere`,
      detail: `${file.loc} lines, exports ${file.exports.slice(0, 3).join(", ")}`,
      why: "It may be dead code. Framework conventions or imports built at runtime can still load it, which the analysis can't see.",
      fix: "Delete it if it is unused, or leave a comment naming what loads it.",
      paths: [file.path],
      evidence: [{ path: file.path, note: "no importers found" }],
    });

  /* ----------------------------- repeatedly fixed files ----------------------------- */
  if (history?.commits.length) {
    const fixes = new Map<string, typeof history.commits>();
    for (const commit of history.commits) {
      if (!isFixLike(commit.message) || commit.files.length > 25) continue;
      for (const path of commit.files) {
        if (!index.files.has(path)) continue;
        fixes.set(path, [...(fixes.get(path) ?? []), commit]);
      }
    }
    for (const [path, commits] of fixes) {
      const file = index.files.get(path)!;
      if (commits.length < 3 || !isProduction(file)) continue;
      out.push({
        id: `churn:${path}`,
        kind: "fix-churn",
        severity: commits.length >= 5 ? "high" : "medium",
        title: `${shortName(path)} was fixed ${commits.length} times recently`,
        detail: commits
          .slice(0, 3)
          .map((commit) => `${commit.sha.slice(0, 7)} ${commit.message}`)
          .join(" · "),
        why: "A file that keeps needing fixes is where the next bug is most likely. The earlier fixes show what went wrong before.",
        fix: "Read the earlier fixes before changing it, and add a regression test for the failure they describe.",
        paths: [path],
        evidence: commits.slice(0, 5).map((commit) => ({
          path,
          note: `${commit.sha.slice(0, 7)} ${commit.date.slice(0, 10)} ${commit.message}`,
          ...(commit.url ? { url: commit.url } : {}),
        })),
      });
    }
  }

  /* ----------------------- open GitHub issues that name a file ----------------------- */
  const known = [...index.files.keys()].filter((path) => path.includes("/") || path.length > 8);
  for (const issue of issues) {
    if (issue.pull_request || (issue.state && issue.state !== "open")) continue;
    const text = `${issue.title}\n${issue.body ?? ""}`;
    const labels = labelsOf(issue);
    const mentioned = known.filter((path) => text.includes(path));
    if (!mentioned.length) continue;
    out.push({
      id: `issue:${issue.number}`,
      kind: "issue-mention",
      severity: /security|critical|blocker|urgent/.test(labels)
        ? "high"
        : /bug|regression/.test(labels)
          ? "medium"
          : "low",
      title: `Open issue #${issue.number}: ${issue.title}`,
      detail: `Mentions ${mentioned.slice(0, 3).join(", ")}${mentioned.length > 3 ? ` +${mentioned.length - 3}` : ""}`,
      why: "A reported problem names these files, so work here should account for it.",
      fix: "Read the issue before changing these files; close it if your change resolves it.",
      paths: mentioned,
      evidence: [
        {
          path: mentioned[0]!,
          note: `#${issue.number}`,
          ...(issue.html_url ? { url: issue.html_url } : {}),
        },
      ],
    });
  }

  return out.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.kind.localeCompare(b.kind) ||
      a.title.localeCompare(b.title),
  );
}

/** Findings that concern at least one of the given files. */
export function findingsForPaths(findings: Finding[], paths: string[]) {
  const wanted = new Set(paths);
  return findings.filter((finding) => finding.paths.some((path) => wanted.has(path)));
}
