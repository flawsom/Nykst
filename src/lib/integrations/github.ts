import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { analyzeRepository, MAX_SOURCE_BYTES, wantsContent } from "@/lib/analysis/engine.server";
import { publishIngestion } from "@/lib/realtime.server";
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
      "GitHub OAuth is not configured on this deployment. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on the server.",
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

const ALLOWED_REDIRECT_URIS = new Set([
  "https://nykst.unifies.codes/api/integrations/github/callback",
  "https://nykst.vercel.app/api/integrations/github/callback",
  "http://localhost:8080/api/integrations/github/callback",
]);

function matchesAllowedOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    return (
      host === "nykst.unifies.codes" ||
      host.endsWith(".unifies.codes") ||
      host === "nykst.vercel.app" ||
      (host.startsWith("nykst") && host.endsWith(".vercel.app")) ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

export function githubRedirectUri(request: Request) {
  const configured = process.env["GITHUB_REDIRECT_URI"]?.trim();
  if (configured) return configured;

  const reqUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const effectiveOrigin = forwardedHost
    ? `${forwardedProto || reqUrl.protocol.replace(":", "")}://${forwardedHost}`
    : reqUrl.origin;

  const candidate = new URL("/api/integrations/github/callback", effectiveOrigin).toString();
  if (ALLOWED_REDIRECT_URIS.has(candidate) || matchesAllowedOrigin(effectiveOrigin)) {
    return candidate;
  }
  return new URL("/api/integrations/github/callback", request.url).toString();
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

export type GithubFileEvidence = {
  path: string;
  content?: string;
  sha?: string;
  imports: Array<{ target: string; line: number; resolved: boolean }>;
  dependents: Array<{ path: string; line: number; commitSha: string }>;
  commits: Array<Record<string, unknown>>;
  pullRequests: Array<Record<string, unknown>>;
  coChange: Array<{ path: string; count: number }>;
  blindSpots: string[];
};

function importMatches(content: string) {
  const result: Array<{ target: string; line: number }> = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      result.push({
        target: match[1] ?? "",
        line: content.slice(0, match.index ?? 0).split("\n").length,
      });
    }
  }
  return result;
}

export async function githubFileEvidence(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<GithubFileEvidence> {
  const file = await githubContent(token, owner, repo, path, branch);
  const content =
    file.encoding === "base64" && file.content
      ? Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8")
      : (file.content ?? "");
  const tree = await githubFetch<{ tree?: GithubFile[] }>(
    token,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  const paths = new Set((tree.tree ?? []).map((item) => item.path));
  const resolve = (target: string) => {
    if (!target.startsWith(".")) return false;
    const base = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    const raw = `${base}${target}`.replace(/^\.\//, "");
    return [
      raw,
      `${raw}.ts`,
      `${raw}.tsx`,
      `${raw}.js`,
      `${raw}.jsx`,
      `${raw}/index.ts`,
      `${raw}/index.tsx`,
    ].some((candidate) => paths.has(candidate));
  };
  const imports = importMatches(content).map((item) => ({
    ...item,
    resolved: resolve(item.target),
  }));
  const commits = await paginate<Record<string, unknown>>(
    token,
    `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}`,
  );
  const commitDetails = await Promise.all(
    commits.slice(0, 40).map(async (commit) => {
      const sha = typeof commit["sha"] === "string" ? commit["sha"] : "";
      if (!sha) return { commit, files: [] as GithubFile[] };
      try {
        const detail = await githubFetch<{ files?: GithubFile[] }>(
          token,
          `/repos/${owner}/${repo}/commits/${sha}`,
        );
        return { commit, files: detail.files ?? [] };
      } catch {
        return { commit, files: [] as GithubFile[] };
      }
    }),
  );
  const coChangeCounts = new Map<string, number>();
  for (const detail of commitDetails) {
    for (const changed of detail.files) {
      if (!changed.path || changed.path === path) continue;
      coChangeCounts.set(changed.path, (coChangeCounts.get(changed.path) ?? 0) + 1);
    }
  }
  const recentPrs = await paginate<Record<string, unknown>>(
    token,
    `/repos/${owner}/${repo}/pulls?state=all`,
  );
  const pullRequests: Record<string, unknown>[] = [];
  for (const pull of recentPrs.slice(0, 30)) {
    const number = typeof pull["number"] === "number" ? pull["number"] : null;
    if (!number) continue;
    try {
      const changed = await paginate<GithubFile>(
        token,
        `/repos/${owner}/${repo}/pulls/${number}/files`,
      );
      if (changed.some((item) => item.path === path)) pullRequests.push(pull);
    } catch {
      // Keep evidence conservative when GitHub denies a PR file list.
    }
  }
  const candidateDependentPaths = [
    ...new Set(
      commitDetails.flatMap((detail) =>
        detail.files
          .map((changed) => changed.path)
          .filter((changed): changed is string => Boolean(changed && changed !== path)),
      ),
    ),
  ].slice(0, 60);
  const dependents: Array<{ path: string; line: number; commitSha: string }> = [];
  for (const sourcePath of candidateDependentPaths) {
    try {
      const source = await githubContent(token, owner, repo, sourcePath, branch);
      const sourceContent =
        source.encoding === "base64" && source.content
          ? Buffer.from(source.content.replace(/\n/g, ""), "base64").toString("utf8")
          : (source.content ?? "");
      const matches = importMatches(sourceContent).filter((item) => {
        if (!item.target.startsWith(".")) return false;
        const base = sourcePath.includes("/")
          ? sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1)
          : "";
        const raw = `${base}${item.target}`.replace(/^\.\//, "");
        return [
          raw,
          `${raw}.ts`,
          `${raw}.tsx`,
          `${raw}.js`,
          `${raw}.jsx`,
          `${raw}/index.ts`,
          `${raw}/index.tsx`,
        ].includes(path);
      });
      for (const match of matches) {
        const touchingCommit = commitDetails.find((detail) =>
          detail.files.some((changed) => changed.path === sourcePath),
        );
        dependents.push({
          path: sourcePath,
          line: match.line,
          commitSha:
            typeof touchingCommit?.commit["sha"] === "string" ? touchingCommit.commit["sha"] : "",
        });
      }
    } catch {
      // A dependent's source may be unavailable; do not infer the relationship.
    }
  }
  const blindSpots = [
    ...imports
      .filter((item) => item.target.startsWith(".") && !item.resolved)
      .map((item) => `Unresolved import ${item.target} at line ${item.line}`),
    ...(content.includes("import(")
      ? ["Dynamic import detected; target resolution may be incomplete."]
      : []),
    ...(content.includes("export *")
      ? ["Re-export detected; complete symbol provenance requires deeper parsing."]
      : []),
    ...(candidateDependentPaths.length > dependents.length
      ? [
          "Some co-changed files could not be proven to import this file; they are excluded from dependents.",
        ]
      : []),
  ];
  return {
    path,
    content,
    sha: file.sha,
    imports,
    dependents: [
      ...new Map(dependents.map((item) => [`${item.path}:${item.commitSha}`, item])).values(),
    ],
    commits: commits.slice(0, 40),
    pullRequests,
    coChange: [...coChangeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([changedPath, count]) => ({ path: changedPath, count })),
    blindSpots: [...new Set(blindSpots)],
  };
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
  const [source, history] = await Promise.all([
    analyzeRepositorySource(token, owner, repo, repository.default_branch),
    buildRepositoryHistory(token, owner, repo, commits, pullRequests),
  ]);
  const { analysis, dependency_graph } = source;
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
  // Push the new snapshot to every open graph for this user, in real time.
  await publishIngestion(String(user.id), data.id);
  return data.id;
}

export type GithubPullFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  previous_filename?: string;
};

export type GithubIssueComment = {
  id: number;
  body: string;
  user?: { login?: string } | null;
  html_url?: string;
};

/** Files in a pull request, including renames, with GitHub's own pagination. */
export async function githubPullRequestFiles(
  token: string,
  owner: string,
  repo: string,
  number: number,
) {
  return paginate<GithubPullFile>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/files`,
  );
}

export async function listIssueComments(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
) {
  return paginate<GithubIssueComment>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
  );
}

export async function createIssueComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
) {
  return githubFetch<GithubIssueComment>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
}

export async function updateIssueComment(
  token: string,
  owner: string,
  repo: string,
  commentId: number,
  body: string,
) {
  return githubFetch<GithubIssueComment>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${commentId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
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
  // requireGithubToken and other guards throw ready-made Responses (401/403). Preserve them
  // instead of flattening every failure into a 400, so clients can tell "connect GitHub" apart
  // from a broken request.
  if (error instanceof Response) return error;
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
