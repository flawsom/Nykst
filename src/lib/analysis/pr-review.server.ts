import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createIssueComment,
  githubPullRequestFiles,
  listIssueComments,
  updateIssueComment,
} from "@/lib/integrations/github";
import { computeDiffBlastRadius, formatBlastRadiusMarkdown } from "./diff";
import type { RepoAnalysis } from "./types";

/**
 * Posts or updates one deterministic blast-radius review comment.
 *
 * The bot is deliberately separate from OAuth: it only runs when
 * GITHUB_BOT_TOKEN is configured with `issues: write` (or `public_repo` for a
 * public repository). Without that token the webhook still records the signal
 * and reports that the comment was skipped.
 */

export const BLAST_RADIUS_MARKER = "<!-- nykst:blast-radius -->";

export interface PullRequestReviewInput {
  owner: string;
  repo: string;
  number: number;
}

export interface PullRequestReviewResult {
  status: "posted" | "updated" | "skipped";
  reason?: string;
  commentId?: number;
  commentUrl?: string;
  risk?: string;
  changedFiles?: number;
  dependents?: number;
  tests?: number;
}

export async function reviewPullRequest(
  input: PullRequestReviewInput,
): Promise<PullRequestReviewResult> {
  const token = process.env["GITHUB_BOT_TOKEN"]?.trim();
  if (!token)
    return {
      status: "skipped",
      reason: "GITHUB_BOT_TOKEN is not configured, so the blast-radius comment was not posted.",
    };

  const fullName = `${input.owner}/${input.repo}`;
  const { data, error } = await supabaseAdmin
    .from("repository_ingestions")
    .select("payload, created_at")
    .eq("provider", "github")
    .eq("repository_full_name", fullName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load the repository snapshot: ${error.message}`);
  if (!data)
    return {
      status: "skipped",
      reason: `${fullName} has no committed Nykst snapshot, so there is no graph to review against.`,
    };

  const payload = (data.payload ?? {}) as { analysis?: RepoAnalysis };
  if (!payload.analysis?.files?.length)
    return {
      status: "skipped",
      reason: `${fullName} has a snapshot without a compiled code graph. Re-analyze it in Nykst.`,
    };

  const files = await githubPullRequestFiles(token, input.owner, input.repo, input.number);
  if (!files.length)
    return { status: "skipped", reason: "GitHub reported no changed files for this pull request." };

  const changed = files.flatMap((file) =>
    file.previous_filename ? [file.filename, file.previous_filename] : [file.filename],
  );
  const report = computeDiffBlastRadius(payload.analysis, changed);
  const body = formatBlastRadiusMarkdown(report, {
    repository: fullName,
    pullNumber: input.number,
  });

  const comments = await listIssueComments(token, input.owner, input.repo, input.number);
  const existing = comments.find((comment) => comment.body.includes(BLAST_RADIUS_MARKER));
  const saved = existing
    ? await updateIssueComment(token, input.owner, input.repo, existing.id, body)
    : await createIssueComment(token, input.owner, input.repo, input.number, body);

  return {
    status: existing ? "updated" : "posted",
    commentId: saved.id,
    ...(saved.html_url ? { commentUrl: saved.html_url } : {}),
    risk: report.risk,
    changedFiles: report.known.length,
    dependents: report.impact.runtimeCount,
    tests: report.tests.length,
  };
}
