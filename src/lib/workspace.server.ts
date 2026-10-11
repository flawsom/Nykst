import { chatWithUserKey, loadUserKey, platformGeminiKey, type StoredKey } from "@/lib/byok.server";
import { impactBriefing } from "@/lib/analysis/context";
import { computeFindings, findingsForPaths } from "@/lib/analysis/findings";
import {
  CHANGE_SYSTEM,
  MAX_FILE_CHARS,
  PICK_SYSTEM,
  candidateFiles,
  changePrompt,
  parseGeneratedChange,
  parsePicked,
  pickPrompt,
  safeEditPath,
} from "@/lib/analysis/generate";
import type { ProposedEdit, VerifyReport } from "@/lib/analysis/verify-types";
import { verifyChange } from "@/lib/analysis/verify.server";
import { unifiedDiff } from "@/lib/diff";
import { githubContent } from "@/lib/integrations/github";
import { listMemory } from "@/lib/memory.server";
import { loadSnapshot } from "@/lib/mcp.server";

export interface ChangeFile {
  path: string;
  status: "new" | "modified" | "deleted";
  before: string | null;
  after: string | null;
}

export interface ChangeResult {
  repository: string;
  summary: string;
  files: ChangeFile[];
  report: VerifyReport;
  /** one patch for the whole change, in the format `git apply` accepts */
  patch: string;
  /** paths the model was shown */
  read: string[];
  /** how many times the model had to repair its first answer */
  repairs: number;
  warnings: string[];
  provider: string;
}

export class ChangeError extends Error {
  constructor(
    message: string,
    public status = 400,
    public needsKey = false,
  ) {
    super(message);
  }
}

export async function aiKeyFor(userId: string): Promise<StoredKey> {
  const key = (await loadUserKey(userId)) ?? platformGeminiKey();
  if (!key)
    throw new ChangeError(
      "Add your AI provider key in API Settings to let Nykst write changes.",
      428,
      true,
    );
  return key;
}

/** Current content of a file at the analyzed commit, or null when it is missing or too big. */
async function readFile(token: string, owner: string, repo: string, path: string, ref: string) {
  try {
    const file = await githubContent(token, owner, repo, path, ref);
    if (file.type !== "file" || !file.content) return null;
    const text =
      file.encoding === "base64"
        ? Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8")
        : file.content;
    return text.length > MAX_FILE_CHARS ? null : text;
  } catch {
    return null;
  }
}

export async function toPatch(files: ChangeFile[]) {
  return files.map((file) => unifiedDiff(file.path, file.before, file.after)).join("");
}

/**
 * Writes a change for a task, then checks it against the repository analysis. If the check finds
 * errors the model gets one chance to repair them, so a report that comes back blocked is a
 * change that was tried twice and still breaks something.
 */
export async function generateChange(input: {
  userId: string;
  githubToken: string;
  repository: string;
  task: string;
  /** files to start from; the model picks them from the task when omitted */
  paths?: string[];
}): Promise<ChangeResult> {
  const task = input.task.trim();
  if (task.length < 8) throw new ChangeError("Describe the change in a sentence or two.");
  if (task.length > 4000) throw new ChangeError("Keep the task under 4000 characters.");
  const [owner, repo] = input.repository.split("/");
  if (!owner || !repo) throw new ChangeError("Pick a repository first.");

  const snapshot = await loadSnapshot(input.userId, input.repository).catch((error: Error) => {
    throw new ChangeError(error.message, 404);
  });
  const { analysis, history } = snapshot;
  const known = new Set(analysis.files.map((file) => file.path));
  const key = await aiKeyFor(input.userId);
  const warnings: string[] = [];

  let chosen = (input.paths ?? [])
    .map((path) => safeEditPath(path) ?? "")
    .filter((p) => known.has(p));
  if (!chosen.length) {
    const candidates = candidateFiles(analysis, task);
    if (candidates.length) {
      const answer = await chatWithUserKey(
        key,
        PICK_SYSTEM,
        pickPrompt(
          task,
          candidates,
          `${analysis.files.length} source files; services: ${analysis.services.map((s) => s.name).join(", ") || "none"}`,
        ),
      );
      chosen = parsePicked(answer, new Set(candidates));
    }
    if (!chosen.length) chosen = candidates.slice(0, 3);
  }
  if (!chosen.length)
    throw new ChangeError(
      "Nykst could not tell which files this touches. Name a file or function in the task, or pick a file first.",
    );

  const current = new Map<string, string>();
  for (const path of chosen) {
    const text = await readFile(input.githubToken, owner, repo, path, analysis.ref);
    if (text === null)
      warnings.push(`${path} could not be read (too large or not found), so it was left out.`);
    else current.set(path, text);
  }
  if (!current.size)
    throw new ChangeError(
      "None of the relevant files could be read from GitHub. Check that the Nykst GitHub App can read this repository.",
      502,
    );

  const paths = [...current.keys()];
  const briefing = JSON.stringify(impactBriefing(analysis, history, paths, { maxItems: 25 }));
  const notes = await listMemory(input.userId, input.repository, paths).catch(() => []);
  const memory = notes
    .slice(0, 12)
    .map((note) => `- [${note.kind}] ${note.path || "repository"}: ${note.body}`)
    .join("\n");
  const findings = findingsForPaths(computeFindings(analysis, history), paths)
    .slice(0, 10)
    .map((finding) => `- ${finding.severity}: ${finding.title} (${finding.paths.join(", ")})`)
    .join("\n");

  const files = [...current].map(([path, content]) => ({ path, content }));
  let repair: string | undefined;
  let repairs = 0;
  let parsed = { summary: "", edits: [] as ProposedEdit[], problems: [] as string[] };
  let report: VerifyReport | null = null;

  for (let round = 0; round < 2; round += 1) {
    const answer = await chatWithUserKey(
      key,
      CHANGE_SYSTEM,
      changePrompt({
        task,
        files,
        briefing,
        memory,
        findings,
        ...(repair ? { repair } : {}),
      }),
    );
    parsed = parseGeneratedChange(answer);
    // Only files the model was shown can be rewritten; a blind rewrite would produce a wrong diff.
    const blind = parsed.edits.filter((edit) => known.has(edit.path) && !current.has(edit.path));
    if (blind.length) {
      warnings.push(
        `Ignored changes to ${blind.map((edit) => edit.path).join(", ")}: the model was not shown ${blind.length === 1 ? "that file" : "those files"}.`,
      );
      parsed.edits = parsed.edits.filter((edit) => !blind.includes(edit));
    }
    if (!parsed.edits.length) {
      repair = "Your answer contained no <<<FILE …>>> blocks. Answer in the required format.";
      if (round === 0) repairs = 1;
      continue;
    }
    report = await verifyChange(analysis, parsed.edits);
    const errors = report.issues.filter((issue) => issue.severity === "error");
    if (!errors.length) break;
    if (round === 0) repairs = 1;
    repair = errors
      .slice(0, 12)
      .map((issue) => `- ${issue.path}${issue.line ? `:${issue.line}` : ""} ${issue.message}`)
      .join("\n");
  }
  if (!parsed.edits.length || !report)
    throw new ChangeError(
      "The model did not return a usable change. Try rephrasing the task.",
      502,
    );

  const result: ChangeFile[] = parsed.edits.map((edit) => {
    const before = current.get(edit.path) ?? null;
    return {
      path: edit.path,
      status: edit.content === null ? "deleted" : before === null ? "new" : "modified",
      before,
      after: edit.content,
    };
  });
  return {
    repository: input.repository,
    summary: parsed.summary || "No summary was given.",
    files: result,
    report,
    patch: await toPatch(result),
    read: paths,
    repairs,
    warnings: [...warnings, ...parsed.problems],
    provider: key.provider,
  };
}
