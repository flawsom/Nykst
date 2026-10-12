import { adfText, toAdf } from "./format";
import { getConnection, saveConnection, type Connection } from "./store.server";

const env = (name: string) => process.env[name]?.trim() ?? "";
const API = "https://api.atlassian.com";

export function jiraAuthorizeUrl(state: string, redirectUri: string) {
  const url = new URL("https://auth.atlassian.com/authorize");
  url.searchParams.set("audience", "api.atlassian.com");
  url.searchParams.set("client_id", env("JIRA_CLIENT_ID"));
  url.searchParams.set("scope", "read:jira-work write:jira-work offline_access");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env("JIRA_CLIENT_ID"),
      client_secret: env("JIRA_CLIENT_SECRET"),
      ...body,
    }),
  });
  const data = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  } | null;
  if (!response.ok || !data?.access_token)
    throw new Error(
      data?.error_description ?? "Atlassian did not accept the sign-in. Connect Jira again.",
    );
  return data as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function exchangeJiraCode(code: string, redirectUri: string) {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const response = await fetch(`${API}/oauth/token/accessible-resources`, {
    headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json" },
  });
  const sites = (await response.json().catch(() => [])) as {
    id: string;
    name: string;
    url: string;
  }[];
  const site = Array.isArray(sites) ? sites[0] : undefined;
  if (!site)
    throw new Error("No Jira site was shared with Nykst. Connect again and choose a site.");
  return { tokens, site };
}

/** A valid access token for the connection, refreshing (and saving) it when it is about to expire. */
async function accessToken(connection: Connection) {
  const expires = connection.expires_at ? Date.parse(connection.expires_at) : 0;
  if (expires - Date.now() > 60_000) return connection.secrets["accessToken"]!;
  const refresh = connection.secrets["refreshToken"];
  if (!refresh) throw new Error("The Jira connection expired. Connect Jira again.");
  const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  const secrets = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refresh,
  };
  await saveConnection(connection.provider_user_id, {
    kind: "jira",
    externalId: connection.external_id,
    label: connection.label,
    meta: connection.meta,
    secrets,
    expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
  });
  return secrets.accessToken;
}

async function jira<T>(userId: string, path: string, init?: RequestInit): Promise<T> {
  const connection = await getConnection(userId, "jira");
  if (!connection) throw new Error("Connect Jira first.");
  const token = await accessToken(connection);
  const response = await fetch(`${API}/ex/jira/${connection.external_id}/rest/api/3${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "Jira refused the request. Reconnect Jira and allow Nykst to read and comment.",
    );
  if (!response.ok) throw new Error(`Jira returned ${response.status}. Try again in a moment.`);
  return (await response.json().catch(() => ({}))) as T;
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
}

export async function recentIssues(userId: string): Promise<JiraIssue[]> {
  const data = await jira<{
    issues?: { key: string; fields?: { summary?: string; status?: { name?: string } } }[];
  }>(
    userId,
    `/search/jql?jql=${encodeURIComponent("updated >= -60d order by updated DESC")}&fields=summary,status&maxResults=25`,
  );
  return (data.issues ?? []).map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary ?? "",
    status: issue.fields?.status?.name ?? "",
  }));
}

export async function getIssue(userId: string, key: string) {
  const data = await jira<{ key: string; fields?: { summary?: string; description?: unknown } }>(
    userId,
    `/issue/${encodeURIComponent(key)}?fields=summary,description`,
  );
  return {
    key: data.key,
    summary: data.fields?.summary ?? "",
    description: adfText(data.fields?.description).trim(),
  };
}

export async function addComment(userId: string, key: string, lines: string[]) {
  await jira(userId, `/issue/${encodeURIComponent(key)}/comment`, {
    method: "POST",
    body: JSON.stringify({ body: toAdf(lines) }),
  });
}
