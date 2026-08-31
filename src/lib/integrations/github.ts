import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

const GITHUB_API = "https://api.github.com";
const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";

type GithubUser = { id: number; login: string; name?: string | null; avatar_url?: string };
type GithubOrg = { id: number; login: string; avatar_url?: string };
type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  description?: string | null;
  html_url: string;
  owner: { login: string };
};
type GithubFile = { path: string; type: string; size?: number; sha?: string };

function env(name: string): string | undefined {
  return process.env[name] || ((globalThis as Record<string, unknown>)[name] as string | undefined);
}

function getConfig() {
  const clientId = env("GITHUB_CLIENT_ID");
  const clientSecret = env("GITHUB_CLIENT_SECRET");
  if (!clientId || !clientSecret)
    throw new Error(
      "GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Vercel.",
    );
  return { clientId, clientSecret };
}

export function createOauthState() {
  const value = randomBytes(24).toString("hex");
  const digest = createHash("sha256").update(value).digest("hex");
  return { value, digest };
}

export function githubRedirectUri(request: Request) {
  return (
    env("GITHUB_REDIRECT_URI") ||
    "https://nykst-software-intellegence.vercel.app/api/integrations/github/callback"
  );
}

export function githubAuthorizeUrl(state: string, request: Request) {
  const { clientId } = getConfig();
  const url = new URL(GITHUB_AUTHORIZE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", githubRedirectUri(request));
  url.searchParams.set("scope", "read:org,repo,read:user");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGithubCode(code: string, redirectUri?: string) {
  const { clientId, clientSecret } = getConfig();
  const response = await fetch(GITHUB_TOKEN, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token)
    throw new Error(data.error_description || data.error || "GitHub authorization failed");
  return data.access_token;
}

async function githubFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers || {}),
    },
  });
  const data = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(data.message || `GitHub API returned ${response.status}`);
  return data;
}

export async function githubUser(token: string) {
  return githubFetch<GithubUser>(token, "/user");
}
export async function githubOrganizations(token: string) {
  return githubFetch<GithubOrg[]>(token, "/user/orgs?per_page=100");
}
export async function githubRepositories(token: string, org: string) {
  return githubFetch<GithubRepo[]>(
    token,
    `/orgs/${encodeURIComponent(org)}/repos?type=all&sort=updated&per_page=100`,
  );
}

export async function githubUserRepositories(token: string) {
  return paginate<GithubRepo>(token, "/user/repos?affiliation=owner&type=all&sort=updated");
}

export async function githubAccessibleRepositories(token: string) {
  const repositories = await paginate<GithubRepo>(
    token,
    "/user/repos?affiliation=owner,collaborator,organization_member&type=all&sort=updated",
  );
  return [...new Map(repositories.map((repository) => [repository.id, repository])).values()];
}

async function paginate<T>(token: string, path: string): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await githubFetch<T[]>(token, `${path}${separator}page=${page}&per_page=100`);
    result.push(...batch);
    if (batch.length < 100) break;
  }
  return result;
}

export async function ingestGithubRepository(token: string, owner: string, repo: string) {
  const repository = await githubFetch<GithubRepo>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
  const [files, commits, branches, pullRequests, issues, contributors] = await Promise.all([
    paginate<GithubFile>(
      token,
      `/repos/${owner}/${repo}/git/trees/${repository.default_branch}?recursive=1`,
    ).then((tree) =>
      tree.map((item) => ({
        path: item.path,
        type: item.type,
        size: item.size || 0,
        sha: item.sha,
      })),
    ),
    paginate<Record<string, unknown>>(token, `/repos/${owner}/${repo}/commits`),
    paginate<Record<string, unknown>>(token, `/repos/${owner}/${repo}/branches`),
    paginate<Record<string, unknown>>(token, `/repos/${owner}/${repo}/pulls?state=all`),
    paginate<Record<string, unknown>>(token, `/repos/${owner}/${repo}/issues?state=all`),
    paginate<Record<string, unknown>>(token, `/repos/${owner}/${repo}/contributors`),
  ]);
  return {
    provider: "github",
    repository: {
      id: repository.id,
      name: repository.name,
      full_name: repository.full_name,
      owner: repository.owner.login,
      private: repository.private,
      default_branch: repository.default_branch,
      description: repository.description,
      html_url: repository.html_url,
    },
    files,
    commits,
    branches,
    pull_requests: pullRequests,
    issues,
    contributors,
    summary: {
      file_count: files.length,
      commit_count: commits.length,
      branch_count: branches.length,
      pull_request_count: pullRequests.length,
      issue_count: issues.length,
      contributor_count: contributors.length,
    },
  };
}

export async function saveIngestion(
  user: GithubUser,
  payload: Awaited<ReturnType<typeof ingestGithubRepository>>,
) {
  const { data, error } = await supabaseAdmin
    .from("repository_ingestions")
    .insert({
      provider: "github",
      provider_user_id: String(user.id),
      provider_username: user.login,
      repository_full_name: payload.repository.full_name,
      status: "complete",
      payload: payload as unknown as Json,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not save ingestion: ${error.message}`);
  return data.id;
}

export function cookie(name: string, value: string, options: string[] = []) {
  return `${name}=${encodeURIComponent(value)}; Path=/; ${options.join("; ")}`;
}

export function readCookie(request: Request, name: string) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : undefined;
}

export function githubToken(request: Request) {
  return readCookie(request, "nykst_github_token");
}
export function requireGithubToken(request: Request) {
  const token = githubToken(request);
  if (!token)
    throw new Response(JSON.stringify({ error: "Connect GitHub first." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  return token;
}
export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
}
export function githubError(error: unknown) {
  return json(
    { error: error instanceof Error ? error.message : "GitHub request failed" },
    { status: 400 },
  );
}

export { GithubOrg, GithubRepo };

export const githubCookieOptions = ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=3600"];
export const oauthCookieOptions = ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=600"];
