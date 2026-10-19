import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { githubContent } from "@/lib/integrations/github";
import { patchRepositoryAnalysis, type ChangedFile } from "./patch.server";
import type { RepoAnalysis, RepoHistory } from "./types";

/**
 * Push webhook ingestion without a tarball.
 *
 * GitHub reports the added, modified and removed paths in the push payload. Only
 * those file contents are fetched (at the pushed commit), then the stored graph is
 * patched in place. A branch deletion, an oversized diff or an unknown repository
 * falls back to "needs full re-ingest" instead of inventing a snapshot.
 */

export interface PushIngestResult {
  status: "patched" | "skipped";
  reason?: string;
  repository?: string;
  from?: string;
  to?: string;
  changedFiles?: number;
  filesAfter?: number;
  durationMs?: number;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readRepositoryFile(
  token: string | null,
  owner: string,
  repo: string,
  path: string,
  ref: string,
) {
  if (token) {
    const file = await githubContent(token, owner, repo, path, ref);
    if (file.encoding === "base64" && file.content)
      return Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
    return file.content ?? null;
  }
  const response = await fetch(
    `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${path.split("/").map(encodeURIComponent).join("/")}`,
    { headers: { "user-agent": "nykst-software-intelligence" } },
  );
  if (!response.ok) return null;
  return response.text();
}

export async function ingestPushWebhook(
  payload: Record<string, unknown>,
): Promise<PushIngestResult> {
  const repository = record(payload["repository"]);
  const fullName = text(repository["full_name"]);
  const [owner, repo] = fullName.split("/");
  const after = text(payload["after"]);
  const before = text(payload["before"]);
  if (!owner || !repo || !after)
    return {
      status: "skipped",
      reason: "The push payload did not identify a repository and commit.",
    };
  if (/^0+$/.test(after))
    return {
      status: "skipped",
      reason: "The push deleted the branch, so there is no commit to patch.",
    };

  const { data, error } = await supabaseAdmin
    .from("repository_ingestions")
    .select("provider_user_id, provider_username, payload")
    .eq("provider", "github")
    .eq("repository_full_name", fullName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load the latest snapshot: ${error.message}`);
  if (!data)
    return {
      status: "skipped",
      reason: `${fullName} has no stored snapshot yet. Ingest it once in Nykst first.`,
    };

  const stored = (data.payload ?? {}) as { analysis?: RepoAnalysis; history?: RepoHistory };
  if (!stored.analysis?.files?.length)
    return {
      status: "skipped",
      reason: `${fullName} has a snapshot without a compiled graph. Re-analyze it in Nykst.`,
    };

  const added = new Set<string>();
  const modified = new Set<string>();
  const removed = new Set<string>();
  const commits = Array.isArray(payload["commits"]) ? payload["commits"] : [];
  for (const entry of commits) {
    const commit = record(entry);
    for (const key of ["added", "modified", "removed"] as const) {
      if (!Array.isArray(commit[key])) continue;
      for (const value of commit[key])
        if (typeof value === "string" && value)
          (key === "added" ? added : key === "modified" ? modified : removed).add(value);
    }
  }

  const paths = [...new Set([...added, ...modified, ...removed])].sort();
  if (!paths.length)
    return {
      status: "skipped",
      reason: "The push did not report any added, modified or removed paths.",
    };
  if (paths.length > 300)
    return {
      status: "skipped",
      reason: `The push touched ${paths.length} files. A full re-ingest is cheaper and safer than a 300+ file patch.`,
    };

  const token = process.env["GITHUB_BOT_TOKEN"]?.trim() || null;
  const changed: ChangedFile[] = [];
  const failures: string[] = [];
  for (const path of paths) {
    if (removed.has(path)) {
      changed.push({ path, content: null });
      continue;
    }
    try {
      const content = await readRepositoryFile(token, owner, repo, path, after);
      if (content === null) failures.push(path);
      else changed.push({ path, content });
    } catch {
      failures.push(path);
    }
  }
  if (!changed.length)
    return {
      status: "skipped",
      reason: `None of the changed files could be read${failures.length ? `: ${failures.slice(0, 5).join(", ")}` : ""}.`,
    };

  const patched = await patchRepositoryAnalysis(stored.analysis, changed);
  const { error: saveError } = await supabaseAdmin.from("repository_ingestions").insert({
    provider: "github",
    provider_user_id: data.provider_user_id,
    provider_username: data.provider_username,
    repository_full_name: fullName,
    status: "incremental",
    payload: {
      analysis: patched,
      history: stored.history,
      incremental: {
        from: before,
        to: after,
        changed_files: changed.map((file) => file.path),
        unreadable_files: failures,
        patched_at: new Date().toISOString(),
      },
    } as unknown as Json,
  });
  if (saveError) throw new Error(`Could not store the patched snapshot: ${saveError.message}`);

  return {
    status: "patched",
    repository: fullName,
    ...(before ? { from: before } : {}),
    to: after,
    changedFiles: changed.length,
    filesAfter: patched.files.length,
    durationMs: patched.stats.durationMs,
  };
}
