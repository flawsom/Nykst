import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import {
  SELF_REPOSITORY,
  buildCodeExcerpt,
  describeLine,
  editorFileUrl,
  focusLine,
  githubBlobUrl,
  isSafeEvidencePath,
  isSelfRepository,
  parseRepoSlug,
} from "@/lib/code-links";
import { githubContent } from "./github";

export interface CodeEvidence {
  repository: string;
  path: string;
  ref: string;
  line: number | null;
  focusLine: number;
  startLine: number;
  endLine: number;
  lines: Array<{ number: number; text: string; isFocus?: boolean }>;
  content: string;
  sha: string;
  source: "workspace" | "github";
  excerpt: ReturnType<typeof buildCodeExcerpt>;
  focus: string;
  description: string;
  githubUrl: string | null;
  githubHtmlUrl: string | null;
  editorPath: string;
  vscodeUrl: string;
  imports: Array<{ target: string; line: number; resolved: boolean }>;
}

const blobLruCache = new Map<string, { content: string; sha: string; cachedAt: number }>();
const MAX_CACHE_ENTRIES = 120;
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCachedBlob(key: string): { content: string; sha: string } | null {
  const entry = blobLruCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    blobLruCache.delete(key);
    return null;
  }
  blobLruCache.delete(key);
  blobLruCache.set(key, entry);
  return { content: entry.content, sha: entry.sha };
}

function setCachedBlob(key: string, content: string, sha: string) {
  if (blobLruCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = blobLruCache.keys().next().value;
    if (oldest) blobLruCache.delete(oldest);
  }
  blobLruCache.set(key, { content, sha, cachedAt: Date.now() });
}

function scanImports(content: string) {
  const found: Array<{ target: string; line: number; resolved: boolean }> = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns)
    for (const match of content.matchAll(pattern))
      found.push({
        target: match[1] ?? "",
        line: content.slice(0, match.index ?? 0).split("\n").length,
        resolved: false,
      });
  return found;
}

function localSource(path: string): string | null {
  if (!isSafeEvidencePath(path)) return null;
  const absolute = join(process.cwd(), path);
  if (!existsSync(absolute)) return null;
  try {
    // Resolve symlinks before reading so a link inside the repository cannot
    // turn an allowed source path into a read outside the workspace.
    const root = realpathSync(process.cwd());
    const resolved = realpathSync(absolute);
    if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) return null;
    return readFileSync(resolved, "utf8");
  } catch {
    return null;
  }
}

/**
 * Source for one clicked citation. The self-indexed repository reads the local
 * checkout when it exists, otherwise the public raw blob at the requested ref.
 * Any other repository reads the contents API with the user's OAuth token (cached in LRU).
 */
export async function loadCodeEvidence({
  token,
  repository,
  path,
  ref,
  line,
  radius = 25,
}: {
  token: string | null;
  repository: string;
  path: string;
  ref?: string | null;
  line?: number | null;
  radius?: number;
}): Promise<CodeEvidence | null> {
  const slug = parseRepoSlug(repository);
  if (!slug || !path || !isSafeEvidencePath(path)) return null;
  const target = (ref ?? "").trim() || "main";
  const focus = line && line > 0 ? Math.floor(line) : null;
  const self = isSelfRepository(slug.slug);

  let content: string | null = null;
  let sha = "";
  let source: CodeEvidence["source"] = "github";
  const resolvedRef = target;

  if (self) {
    content = localSource(path);
    if (content !== null) source = "workspace";
  }

  if (content === null) {
    const cacheKey = `${slug.slug}@${target}:${path}`;
    const cached = getCachedBlob(cacheKey);
    if (cached) {
      content = cached.content;
      sha = cached.sha;
      source = "github";
    } else if (token) {
      const file = await githubContent(token, slug.owner, slug.repo, path, target);
      content =
        file.encoding === "base64" && file.content
          ? Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8")
          : (file.content ?? "");
      sha = file.sha ?? "";
      setCachedBlob(cacheKey, content, sha);
    } else {
      const response = await fetch(
        `https://raw.githubusercontent.com/${slug.slug}/${encodeURIComponent(target)}/${path
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/")}`,
        { headers: { "User-Agent": "nykst-software-intelligence" } },
      );
      if (!response.ok) return null;
      content = await response.text();
      source = "github";
      setCachedBlob(cacheKey, content, "");
    }
  }

  if (content === null) return null;

  const excerpt = buildCodeExcerpt(content, focus, radius);
  const ghUrl = githubBlobUrl({
    repository: slug.slug,
    ref: resolvedRef,
    path,
    line: focus ?? excerpt.line,
  });
  const edPath = editorFileUrl(path, focus ?? excerpt.line, process.cwd()) ?? "";

  return {
    repository: slug.slug,
    path,
    ref: resolvedRef,
    line: focus,
    focusLine: excerpt.line,
    startLine: excerpt.start,
    endLine: excerpt.end,
    lines: excerpt.lines,
    content,
    sha,
    source,
    excerpt,
    focus: focusLine(content, focus),
    description: describeLine(content, focus),
    githubUrl: ghUrl,
    githubHtmlUrl: ghUrl,
    editorPath: edPath,
    vscodeUrl: edPath,
    imports: scanImports(content),
  };
}

export { SELF_REPOSITORY };
