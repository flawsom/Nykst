import { computeFindings, type IssueLike } from "@/lib/analysis/findings";
import { syncFindings } from "@/lib/memory.server";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { analyzeRepository, MAX_SOURCE_BYTES, wantsContent } from "@/lib/analysis/engine.server";
import { buildRepositoryHistory } from "@/lib/analysis/history.server";
import { isSourcePath } from "@/lib/analysis/resolve";
import { fetchRepositoryTarball } from "@/lib/analysis/tarball.server";

const GITHUB_API = "https://api.github.com";
const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";
// GitHub rejects requests without a User-Agent. Node adds one by default; Workers do not.
export const GITHUB_USER_AGENT = "nykst-software-intelligence";

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
  owner: { login: string; type?: string };
};
type GithubInstallation = {
  id: number;
  account: { id: number; login: string; type: string; avatar_url?: string } | null;
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
    // Follow whatever host served the request (workers.dev, a custom domain, local dev).
    new URL("/api/integrations/github/callback", request.url).toString()
  );
}

export function githubAppSlug() {
  return process.env["GITHUB_APP_SLUG"]?.trim() || null;
}

/**
 * True when sign-in goes through a GitHub App: users grant read-only access to the
 * repositories they choose. GitHub App client IDs start with "Iv" (OAuth apps use "Ov" or
 * plain hex), so the switch follows the configured client ID; a slug also forces it on.
 * The legacy OAuth app requests the full `repo` scope.
 */
export function githubIsApp() {
  return Boolean(githubAppSlug()) || /^Iv/.test(process.env["GITHUB_CLIENT_ID"]?.trim() ?? "");
}

/** Where users choose, add or remove the repositories the GitHub App can read. */
export function githubInstallUrl() {
  const slug = githubAppSlug();
  return slug ? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new` : null;
}

export function githubAuthorizeUrl(state: string, request: Request) {
  const { clientId } = getConfig();
  const url = new URL(GITHUB_AUTHORIZE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", githubRedirectUri(request));
  // GitHub Apps take their permissions from the app settings, not from scopes.
  if (!githubIsApp()) url.searchParams.set("scope", "read:org,repo,read:user");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGithubCode(code: string, redirectUri?: string) {
  const { clientId, clientSecret } = getConfig();
  const response = await fetch(GITHUB_TOKEN, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": GITHUB_USER_AGENT,
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    }),
  });
  const data = (await readJson(response)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token)
    throw new Error(data.error_description || data.error || "GitHub authorization failed");
  return data.access_token;
}

/** Parses a GitHub response, turning non-JSON error pages into a readable error. */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`GitHub returned ${response.status}: ${text.slice(0, 200)}`);
  }
}

async function githubFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": GITHUB_USER_AGENT,
      ...(init?.headers || {}),
    },
  });
  const data = (await readJson(response)) as T & { message?: string };
  if (response.status === 403 && data.message === "Resource not accessible by integration")
    throw new Error(
      "Nykst has read-only access to this repository, so it can't make this change on GitHub.",
    );
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

export async function githubUser(token: string) {
  return githubFetch<GithubUser>(token, "/user");
}
/** Repositories the user granted to the GitHub App, across all their installations. */
async function githubInstallationRepositories(token: string) {
  const { installations = [] } = await githubFetch<{ installations?: GithubInstallation[] }>(
    token,
    "/user/installations?per_page=100",
  );
  const repositories: GithubRepo[] = [];
  for (const installation of installations) {
    for (let page = 1; page <= 10; page += 1) {
      const batch = await githubFetch<{ repositories?: GithubRepo[] }>(
        token,
        `/user/installations/${installation.id}/repositories?per_page=100&page=${page}`,
      );
      repositories.push(...(batch.repositories ?? []));
      if ((batch.repositories ?? []).length < 100) break;
    }
  }
  return {
    installations,
    repositories: [
      ...new Map(repositories.map((repository) => [repository.id, repository])).values(),
    ],
  };
}

export async function githubOrganizations(token: string) {
  if (githubIsApp()) {
    const { installations } = await githubInstallationRepositories(token);
    return installations
      .map((installation) => installation.account)
      .filter((account): account is NonNullable<typeof account> => account?.type === "Organization")
      .map(({ id, login, avatar_url }) => ({ id, login, ...(avatar_url ? { avatar_url } : {}) }));
  }
  return githubFetch<GithubOrg[]>(token, "/user/orgs?per_page=100");
}
export async function githubRepositories(token: string, org: string) {
  if (githubIsApp()) {
    const { repositories } = await githubInstallationRepositories(token);
    return repositories.filter((repository) => repository.owner.login === org);
  }
  return githubFetch<GithubRepo[]>(
    token,
    `/orgs/${encodeURIComponent(org)}/repos?type=all&sort=updated&per_page=100`,
  );
}

export async function githubUserRepositories(token: string) {
  if (githubIsApp()) return (await githubInstallationRepositories(token)).repositories;
  return paginate<GithubRepo>(token, "/user/repos?affiliation=owner&sort=updated");
}

export async function githubAccessibleRepositories(token: string) {
  if (githubIsApp()) return (await githubInstallationRepositories(token)).repositories;
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

export type IngestStage = "repository" | "listing" | "source" | "history" | "findings" | "saving";

export async function ingestGithubRepository(
  token: string,
  owner: string,
  repo: string,
  progress: (stage: IngestStage, detail?: string) => void = () => undefined,
) {
  progress("repository");
  const repository = await githubFetch<GithubRepo>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
  progress("listing");
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
  progress("source", `${files.length} files`);
  const [source, history] = await Promise.all([
    analyzeRepositorySource(token, owner, repo, repository.default_branch),
    buildRepositoryHistory(token, owner, repo, commits, pullRequests, (kind, done, total) =>
      progress("history", `${kind === "commits" ? "commit" : "pull request"} ${done} of ${total}`),
    ),
  ]);
  const { analysis, dependency_graph } = source;
  progress("findings");
  const findings = computeFindings(analysis, history, issues as unknown as IssueLike[]);
  const validation_profile = await buildValidationProfile(
    token,
    owner,
    repo,
    repository.default_branch,
    files,
    source.packageJson,
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
    analysis,
    history,
    findings,
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

type DependencyFile = { path?: string; type?: string; size?: number; sha?: string | undefined };

/**
 * Downloads the repository archive once and runs the TypeScript-based analysis engine
 * over every JS/TS source file. `dependency_graph` is kept as a compact edge list for
 * older consumers; the full result lives in `analysis`.
 */
async function analyzeRepositorySource(token: string, owner: string, repo: string, ref: string) {
  const archive = await fetchRepositoryTarball(token, owner, repo, ref, wantsContent);
  const skipped = archive.paths.filter(
    (path) => isSourcePath(path) && (archive.sizes.get(path) ?? 0) > MAX_SOURCE_BYTES,
  ).length;
  const analysis = await analyzeRepository({
    ref: archive.commitSha ?? ref,
    paths: archive.paths,
    contents: archive.contents,
    skipped,
  });
  const edges = analysis.files.flatMap((file) =>
    file.imports
      .filter((item) => (item.kind === "internal" || item.kind === "external") && item.target)
      .map((item) => ({
        from: file.path,
        to: item.target!,
        kind: item.kind as "internal" | "external",
      })),
  );
  return {
    analysis,
    packageJson: archive.contents.get("package.json") ?? null,
    dependency_graph: {
      generated_at: analysis.generatedAt,
      method: analysis.method,
      scanned_files: analysis.stats.analyzedFiles,
      edges: edges.filter((edge) => edge.kind === "internal").slice(0, 4000),
    },
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
  knownPackageJson: string | null = null,
) {
  const paths = new Set(
    files.map((file) => file.path).filter((path): path is string => Boolean(path)),
  );
  const packageJson =
    knownPackageJson ??
    (paths.has("package.json")
      ? await readRepositoryText(token, owner, repo, branch, "package.json")
      : null);
  let packageScripts: Record<string, string> = {};
  let keyLibraries: string[] = [];
  let packageManager: "npm" | "pnpm" | "yarn" | "bun" | null = null;
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson) as {
        scripts?: Record<string, string>;
        packageManager?: string;
      };
      packageScripts = parsed.scripts ?? {};
      const packageRecord = parsed as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      keyLibraries = [
        ...Object.keys(packageRecord.dependencies ?? {}),
        ...Object.keys(packageRecord.devDependencies ?? {}),
      ].slice(0, 40);
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
      ...(packageScripts["typecheck"] ? [run("typecheck")] : []),
      ...(packageScripts["lint"] ? [run("lint")] : []),
      ...(packageScripts["test"] ? [run("test")] : []),
      ...(packageScripts["build"] ? [run("build")] : []),
    ],
    source: packageJson ? "package.json" : "repository file inventory",
    can_execute: Boolean(
      packageManager &&
      (packageScripts["test"] ||
        packageScripts["build"] ||
        packageScripts["typecheck"] ||
        packageScripts["lint"]),
    ),
    key_libraries: keyLibraries,
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
  // Track which findings are new, fixed or came back. Never fail an analysis over it.
  try {
    await syncFindings(
      String(user.id),
      payload.repository.full_name,
      payload.findings,
      payload.analysis.ref,
    );
  } catch (syncError) {
    console.error("Finding history was not updated:", syncError);
  }
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
