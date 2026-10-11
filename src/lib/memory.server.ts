import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { noteApplies, type MemoryKind, type MemoryNote } from "@/lib/analysis/memory-match";
import type { Finding } from "@/lib/analysis/findings";

/**
 * Persistence for the two kinds of memory (see the migration 20261012100000): notes written
 * by people and agents, and the lifecycle of findings across analyses. Everything is scoped
 * to the GitHub user who owns the connection.
 */

const PROVIDER = "github";

/* ---------------------------------- notes ---------------------------------- */

export async function listMemory(userId: string, repository: string, targets?: string[]) {
  const { data, error } = await supabaseAdmin
    .from("repo_memory")
    .select("id, path, kind, body, source, author, commit_sha, created_at")
    .eq("provider", PROVIDER)
    .eq("provider_user_id", userId)
    .eq("repository_full_name", repository)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Could not read memory: ${error.message}`);
  const notes = (data ?? []) as MemoryNote[];
  return targets?.length ? notes.filter((note) => noteApplies(note.path, targets)) : notes;
}

export async function addMemory(
  userId: string,
  repository: string,
  note: {
    path: string;
    kind: MemoryKind;
    body: string;
    source: "user" | "agent";
    author?: string | null;
    commitSha?: string | null;
  },
) {
  const body = note.body.trim();
  if (!body) throw new Error("A note can't be empty.");
  if (body.length > 4000) throw new Error("A note can be at most 4000 characters.");
  const { data, error } = await supabaseAdmin
    .from("repo_memory")
    .insert({
      provider: PROVIDER,
      provider_user_id: userId,
      repository_full_name: repository,
      path: note.path,
      kind: note.kind,
      body,
      source: note.source,
      author: note.author ?? null,
      commit_sha: note.commitSha ?? null,
    })
    .select("id, path, kind, body, source, author, commit_sha, created_at")
    .single();
  if (error) throw new Error(`Could not save the note: ${error.message}`);
  return data as MemoryNote;
}

export async function deleteMemory(userId: string, id: string) {
  const { error } = await supabaseAdmin
    .from("repo_memory")
    .delete()
    .eq("id", id)
    .eq("provider", PROVIDER)
    .eq("provider_user_id", userId);
  if (error) throw new Error(`Could not delete the note: ${error.message}`);
}

/* --------------------------------- findings --------------------------------- */

export interface FindingState {
  signature: string;
  kind: string;
  severity: string;
  title: string;
  paths: string[];
  status: "open" | "resolved" | "dismissed";
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  resolved_commit: string | null;
  times_opened: number;
  dismissed_note: string | null;
}

const STATE_COLUMNS =
  "signature, kind, severity, title, paths, status, first_seen_at, last_seen_at, resolved_at, resolved_commit, times_opened, dismissed_note";

export async function listFindingStates(userId: string, repository: string) {
  const { data, error } = await supabaseAdmin
    .from("repo_findings")
    .select(STATE_COLUMNS)
    .eq("provider", PROVIDER)
    .eq("provider_user_id", userId)
    .eq("repository_full_name", repository)
    .limit(2000);
  if (error) throw new Error(`Could not read findings history: ${error.message}`);
  return (data ?? []) as FindingState[];
}

export interface SyncSummary {
  opened: number;
  resolved: number;
  reopened: number;
  stillOpen: number;
}

/**
 * Compares the findings of a fresh analysis with what was open before. A finding that is gone
 * becomes "resolved" (with the commit analyzed); one that returns after being resolved is
 * reopened and counted, so "this came back" is a fact rather than a guess.
 */
export async function syncFindings(
  userId: string,
  repository: string,
  findings: Finding[],
  commitSha: string,
): Promise<SyncSummary> {
  const existing = await listFindingStates(userId, repository);
  const bySignature = new Map(existing.map((row) => [row.signature, row]));
  const current = new Set(findings.map((finding) => finding.id));
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  const summary: SyncSummary = { opened: 0, resolved: 0, reopened: 0, stillOpen: 0 };

  for (const finding of findings) {
    const row = bySignature.get(finding.id);
    const base = {
      provider: PROVIDER,
      provider_user_id: userId,
      repository_full_name: repository,
      signature: finding.id,
      kind: finding.kind,
      severity: finding.severity,
      title: finding.title.slice(0, 300),
      paths: finding.paths.slice(0, 50),
      last_seen_at: now,
    };
    if (!row) {
      rows.push({ ...base, status: "open", first_seen_at: now, times_opened: 1 });
      summary.opened += 1;
    } else if (row.status === "resolved") {
      rows.push({
        ...base,
        status: "open",
        first_seen_at: row.first_seen_at,
        times_opened: row.times_opened + 1,
        resolved_at: null,
        resolved_commit: null,
      });
      summary.reopened += 1;
    } else {
      rows.push({
        ...base,
        status: row.status,
        first_seen_at: row.first_seen_at,
        times_opened: row.times_opened,
        dismissed_note: row.dismissed_note,
      });
      if (row.status === "open") summary.stillOpen += 1;
    }
  }
  for (const row of existing) {
    if (current.has(row.signature) || row.status !== "open") continue;
    rows.push({
      provider: PROVIDER,
      provider_user_id: userId,
      repository_full_name: repository,
      signature: row.signature,
      kind: row.kind,
      severity: row.severity,
      title: row.title,
      paths: row.paths,
      status: "resolved",
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      times_opened: row.times_opened,
      resolved_at: now,
      resolved_commit: commitSha,
    });
    summary.resolved += 1;
  }

  for (let start = 0; start < rows.length; start += 400) {
    const { error } = await supabaseAdmin
      .from("repo_findings")
      .upsert(rows.slice(start, start + 400) as never, {
        onConflict: "provider,provider_user_id,repository_full_name,signature",
      });
    if (error) throw new Error(`Could not record findings: ${error.message}`);
  }
  return summary;
}

export async function dismissFinding(
  userId: string,
  repository: string,
  signature: string,
  note: string,
  dismissed: boolean,
) {
  const { error } = await supabaseAdmin
    .from("repo_findings")
    .update({
      status: dismissed ? "dismissed" : "open",
      dismissed_note: dismissed ? note.slice(0, 500) : null,
    })
    .eq("provider", PROVIDER)
    .eq("provider_user_id", userId)
    .eq("repository_full_name", repository)
    .eq("signature", signature);
  if (error) throw new Error(`Could not update the finding: ${error.message}`);
}
