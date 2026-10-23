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
