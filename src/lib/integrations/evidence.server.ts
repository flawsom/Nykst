import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SELF_REPOSITORY,
  buildCodeExcerpt,
  describeLine,
  editorFileUrl,
  focusLine,
  githubBlobUrl,
  isSelfRepository,
  parseRepoSlug,
} from "@/lib/code-links";
import { githubContent } from "./github";

export interface CodeEvidence {
  repository: string;
  path: string;
  ref: string;
  line: number | null;
  content: string;
  sha: string;
  source: "workspace" | "github";
  excerpt: ReturnType<typeof buildCodeExcerpt>;
  focus: string;
  description: string;
  githubUrl: string | null;
  editorPath: string;
  imports: Array<{ target: string; line: number; resolved: boolean }>;
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
  if (path.includes("..")) return null;
  const absolute = join(process.cwd(), path);
  if (!existsSync(absolute)) return null;
  try {
    return readFileSync(absolute, "utf8");
  } catch {
    return null;
  }
}

/**
 * Source for one clicked citation. The self-indexed repository reads the local
 * checkout when it exists, otherwise the public raw blob at the requested ref.
 * Any other repository reads the contents API with the user's OAuth token.
 */
export async function loadCodeEvidence({
  token,
  repository,
  path,
  ref,
  line,
  radius = 20,
}: {
  token: string | null;
  repository: string;
  path: string;
  ref?: string | null;
  line?: number | null;
  radius?: number;
}): Promise<CodeEvidence | null> {
  const slug = parseRepoSlug(repository);
  if (!slug || !path) return null;
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
    if (token) {
      const file = await githubContent(token, slug.owner, slug.repo, path, target);
      content =
        file.encoding === "base64" && file.content
          ? Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8")
          : (file.content ?? "");
      sha = file.sha ?? "";
    } else {
      // Public repositories can be read without OAuth; private ones still need it.
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
    }
  }

  if (content === null) return null;

  return {
    repository: slug.slug,
    path,
    ref: resolvedRef,
    line: focus,
    content,
    sha,
    source,
    excerpt: buildCodeExcerpt(content, focus, radius),
    focus: focusLine(content, focus),
    description: describeLine(content, focus),
    githubUrl: githubBlobUrl({ repository: slug.slug, ref: resolvedRef, path, line: focus }),
    editorPath: editorFileUrl(path, focus, process.cwd()) ?? "",
    imports: scanImports(content),
  };
}

export { SELF_REPOSITORY };
