/**
 * Normalizes the stored `repository_ingestions` rows into the workspace list the
 * repo switcher renders. One snapshot per repository, newest first, so switching
 * repositories never depends on which analysis happened to run last.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface IngestedWorkspace {
  repository: string;
  created_at: string;
  analyzedAt: string;
  status: string;
  branch: string | null;
  commit: string | null;
  commitSha: string | null;
  files: number;
  fileCount: number;
  sourceFiles: number;
  edges: number;
  edgeCount: number;
  cycles: number;
  cycleCount: number;
  ingestionId: string;
}

type IngestionRow = {
  id: string;
  repository_full_name: string;
  status: string;
  created_at: string;
  payload: unknown;
};

function read(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function toWorkspace(row: IngestionRow): IngestedWorkspace {
  const analysis = read(row.payload, "analysis");
  const repository = read(row.payload, "repository");
  const summary = read(row.payload, "summary");
  const branch = text(read(repository, "default_branch"));
  const commit = text(read(analysis, "ref"));
  const files = count(read(summary, "file_count"));
  const sourceFiles = count(read(read(analysis, "stats"), "analyzedFiles"));
  const edges = count(read(read(analysis, "stats"), "internalEdges"));
  const rawCycles = read(analysis, "cycles");
  const cycles = Array.isArray(rawCycles) ? rawCycles.length : 0;
  return {
    ingestionId: row.id,
    repository: row.repository_full_name,
    created_at: row.created_at,
    analyzedAt: row.created_at,
    status: row.status,
    branch,
    commit,
    commitSha: commit,
    files,
    fileCount: sourceFiles || files,
    sourceFiles,
    edges,
    edgeCount: edges,
    cycles,
    cycleCount: cycles,
  };
}

/** Latest snapshot for every repository this user has ingested, newest first. */
export async function listIngestedWorkspaces(userId: string): Promise<IngestedWorkspace[]> {
  const { data, error } = await supabaseAdmin
    .from("repository_ingestions")
    .select("id, repository_full_name, status, created_at, payload")
    .eq("provider", "github")
    .eq("provider_user_id", String(userId))
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not list repository workspaces: ${error.message}`);
  const seen = new Set<string>();
  const workspaces: IngestedWorkspace[] = [];
  for (const row of (data ?? []) as IngestionRow[]) {
    if (seen.has(row.repository_full_name)) continue;
    seen.add(row.repository_full_name);
    workspaces.push(toWorkspace(row));
  }
  return workspaces;
}

/** The newest snapshot for one repository (or specific snapshotId), or the newest of all when no repo is given. */
export async function latestIngestion(
  userId: string,
  repository?: string | null,
  snapshotId?: string | null,
) {
  let query = supabaseAdmin
    .from("repository_ingestions")
    .select("id, provider, provider_username, repository_full_name, status, payload, created_at")
    .eq("provider", "github")
    .eq("provider_user_id", String(userId));
  if (snapshotId) query = query.eq("id", snapshotId);
  else if (repository) query = query.eq("repository_full_name", repository);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load repository snapshot: ${error.message}`);
  return data;
}

/** The snapshot of one repository closest to a requested commit or branch. */
export async function ingestionForRef(userId: string, repository: string, ref?: string | null) {
  if (!ref) return latestIngestion(userId, repository);
  const { data, error } = await supabaseAdmin
    .from("repository_ingestions")
    .select("id, provider, provider_username, repository_full_name, status, payload, created_at")
    .eq("provider", "github")
    .eq("provider_user_id", String(userId))
    .eq("repository_full_name", repository)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Could not load repository snapshot: ${error.message}`);
  const rows = data ?? [];
  const match = rows.find((row) => {
    const analysis = read(row.payload, "analysis");
    const branch = read(read(row.payload, "repository"), "default_branch");
    return analysis && read(analysis, "ref") === ref ? true : branch === ref;
  });
  return match ?? rows[0] ?? null;
}
