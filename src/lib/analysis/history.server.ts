import type { HistoryCommit, HistoryPullRequest, RepoHistory } from "./types";

const API = "https://api.github.com";
export const COMMIT_DETAIL_LIMIT = 200;
export const PULL_REQUEST_LIMIT = 60;
const CONCURRENCY = 8;

type Json = Record<string, unknown>;

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function get<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "nykst-software-intelligence",
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path} returned ${response.status}`);
  return (await response.json()) as T;
}

async function pool<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  onTick?: (done: number, total: number) => void,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let cursor = 0;
  let done = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index]!);
      } catch {
        results[index] = null;
      }
      done += 1;
      onTick?.(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
  return results;
}

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/gi;

/**
 * Builds file-level change history: which files each recent commit and pull request
 * touched, and which issues those pull requests closed. The GitHub list endpoints do
 * not include changed files, so this fetches details for the most recent items only.
 */
export async function buildRepositoryHistory(
  token: string,
  owner: string,
  repo: string,
  commits: Json[],
  pullRequests: Json[],
  onProgress?: (stage: "commits" | "pulls", done: number, total: number) => void,
): Promise<RepoHistory> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const limitations: string[] = [];

  const recentCommits = commits.slice(0, COMMIT_DETAIL_LIMIT);
  const commitDetails = await pool(
    recentCommits,
    async (commit) => {
      const detail = await get<Json>(token, `${base}/commits/${str(commit["sha"])}`);
      const parents = Array.isArray(detail["parents"]) ? detail["parents"].length : 1;
      const inner = (detail["commit"] ?? {}) as Json;
      const author = (inner["author"] ?? {}) as Json;
      const login = str(((detail["author"] ?? {}) as Json)["login"]);
      const files = Array.isArray(detail["files"]) ? (detail["files"] as Json[]) : [];
      const [subject = "", ...rest] = str(inner["message"]).split("\n");
      const body = rest.join("\n").trim().slice(0, 600);
      const item: HistoryCommit & { merge: boolean } = {
        sha: str(detail["sha"]),
        message: subject.slice(0, 200),
        ...(body ? { body } : {}),
        author: login || str(author["name"]) || "unknown",
        date: str(author["date"]),
        files: files.map((file) => str(file["filename"])).filter(Boolean),
        ...(str(detail["html_url"]) ? { url: str(detail["html_url"]) } : {}),
        merge: parents > 1,
      };
      return item;
    },
    (done, total) => onProgress?.("commits", done, total),
  );
  const failedCommits = commitDetails.filter((item) => item === null).length;
  if (failedCommits)
    limitations.push(`${failedCommits} commit(s) could not be expanded with changed files.`);
  if (commits.length > COMMIT_DETAIL_LIMIT)
    limitations.push(
      `File-level history covers the latest ${COMMIT_DETAIL_LIMIT} of ${commits.length} commits.`,
    );

  const recentPulls = pullRequests.slice(0, PULL_REQUEST_LIMIT);
  const pullDetails = await pool(
    recentPulls,
    async (pull) => {
      const number = Number(pull["number"]);
      const files = await get<Json[]>(token, `${base}/pulls/${number}/files?per_page=100`);
      const body = `${str(pull["title"])}\n${str(pull["body"])}`;
      const closes = [...new Set([...body.matchAll(CLOSING)].map((match) => Number(match[1])))];
      const item: HistoryPullRequest = {
        number,
        title: str(pull["title"]).slice(0, 200),
        ...(str(pull["body"]).trim() ? { body: str(pull["body"]).trim().slice(0, 600) } : {}),
        author: str(((pull["user"] ?? {}) as Json)["login"]) || "unknown",
        state: str(pull["state"]),
        mergedAt: str(pull["merged_at"]) || null,
        ...(str(pull["html_url"]) ? { url: str(pull["html_url"]) } : {}),
        files: files.map((file) => str(file["filename"])).filter(Boolean),
        closes,
      };
      return item;
    },
    (done, total) => onProgress?.("pulls", done, total),
  );
  if (pullRequests.length > PULL_REQUEST_LIMIT)
    limitations.push(
      `Pull request file lists cover the latest ${PULL_REQUEST_LIMIT} of ${pullRequests.length} pull requests.`,
    );

  return {
    generatedAt: new Date().toISOString(),
    commits: commitDetails
      .filter((item): item is HistoryCommit & { merge: boolean } => item !== null && !item.merge)
      .map(({ merge: _merge, ...commit }) => commit),
    pullRequests: pullDetails.filter((item): item is HistoryPullRequest => item !== null),
    limitations,
  };
}
