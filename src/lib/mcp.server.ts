import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAnalysisTool, str, TOOLS, type AnalysisSnapshot } from "@/lib/analysis/tools";
import type { RepoAnalysis, RepoHistory } from "@/lib/analysis/types";

/**
 * A stateless Model Context Protocol server (streamable HTTP, JSON responses) that
 * exposes the latest repository analysis to AI coding tools.
 */

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "nykst", title: "Nykst software graph", version: "0.1.0" };
const TOKEN_PREFIX = "nyk_";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAccessToken(user: { id: number; login: string }, label: string) {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const { data, error } = await supabaseAdmin
    .from("mcp_access_tokens")
    .insert({
      provider: "github",
      provider_user_id: String(user.id),
      provider_username: user.login,
      label: label.slice(0, 80) || "AI coding tool",
      token_hash: hashToken(token),
      token_prefix: token.slice(0, 10),
    })
    .select("id, label, token_prefix, created_at")
    .single();
  if (error) throw new Error(`Could not create access token: ${error.message}`);
  return { token, record: data };
}

export async function listAccessTokens(userId: number) {
  const { data, error } = await supabaseAdmin
    .from("mcp_access_tokens")
    .select("id, label, token_prefix, created_at, last_used_at")
    .eq("provider", "github")
    .eq("provider_user_id", String(userId))
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not list access tokens: ${error.message}`);
  return data ?? [];
}

export async function revokeAccessToken(userId: number, id: string) {
  const { error } = await supabaseAdmin
    .from("mcp_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("provider_user_id", String(userId));
  if (error) throw new Error(`Could not revoke access token: ${error.message}`);
}

async function userForToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const { data } = await supabaseAdmin
    .from("mcp_access_tokens")
    .select("id, provider_user_id, provider_username")
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  void supabaseAdmin
    .from("mcp_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined);
  return data;
}

export async function loadSnapshot(userId: string, repository?: string): Promise<AnalysisSnapshot> {
  let query = supabaseAdmin
    .from("repository_ingestions")
    .select("repository_full_name, created_at, payload")
    .eq("provider", "github")
    .eq("provider_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (repository) query = query.eq("repository_full_name", repository);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Could not load repository analysis: ${error.message}`);
  if (!data)
    throw new Error(
      repository
        ? `No analysis found for ${repository}. Connect it in Nykst first.`
        : "No repository has been analyzed yet. Connect one in Nykst first.",
    );
  const payload = (data.payload ?? {}) as { analysis?: RepoAnalysis; history?: RepoHistory };
  if (!payload.analysis?.files)
    throw new Error(
      `${data.repository_full_name} was ingested before code analysis existed. Press "Re-analyze" in Nykst.`,
    );
  return {
    repository_full_name: data.repository_full_name,
    created_at: data.created_at,
    analysis: payload.analysis,
    history: payload.history,
  };
}

async function listRepositories(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("repository_ingestions")
    .select("repository_full_name, created_at")
    .eq("provider", "github")
    .eq("provider_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not list repositories: ${error.message}`);
  const latest = new Map<string, string>();
  for (const row of data ?? [])
    if (!latest.has(row.repository_full_name)) latest.set(row.repository_full_name, row.created_at);
  return [...latest.entries()].map(([repository, analyzed_at]) => ({ repository, analyzed_at }));
}

/* --------------------------------- tools --------------------------------- */

async function callTool(userId: string, name: string, args: Record<string, unknown>) {
  if (name === "list_repositories") return { repositories: await listRepositories(userId) };
  const snapshot = await loadSnapshot(userId, str(args["repository"]) || undefined);
  return runAnalysisTool(snapshot, name, args);
}

/* ------------------------------ JSON-RPC layer ----------------------------- */

type RpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: RpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: RpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handleMessage(userId: string, message: RpcRequest) {
  const { id, method, params = {} } = message;
  if (!method) return rpcError(id, -32600, "Invalid request");
  if (id === undefined || id === null) return null; // notification: nothing to answer
  switch (method) {
    case "initialize": {
      const requested = str(params["protocolVersion"]);
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Nykst holds a compiler-based map of the user's repository. Before changing code, call get_impact with the files you plan to edit and check the listed dependents, entry points and tests. Use find_usages for database tables, external services and environment variables.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const name = str(params["name"]);
      const args = (params["arguments"] ?? {}) as Record<string, unknown>;
      try {
        const result = await callTool(userId, name, args);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 1) }],
          structuredContent: result,
          isError: Boolean((result as { error?: unknown }).error),
        });
      } catch (error) {
        return rpcResult(id, {
          content: [
            { type: "text", text: error instanceof Error ? error.message : "Tool failed." },
          ],
          isError: true,
        });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

/** Tells the user what is wrong with the token, since clients show this text as the error. */
function describeTokenProblem(request: Request) {
  const guide = `${new URL(request.url).origin}/mcp`;
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token)
    return {
      missing: true,
      message: `No Nykst access token was sent. Add the header "Authorization: Bearer nyk_…". Create a token at ${guide}`,
    };
  if (/YOUR_NYKST_TOKEN|<your-token>|TOKEN/i.test(token) && !token.startsWith(TOKEN_PREFIX))
    return {
      missing: false,
      message: `The token is still a placeholder. Replace it with a real token from ${guide}`,
    };
  if (!token.startsWith(TOKEN_PREFIX))
    return {
      missing: false,
      message: `That is not a Nykst token (they start with nyk_). Create one at ${guide}`,
    };
  return {
    missing: false,
    message: `This Nykst token was not recognized or has been revoked. Create a new one at ${guide}`,
  };
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === "GET" || request.method === "DELETE")
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  const user = await userForToken(request);
  if (!user) {
    const problem = describeTokenProblem(request);
    return Response.json(rpcError(null, -32001, problem.message), {
      status: 401,
      headers: {
        "www-authenticate": problem.missing
          ? 'Bearer realm="nykst"'
          : 'Bearer realm="nykst", error="invalid_token"',
      },
    });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }
  const messages = Array.isArray(body) ? (body as RpcRequest[]) : [body as RpcRequest];
  const responses = (
    await Promise.all(messages.map((message) => handleMessage(user.provider_user_id, message)))
  ).filter((response) => response !== null);
  if (!responses.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}
