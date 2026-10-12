import { githubContent } from "@/lib/integrations/github";
import { loadSnapshot } from "@/lib/mcp.server";
import { verifyChange, type ProposedEdit, type VerifyReport } from "@/lib/analysis/verify.server";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "nykst-software-intelligence";
const MAX_FILES = 40;
const MAX_CHARS = 200_000;
const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;

export interface PullSummary {
  number: number;
  title: string;
  author: string;
  url: string;
  headSha: string;
  baseRef: string;
  draft: boolean;
  /** the list endpoint does not report it; null until the pull request is checked */
  changedFiles: number | null;
  updatedAt: string;
}

export interface PullCheck {
  number: number;
  title: string;
  url: string;
  author: string;
  headSha: string;
  report: VerifyReport;
  filesChecked: number;
  skipped: { path: string; reason: string }[];
  /** commit of the stored analysis; the UI compares it with the repository */
  analysisCommit: string;
  stale: boolean;
  checkedAt: string;
}

export interface Freshness {
  behindBy: number | null;
  unknown?: boolean;
  defaultBranch?: string;
  headSha?: string | undefined;
  status?: string;
}

class PullError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function split(repository: string) {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new PullError("Pick a repository first.", 400);
  return {
    owner: encodeURIComponent(owner),
    repo: encodeURIComponent(repo),
    rawOwner: owner,
    rawRepo: repo,
  };
}

async function get<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) throw new PullError(`GitHub API returned ${response.status}`, response.status);
  return (await response.json()) as T;
}

type RawPull = {
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  updated_at: string;
  user?: { login?: string } | null;
  head: { sha: string };
  base: { ref: string; sha?: string };
  changed_files?: number;
};

const summarize = (p: RawPull): PullSummary => ({
  number: p.number,
  title: p.title,
  author: p.user?.login ?? "unknown",
  url: p.html_url,
  headSha: p.head.sha,
  baseRef: p.base.ref,
  draft: Boolean(p.draft),
  changedFiles: typeof p.changed_files === "number" ? p.changed_files : null,
  updatedAt: p.updated_at,
});

const NO_ACCESS =
  "Nykst could not read this pull request. Check that the GitHub App can read pull requests for this repository.";

export async function listOpenPulls(token: string, repository: string): Promise<PullSummary[]> {
  const { owner, repo } = split(repository);
  try {
    const pulls = await get<RawPull[]>(
      token,
      `/repos/${owner}/${repo}/pulls?state=open&per_page=30`,
    );
    return pulls.map(summarize);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 404) throw new PullError(NO_ACCESS, 404);
    throw error;
  }
}

type RawFile = {
  filename: string;
  status: string;
  previous_filename?: string;
};

function decode(content: string) {
  const binary = atob(content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const eligible = (path: string) =>
  SOURCE_EXT.test(path) || path === "package.json" || path.endsWith("/package.json");

export async function checkPull(input: {
  userId: string;
  token: string;
  repository: string;
  number: number;
}): Promise<PullCheck> {
  const { userId, token, repository, number } = input;
  const { owner, repo, rawOwner, rawRepo } = split(repository);

  let pull: RawPull;
  let files: RawFile[];
  try {
    pull = await get<RawPull>(token, `/repos/${owner}/${repo}/pulls/${number}`);
    files = await get<RawFile[]>(
      token,
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`,
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 404) throw new PullError(NO_ACCESS, 404);
    throw error;
  }

  const skipped: { path: string; reason: string }[] = [];
  const edits: ProposedEdit[] = [];
  const deleted = new Set<string>();
  let checked = 0;
  const total = typeof pull.changed_files === "number" ? pull.changed_files : files.length;
  if (total > files.length)
    skipped.push({
      path: `${total - files.length} more files`,
      reason: "GitHub lists only the first 100 changed files",
    });

  for (const file of files) {
    const path = file.filename;
    const previous = file.status === "renamed" ? file.previous_filename : undefined;
    if (previous && eligible(previous) && !deleted.has(previous)) {
      deleted.add(previous);
      edits.push({ path: previous, content: null });
    }
    if (!eligible(path)) {
      skipped.push({ path, reason: "Not a JavaScript or TypeScript file" });
      continue;
    }
    if (file.status === "removed") {
      edits.push({ path, content: null });
      checked += 1;
      continue;
    }
    if (checked >= MAX_FILES) {
      skipped.push({ path, reason: `Over the ${MAX_FILES}-file limit for one check` });
      continue;
    }
    try {
      const blob = await githubContent(token, rawOwner, rawRepo, path, pull.head.sha);
      if (blob.type !== "file" || !blob.content || blob.encoding !== "base64") {
        skipped.push({ path, reason: "GitHub did not return the file content (too large?)" });
        continue;
      }
      const text = decode(blob.content);
      if (text.length > MAX_CHARS) {
        skipped.push({
          path,
          reason: `Larger than ${MAX_CHARS.toLocaleString("en-US")} characters`,
        });
        continue;
      }
      edits.push({ path, content: text });
      checked += 1;
    } catch {
      skipped.push({ path, reason: "Could not be read at the pull request head" });
    }
  }

  const snapshot = await loadSnapshot(userId, repository);
  const report = await verifyChange(snapshot.analysis, edits);
  return {
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    author: pull.user?.login ?? "unknown",
    headSha: pull.head.sha,
    report,
    filesChecked: checked,
    skipped,
    analysisCommit: snapshot.analysis.ref,
    stale: Boolean(pull.base.sha) && pull.base.sha !== snapshot.analysis.ref,
    checkedAt: new Date().toISOString(),
  };
}

export async function freshness(
  token: string,
  repository: string,
  analysisRef: string,
): Promise<Freshness> {
  try {
    const { owner, repo } = split(repository);
    const info = await get<{ default_branch: string }>(token, `/repos/${owner}/${repo}`);
    const branch = info.default_branch;
    const compare = await get<{ ahead_by: number; status: string; commits?: { sha: string }[] }>(
      token,
      `/repos/${owner}/${repo}/compare/${encodeURIComponent(analysisRef)}...${branch
        .split("/")
        .map(encodeURIComponent)
        .join("/")}?per_page=1`,
    );
    return {
      behindBy: compare.ahead_by,
      defaultBranch: branch,
      status: compare.status,
      headSha: compare.commits?.at(-1)?.sha,
    };
  } catch {
    return { behindBy: null, unknown: true };
  }
}
