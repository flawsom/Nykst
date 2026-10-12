import { impactBriefing } from "@/lib/analysis/context";
import { indexAnalysis } from "@/lib/analysis/impact";
import type { RepoAnalysis, RepoHistory } from "@/lib/analysis/types";

/**
 * Turns the repository analysis into short plain-text answers for Slack and Jira. Every line
 * comes from the analysis; nothing is estimated. Pure and safe to unit test.
 */

export interface SnapshotLike {
  repository_full_name: string;
  analysis: RepoAnalysis;
  history: RepoHistory | undefined;
}

const STOP = new Set(
  "the and for with that this from into when then than have has not are was were you your our can could should would will add make fix use new change update page bug issue ticket error does doesn't dont need needs want only also just when where which while about after before".split(
    " ",
  ),
);

/** File paths written inside a text, e.g. "src/lib/auth.ts". */
export function mentionedPaths(text: string, known: Set<string>) {
  const found = new Set<string>();
  for (const match of text.matchAll(/[\w@./()[\]-]+\.(?:tsx?|jsx?|mjs|cjs)\b/g)) {
    const candidate = match[0].replace(/^\.?\//, "");
    if (known.has(candidate)) found.add(candidate);
    else for (const path of known) if (path.endsWith(`/${candidate}`)) found.add(path);
  }
  return [...found];
}

/** Words of free text worth searching for. */
export function keywords(text: string) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9_ ]+/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 3 && !STOP.has(word)),
    ),
  ].slice(0, 12);
}

/**
 * Files a request is probably about: paths named in it, then a folder prefix, then files whose
 * path or exported names match its words.
 */
export function resolveFiles(analysis: RepoAnalysis, query: string, limit = 8) {
  const known = new Set(analysis.files.map((file) => file.path));
  const named = mentionedPaths(query, known);
  if (named.length) return named.slice(0, limit);
  const trimmed = query.trim().replace(/^\.?\//, "");
  if (known.has(trimmed)) return [trimmed];
  const prefix = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  const inFolder = [...known].filter((path) => path.startsWith(prefix));
  if (trimmed && inFolder.length) return inFolder.slice(0, limit);
  const words = keywords(query);
  if (!words.length) return [];
  return analysis.files
    .map((file) => {
      const path = file.path.toLowerCase();
      const names = file.exports.join(" ").toLowerCase();
      let score = 0;
      for (const word of words) {
        if (path.includes(word)) score += 3;
        if (names.includes(word)) score += 2;
      }
      return { path: file.path, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((entry) => entry.path);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What breaks if these files change, as plain text lines. */
export function impactLines(snapshot: SnapshotLike, paths: string[]) {
  const { analysis, history } = snapshot;
  const index = indexAnalysis(analysis);
  const known = paths.filter((path) => index.files.has(path));
  if (!known.length) return ["None of those files is part of the analyzed code."];
  const brief = impactBriefing(analysis, history, known, { maxItems: 8 });
  const lines = [
    `Files: ${known.slice(0, 5).join(", ")}${known.length > 5 ? ` and ${known.length - 5} more` : ""}`,
    `Impact: ${brief.impact.level}. ${plural(brief.impact.runtime_dependents, "file")} depend on it at runtime` +
      (brief.impact.type_only_dependents
        ? `, ${brief.impact.type_only_dependents} more by type only.`
        : "."),
  ];
  if (brief.impact.entrypoints.length)
    lines.push(
      `Pages and API routes reached (${brief.impact.entrypoints.length}): ${brief.impact.entrypoints
        .slice(0, 5)
        .map((entry) => entry.path)
        .join(", ")}`,
    );
  if (brief.impact.direct_importers.length)
    lines.push(
      `Imported directly by: ${brief.impact.direct_importers
        .slice(0, 5)
        .map((item) => `${item.path}:${item.line}`)
        .join(", ")}`,
    );
  lines.push(
    brief.impact.tests_that_cover_it.length
      ? `Tests that reach it: ${brief.impact.tests_that_cover_it.slice(0, 4).join(", ")}`
      : "No test imports this code.",
  );
  const recent = brief.history.commits[0];
  if (recent) lines.push(`Last change: ${recent.date} by ${recent.author}, "${recent.message}"`);
  if (brief.history.usually_changed_together.length)
    lines.push(
      `Usually changed together with: ${brief.history.usually_changed_together
        .slice(0, 3)
        .map((item) => item.path)
        .join(", ")}`,
    );
  return lines;
}

export function architectureLines(snapshot: SnapshotLike) {
  const { analysis } = snapshot;
  return [
    `${snapshot.repository_full_name}: ${plural(analysis.stats.analyzedFiles, "source file")}, ${plural(analysis.stats.internalEdges, "import")}`,
    `External services: ${analysis.services.map((service) => service.name).join(", ") || "none found"}`,
    `Data: ${
      analysis.resources.length
        ? analysis.resources
            .map((r) => r.id)
            .slice(0, 8)
            .join(", ")
        : "none found"
    }`,
    analysis.cycles.length ? `Circular imports: ${analysis.cycles.length}` : "No circular imports.",
  ];
}

export function analysisFooter(snapshot: SnapshotLike) {
  return `Based on ${snapshot.repository_full_name} at ${snapshot.analysis.ref.slice(0, 7)}. Static analysis of JavaScript/TypeScript only.`;
}

/** Answer to a Slack "/nykst …" command. */
export function answerCommand(snapshot: SnapshotLike, text: string) {
  const [command = "help", ...rest] = text.trim().split(/\s+/);
  const argument = rest.join(" ");
  if (command === "impact") {
    if (!argument) return "Usage: /nykst impact <file, folder or description>";
    const paths = resolveFiles(snapshot.analysis, argument);
    if (!paths.length)
      return `No analyzed file matches "${argument}". Try a path like src/lib/auth.ts.`;
    return [...impactLines(snapshot, paths), analysisFooter(snapshot)].join("\n");
  }
  if (command === "overview")
    return [...architectureLines(snapshot), analysisFooter(snapshot)].join("\n");
  return [
    "Nykst commands:",
    "/nykst impact <file, folder or description>: what breaks if it changes",
    "/nykst overview: services, data and structure of the repository",
  ].join("\n");
}

/** Jira comment text for a ticket: which code it touches and what that affects. */
export function ticketAnalysis(snapshot: SnapshotLike, summary: string, description: string) {
  const paths = resolveFiles(snapshot.analysis, `${summary}\n${description}`);
  if (!paths.length)
    return [
      "Nykst could not tie this ticket to specific files.",
      "Mention a file path (for example src/lib/auth.ts) in the ticket and run the analysis again.",
      analysisFooter(snapshot),
    ];
  return [
    "Nykst: code this ticket most likely touches, and what depends on it.",
    ...impactLines(snapshot, paths),
    analysisFooter(snapshot),
  ];
}

/** Atlassian Document Format: one paragraph per line. */
export function toAdf(lines: string[]) {
  return {
    type: "doc",
    version: 1,
    content: lines.map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    })),
  };
}

/** Plain text of an Atlassian Document Format node. */
export function adfText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const item = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof item.text === "string") return item.text;
  const block = ["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem"].includes(
    item.type ?? "",
  );
  const inner = (item.content ?? []).map(adfText).join(block ? "" : " ");
  return item.type === "paragraph" || item.type === "heading" ? `${inner}\n` : inner;
}
