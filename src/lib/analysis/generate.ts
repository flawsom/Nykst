import type { ProposedEdit } from "./verify-types";
import type { RepoAnalysis } from "./types";

/**
 * Pure helpers for "write the change, then check it". The model answers in a delimited
 * format rather than JSON because whole files are awkward to escape and models break it often.
 */

export const MAX_FILES_READ = 6;
export const MAX_FILE_CHARS = 40_000;
export const MAX_EDIT_FILES = 8;

const FILE_START = /^<<<FILE\s+(.+?)\s*>>>\s*$/;
const FILE_END = /^<<<END>>>\s*$/;

export interface ParsedAnswer {
  summary: string;
  edits: ProposedEdit[];
  problems: string[];
}

/** Repository-relative path or null when it escapes the repository or is nonsense. */
export function safeEditPath(raw: string) {
  const path = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\.?\//, "");
  if (!path || path.includes("\0") || path.startsWith("/")) return null;
  if (path.split("/").some((part) => part === ".." || part === "")) return null;
  return path;
}

/**
 * Reads:
 *   <<<SUMMARY>>> text <<<END>>>
 *   <<<FILE path>>> complete new content <<<END>>>
 *   <<<DELETE path>>>
 * Code fences wrapped around a whole file body are removed.
 */
export function parseGeneratedChange(text: string): ParsedAnswer {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const problems: string[] = [];
  const edits: ProposedEdit[] = [];
  let summary = "";
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!.trim();
    const deletion = /^<<<DELETE\s+(.+?)\s*>>>$/.exec(line);
    if (deletion) {
      const path = safeEditPath(deletion[1]!);
      if (path) edits.push({ path, content: null });
      else problems.push(`Ignored a delete with an unsafe path: ${deletion[1]}`);
      index += 1;
      continue;
    }
    if (/^<<<SUMMARY>>>\s*$/.test(line)) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FILE_END.test(lines[index]!.trim()))
        body.push(lines[index++]!);
      summary = body.join("\n").trim();
      index += 1;
      continue;
    }
    const start = FILE_START.exec(line);
    if (start) {
      const path = safeEditPath(start[1]!);
      const body: string[] = [];
      index += 1;
      let closed = false;
      while (index < lines.length) {
        if (FILE_END.test(lines[index]!.trim())) {
          closed = true;
          break;
        }
        body.push(lines[index++]!);
      }
      index += 1;
      if (!path) {
        problems.push(`Ignored a file with an unsafe path: ${start[1]}`);
        continue;
      }
      if (!closed) {
        problems.push(`${path} was cut off before its end marker, so it was ignored.`);
        continue;
      }
      let content = body.join("\n");
      const fenced = /^```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(content.trim());
      if (fenced) content = fenced[1]!;
      edits.push({ path, content: content.endsWith("\n") ? content : `${content}\n` });
      continue;
    }
    index += 1;
  }
  const seen = new Set<string>();
  const unique = edits.filter((edit) => (seen.has(edit.path) ? false : seen.add(edit.path)));
  if (unique.length > MAX_EDIT_FILES)
    problems.push(
      `The answer changed ${unique.length} files; only the first ${MAX_EDIT_FILES} are kept.`,
    );
  return { summary, edits: unique.slice(0, MAX_EDIT_FILES), problems };
}

/** Words of a task, lowercased, without filler, for ranking file paths. */
function keywords(task: string) {
  return [
    ...new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !STOP.has(word)),
    ),
  ];
}
const STOP = new Set(
  "the and for with that this from into add make fix use new change update when should have not are was what how why can all any file files code function".split(
    " ",
  ),
);

/** Source files whose path or exports mention the task's words, best first. */
export function candidateFiles(analysis: RepoAnalysis, task: string, limit = 40) {
  const words = keywords(task);
  if (!words.length) return [];
  return analysis.files
    .filter((file) => file.role !== "generated")
    .map((file) => {
      const path = file.path.toLowerCase();
      const names = [...file.exports, ...file.functions].join(" ").toLowerCase();
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

export const PICK_SYSTEM =
  "You choose which source files of a repository must be read to carry out a change. Answer with file paths only, one per line, no commentary.";

export function pickPrompt(task: string, candidates: string[], architecture: string) {
  return [
    `Task: ${task}`,
    "",
    "Repository overview:",
    architecture,
    "",
    `Candidate files (pick at most ${MAX_FILES_READ}, only paths from this list):`,
    ...candidates,
  ].join("\n");
}

export function parsePicked(answer: string, allowed: Set<string>) {
  const picked: string[] = [];
  for (const line of answer.split("\n")) {
    const path = safeEditPath(line.replace(/^[-*\d.)\s]+/, ""));
    if (path && allowed.has(path) && !picked.includes(path)) picked.push(path);
  }
  return picked.slice(0, MAX_FILES_READ);
}

export const CHANGE_SYSTEM = [
  "You are Nykst, a careful senior engineer. You change code in an existing repository.",
  "You are given the task, the current content of the files to change, and evidence from a static analysis of the whole repository: who imports each file, which entry points and tests depend on it, notes the team recorded, and open findings.",
  "Rules: keep every existing export that other files import unless the task requires removing it, and then update every importer you were shown. Do not change a function's required parameters unless you also update its callers. Do not add a package that is not already a dependency. Never put secrets in code. Make the smallest change that fully does the task.",
  "Answer ONLY in this format, with nothing outside the blocks:",
  "<<<SUMMARY>>>\nWhat you changed and why, in 2-5 sentences, and anything you were unsure of.\n<<<END>>>",
  "Then, for each file you create or change, the COMPLETE new content of the file:",
  "<<<FILE path/relative/to/repo.ts>>>\n...entire file...\n<<<END>>>",
  "To delete a file write <<<DELETE path>>> on its own line. Do not use markdown fences.",
].join("\n");

export function changePrompt(input: {
  task: string;
  files: { path: string; content: string }[];
  briefing: string;
  memory: string;
  findings: string;
  repair?: string;
}) {
  const parts = [
    `Task: ${input.task}`,
    "",
    "Evidence from the repository analysis (JSON):",
    input.briefing,
  ];
  if (input.memory) parts.push("", "Notes the team recorded for these files:", input.memory);
  if (input.findings) parts.push("", "Open findings on these files:", input.findings);
  parts.push("", "Current files:");
  for (const file of input.files)
    parts.push(`<<<CURRENT ${file.path}>>>`, file.content, "<<<END>>>");
  if (input.repair)
    parts.push(
      "",
      "Your previous answer was checked against the repository and these problems were found. Fix them and answer again in the same format with the complete files:",
      input.repair,
    );
  return parts.join("\n");
}
