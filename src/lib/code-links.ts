/**
 * Pure helpers behind click-to-code: repository slugs, GitHub `#L` deep links,
 * editor deep links and the source excerpt rendered by the code inspector.
 *
 * No server imports so the same functions run in the browser and in tests.
 */

export const SELF_REPOSITORY = "flawsom/nykst";

export interface RepoSlug {
  owner: string;
  repo: string;
  slug: string;
}

/** Parses `owner/name`, a GitHub URL, or `name` with an owner hint. */
export function parseRepoSlug(
  value: string | null | undefined,
  ownerHint?: string,
): RepoSlug | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const fromUrl = /github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(raw);
  const cleaned = fromUrl
    ? `${fromUrl[1]}/${fromUrl[2]}`
    : raw.replace(/^https?:\/\/[^/]+\//i, "").replace(/\.git$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  const owner = parts.length >= 2 ? parts[0]! : (ownerHint ?? "").trim();
  const repo = (parts.length >= 2 ? parts[1]! : parts[0]!).replace(/\.git$/, "");
  if (!owner || !repo) return null;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return { owner, repo, slug: `${owner}/${repo}` };
}

export function isSelfRepository(repository: string | null | undefined): boolean {
  return parseRepoSlug(repository)?.slug.toLowerCase() === SELF_REPOSITORY;
}

const EVIDENCE_BLOCKED_DIRS = new Set([
  "node_modules",
  ".git",
  ".output",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  ".vercel",
  ".tanstack",
  ".nitro",
  ".wrangler",
  ".next",
  "BUFFY_TASK_OUTPUT",
]);

const EVIDENCE_BLOCKED_BASENAMES = new Set([
  ".env",
  ".npmrc",
  ".netrc",
  ".pypirc",
  "id_rsa",
  "id_ed25519",
]);

const EVIDENCE_ALLOWED_BASENAMES = new Set([
  "Dockerfile",
  "Makefile",
  "Procfile",
  "Gemfile",
  "Rakefile",
  "LICENSE",
  "README",
  "go.mod",
  "go.sum",
]);

const EVIDENCE_ALLOWED_EXTENSION =
  /\.(?:[cm]?[jt]sx?|py|go|rs|sql|md|json|ya?ml|toml|css|scss|sass|less|html?|txt|proto|graphql|gql|sh|bash|zsh|rb|java|kt|kts|cs|php|swift|scala|dart|ex|exs|erl|hs|lua|r|vue|svelte|astro)$/i;

/**
 * Source evidence may only read ordinary source and documentation files.
 * A path is not allowed to escape the workspace, enter a build or dependency
 * directory, or name a secret, key, environment, or credential file. This is
 * deliberately an allowlist of extensions, not a denylist of known filenames.
 */
export function isSafeEvidencePath(value: string): boolean {
  const path = value.trim();
  if (!path || path.length > 300) return false;
  if (path.startsWith("/") || path.startsWith("~") || path.includes("\\") || path.includes("\0"))
    return false;
  if (/(^|\/)\.\.($|\/)/.test(path)) return false;
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part.startsWith("."))) return false;
  if (parts.some((part) => EVIDENCE_BLOCKED_DIRS.has(part))) return false;
  const base = parts.at(-1) ?? "";
  if (EVIDENCE_BLOCKED_BASENAMES.has(base)) return false;
  if (EVIDENCE_ALLOWED_BASENAMES.has(base)) return true;
  return EVIDENCE_ALLOWED_EXTENSION.test(base);
}

/** Strip the full file body before returning evidence to a public response. */
export function withoutContent<T extends { content: string }>(value: T): Omit<T, "content"> {
  const { content, ...rest } = value;
  return rest;
}

/** GitHub blob URL that opens the exact line the user clicked. */
export function githubBlobUrl({
  repository,
  ref,
  path,
  line,
}: {
  repository: string | null | undefined;
  ref?: string | null;
  path: string;
  line?: number | null;
}): string | null {
  const slug = parseRepoSlug(repository);
  if (!slug || !path) return null;
  const target = (ref ?? "main").trim() || "main";
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const anchor = line && line > 0 ? `#L${Math.floor(line)}` : "";
  return `https://github.com/${slug.slug}/blob/${encodeURIComponent(target)}/${encoded}${anchor}`;
}

/** `vscode://file/<absolute path>:<line>` works in VS Code, Cursor and Windsurf. */
export function editorFileUrl(path: string, line?: number | null, origin?: string): string | null {
  if (!path) return null;
  const base = (origin ?? "").replace(/\/+$/, "");
  const normalized = path.replace(/^\.\//, "");
  const absolute = normalized.startsWith("/") ? normalized : `${base}/${normalized}`;
  if (!absolute.startsWith("/")) return null;
  const encoded = absolute
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `vscode://file${encoded}${line && line > 0 ? `:${Math.floor(line)}` : ""}`;
}

export interface CodeExcerptLine {
  number: number;
  text: string;
  isFocus?: boolean;
}

export interface CodeExcerpt {
  /** first line included in the excerpt, 1-based */
  start: number;
  /** last line included in the excerpt, 1-based */
  end: number;
  /** the focused line, clamped into the excerpt */
  line: number;
  lines: CodeExcerptLine[];
}

/** +/- `radius` lines around `line`, clamped to the real file length. */
export function buildCodeExcerpt(
  content: string,
  line: number | null | undefined,
  radius = 20,
): CodeExcerpt {
  const all = content.replace(/\r\n/g, "\n").split("\n");
  const total = all.length;
  const focus = Math.min(Math.max(Math.floor(line && line > 0 ? line : 1), 1), Math.max(total, 1));
  const start = Math.max(1, focus - radius);
  const end = Math.min(total, focus + radius);
  const lines: CodeExcerptLine[] = [];
  for (let number = start; number <= end; number += 1)
    lines.push({ number, text: all[number - 1] ?? "", isFocus: number === focus });
  return { start, end, line: focus, lines };
}

/** The literal statement on the clicked line, used in the inspector banner. */
export function focusLine(content: string, line: number | null | undefined): string {
  if (!content) return "";
  const all = content.replace(/\r\n/g, "\n").split("\n");
  const index = Math.min(Math.max((line ?? 1) - 1, 0), Math.max(all.length - 1, 0));
  return (all[index] ?? "").trim();
}

/** Why this line matters, derived from the line itself instead of guessed. */
export function describeLine(content: string, line: number | null | undefined): string {
  const text = focusLine(content, line);
  if (!text) return "The clicked line is outside the returned source window.";
  if (/^\s*(import|export\s+.*\s+from)\b/.test(text))
    return "This line imports the target module, so this file is a direct dependent.";
  if (/require\(|import\(/.test(text))
    return "This line dynamically loads the target module, so the edge is real but may be missed by static greps.";
  if (/\.(from|rpc|select|insert|update|upsert|delete)\(/.test(text))
    return "This line calls the database resource directly, so the column or table contract applies here.";
  return "This line is where the dependency or finding is recorded.";
}
