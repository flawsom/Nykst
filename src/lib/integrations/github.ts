import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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

function getConfig() {
  const clientId = process.env["GITHUB_CLIENT_ID"]?.trim();
  // The deployed Vercel project stores the rotated secret under CLIENT_SECRET.
  // Prefer it while retaining the standardized name for clean installations.
  const clientSecret =
    process.env["CLIENT_SECRET"]?.trim() || process.env["GITHUB_CLIENT_SECRET"]?.trim();
  if (!clientId || !clientSecret)
    throw new Error(
      "GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Vercel.",
    );
  return { clientId, clientSecret };
}

export function createOauthState() {
  const value = `${Date.now()}.${randomBytes(24).toString("hex")}`;
  const digest = createHmac("sha256", getConfig().clientSecret).update(value).digest("hex");
  return { value, digest, state: `${value}.${digest}` };
}

export function verifyOauthState(state: string) {
  const separator = state.lastIndexOf(".");
  if (separator <= 0) return false;
  const value = state.slice(0, separator);
  const received = state.slice(separator + 1);
  if (!/^\d+\.[a-f0-9]{48}$/.test(value) || !/^[a-f0-9]{64}$/.test(received)) return false;
  const age = Date.now() - Number(value.split(".", 1)[0]);
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) return false;
  const expected = createHmac("sha256", getConfig().clientSecret).update(value).digest("hex");
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

export function githubRedirectUri(request: Request) {
  return (
    process.env["GITHUB_REDIRECT_URI"]?.trim() ||
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

export type GithubContent = {
  type: string;
  encoding?: string;
  content?: string;
  sha: string;
  path: string;
};
export type GithubRef = { object: { sha: string } };

export async function githubContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
) {
  return githubFetch<GithubContent>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
  );
}

export async function githubBranchSha(token: string, owner: string, repo: string, branch: string) {
  const ref = await githubFetch<GithubRef>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
  );
  return ref.object.sha;
}

export async function githubCreateBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  sha: string,
) {
  return githubFetch<{ ref: string }>(token, `/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
}

export async function githubPutFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  branch: string,
  message: string,
  sha: string,
) {
  return githubFetch<{ content?: { html_url?: string }; commit?: { sha?: string } }>(
    token,
    `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
        sha,
      }),
    },
  );
}

export async function githubCreatePullRequest(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string,
) {
  return githubFetch<{ html_url: string; number: number; title: string }>(
    token,
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body, head, base }),
    },
  );
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
  return paginate<GithubRepo>(token, "/user/repos?affiliation=owner&sort=updated");
}

export async function githubAccessibleRepositories(token: string) {
  const repositories = await paginate<GithubRepo>(
    token,
    "/user/repos?affiliation=owner,collaborator,organization_member&sort=updated",
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
    githubFetch<{ tree?: GithubFile[] }>(
      token,
      `/repos/${owner}/${repo}/git/trees/${repository.default_branch}?recursive=1`,
    ).then(({ tree = [] }) =>
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
  const dependency_graph = await analyzeRepositoryDependencies(
    token,
    owner,
    repo,
    repository.default_branch,
    files,
  );
  const validation_profile = await buildValidationProfile(
    token,
    owner,
    repo,
    repository.default_branch,
    files,
  );
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
    dependency_graph,
    validation_profile,
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

type DependencyFile = { path?: string; type?: string; size?: number; sha?: string };

function sourceFile(path: string) {
  return /\.(mjs|cjs|js|jsx|ts|tsx|py|go|java|rs|rb|php)$/.test(path);
}

function resolveRelativeImport(source: string, imported: string, paths: Set<string>) {
  const base = source.includes("/") ? source.slice(0, source.lastIndexOf("/") + 1) : "";
  const raw = `${base}${imported}`.replace(/^\.\//, "");
  const candidates = [
    raw,
    `${raw}.ts`,
    `${raw}.tsx`,
    `${raw}.js`,
    `${raw}.jsx`,
    `${raw}/index.ts`,
    `${raw}/index.tsx`,
  ];
  return candidates.find((candidate) => paths.has(candidate));
}

function importsFor(path: string, content: string) {
  const imports = new Set<string>();
  const patterns = [
    /(?:import|export)\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /from\s+([a-zA-Z0-9_./-]+)\s+import\s+/g,
    /\buse\s+([a-zA-Z0-9_./-]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1] && match[1] !== path) imports.add(match[1]);
    }
  }
  return [...imports].slice(0, 80);
}

async function analyzeRepositoryDependencies(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: DependencyFile[],
) {
  const paths = new Set(
    files.map((file) => file.path).filter((path): path is string => Boolean(path)),
  );
  const candidates = files
    .filter(
      (file) =>
        file.type === "blob" && file.path && sourceFile(file.path) && (file.size ?? 0) <= 200_000,
    )
    .slice(0, 120);
  const edges: Array<{ from: string; to: string; kind: "internal" | "external" }> = [];
  const nodes = new Set<string>();
  for (const file of candidates) {
    if (!file.path) continue;
    try {
      const response = await githubFetch<{ content?: string; encoding?: string }>(
        token,
        `/repos/${owner}/${repo}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
      );
      const content =
        response.encoding === "base64" && response.content
          ? Buffer.from(response.content.replace(/\n/g, ""), "base64").toString("utf8")
          : (response.content ?? "");
      if (!content) continue;
      nodes.add(file.path);
      for (const imported of importsFor(file.path, content)) {
        const target = imported.startsWith(".")
          ? resolveRelativeImport(file.path, imported, paths)
          : undefined;
        edges.push({
          from: file.path,
          to: target ?? imported,
          kind: target ? "internal" : "external",
        });
      }
    } catch {
      // A single unreadable file must not make the repository ingestion fail.
    }
  }
  return {
    generated_at: new Date().toISOString(),
    method: "bounded-source-import-analysis",
    scanned_files: nodes.size,
    edges: edges.slice(0, 4000),
  };
}

async function readRepositoryText(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
) {
  try {
    const response = await githubFetch<{ content?: string; encoding?: string }>(
      token,
      `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
    );
    if (!response.content) return null;
    return response.encoding === "base64"
      ? Buffer.from(response.content.replace(/\n/g, ""), "base64").toString("utf8")
      : response.content;
  } catch {
    return null;
  }
}

async function buildValidationProfile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: DependencyFile[],
) {
  const paths = new Set(
    files.map((file) => file.path).filter((path): path is string => Boolean(path)),
  );
  const packageJson = paths.has("package.json")
    ? await readRepositoryText(token, owner, repo, branch, "package.json")
    : null;
  let packageScripts: Record<string, string> = {};
  let packageManager: "npm" | "pnpm" | "yarn" | "bun" | null = null;
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as {
        scripts?: Record<string, string>;
        packageManager?: string;
      };
      packageScripts = parsed.scripts ?? {};
      packageManager = parsed.packageManager?.startsWith("pnpm")
        ? "pnpm"
        : parsed.packageManager?.startsWith("yarn")
          ? "yarn"
          : parsed.packageManager?.startsWith("bun")
            ? "bun"
            : "npm";
    } catch {
      // Keep the profile conservative when package.json is malformed.
    }
  }
  if (!packageManager)
    packageManager = paths.has("pnpm-lock.yaml")
      ? "pnpm"
      : paths.has("yarn.lock")
        ? "yarn"
        : paths.has("bun.lockb")
          ? "bun"
          : paths.has("package.json")
            ? "npm"
            : null;
  const run = (script: string) =>
    packageManager === "pnpm"
      ? `pnpm ${script}`
      : packageManager === "yarn"
        ? `yarn ${script}`
        : packageManager === "bun"
          ? `bun ${script}`
          : `npm run ${script}`;
  return {
    generated_at: new Date().toISOString(),
    package_manager: packageManager,
    install_command: packageManager ? `${packageManager} install --frozen-lockfile` : null,
    commands: [
      ...(packageScripts.typecheck ? [run("typecheck")] : []),
      ...(packageScripts.lint ? [run("lint")] : []),
      ...(packageScripts.test ? [run("test")] : []),
      ...(packageScripts.build ? [run("build")] : []),
    ],
    source: packageJson ? "package.json" : "repository file inventory",
    can_execute: Boolean(
      packageManager &&
      (packageScripts.test ||
        packageScripts.build ||
        packageScripts.typecheck ||
        packageScripts.lint),
    ),
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

// Keep the user's GitHub connection across reloads and normal return visits.
// GitHub can still invalidate the token; in that case the UI will ask to reconnect.
export const githubCookieOptions = ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=31536000"];
export const oauthCookieOptions = ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=600"];
