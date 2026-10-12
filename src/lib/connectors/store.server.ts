import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptKey, encryptKey } from "@/lib/byok.server";

export type ConnectorKind = "slack" | "jira";

export interface Connection {
  kind: ConnectorKind;
  provider_user_id: string;
  external_id: string;
  label: string;
  meta: Record<string, unknown>;
  secrets: Record<string, string>;
  expires_at: string | null;
}

// The table is newer than the generated Supabase types.
type Table = {
  select(columns: string): Table;
  upsert(
    row: unknown,
    options: { onConflict: string },
  ): Promise<{ error: { message: string } | null }>;
  delete(): Table;
  update(row: unknown): Table;
  eq(column: string, value: string): Table;
  maybeSingle(): Promise<{
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }>;
  then: Promise<{ error: { message: string } | null }>["then"];
};
const table = () =>
  (supabaseAdmin as unknown as { from(name: string): Table }).from("integration_connections");

const COLUMNS = "kind, provider_user_id, external_id, label, meta, secrets, expires_at";

function hydrate(row: Record<string, unknown>): Connection {
  return {
    kind: row["kind"] as ConnectorKind,
    provider_user_id: String(row["provider_user_id"]),
    external_id: String(row["external_id"]),
    label: String(row["label"] ?? ""),
    meta: (row["meta"] ?? {}) as Record<string, unknown>,
    secrets: JSON.parse(decryptKey(String(row["secrets"]))) as Record<string, string>,
    expires_at: (row["expires_at"] as string | null) ?? null,
  };
}

export async function saveConnection(
  userId: string,
  connection: {
    kind: ConnectorKind;
    externalId: string;
    label: string;
    meta?: Record<string, unknown>;
    secrets: Record<string, string>;
    expiresAt?: string | null;
  },
) {
  const { error } = await table().upsert(
    {
      provider: "github",
      provider_user_id: userId,
      kind: connection.kind,
      external_id: connection.externalId,
      label: connection.label,
      meta: connection.meta ?? {},
      secrets: encryptKey(JSON.stringify(connection.secrets)),
      expires_at: connection.expiresAt ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,provider_user_id,kind" },
  );
  if (error) throw new Error(`Could not save the connection: ${error.message}`);
}

export async function getConnection(userId: string, kind: ConnectorKind) {
  const { data, error } = await table()
    .select(COLUMNS)
    .eq("provider", "github")
    .eq("provider_user_id", userId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw new Error(`Could not read connections: ${error.message}`);
  return data ? hydrate(data) : null;
}

/** Who installed Nykst in this Slack workspace. */
export async function connectionByExternalId(kind: ConnectorKind, externalId: string) {
  const { data, error } = await table()
    .select(COLUMNS)
    .eq("kind", kind)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error(`Could not read connections: ${error.message}`);
  return data ? hydrate(data) : null;
}

export async function deleteConnection(userId: string, kind: ConnectorKind) {
  const result = await table()
    .delete()
    .eq("provider", "github")
    .eq("provider_user_id", userId)
    .eq("kind", kind);
  const error = (result as unknown as { error?: { message: string } | null }).error;
  if (error) throw new Error(`Could not disconnect: ${error.message}`);
}

/* ------------------------------ signed OAuth state ------------------------------ */

function stateKey() {
  const secret = process.env["NYKST_BYOK_SECRET"]?.trim();
  if (!secret) throw new Error("NYKST_BYOK_SECRET is not configured.");
  return secret;
}

/** Binds an OAuth round trip to the user who started it and to the connector. */
export function signState(userId: string, kind: ConnectorKind) {
  const value = `${userId}.${kind}.${Date.now()}.${randomBytes(12).toString("hex")}`;
  const digest = createHmac("sha256", stateKey()).update(value).digest("hex");
  return `${value}.${digest}`;
}

export function verifyState(state: string, kind: ConnectorKind) {
  const cut = state.lastIndexOf(".");
  if (cut <= 0) return null;
  const value = state.slice(0, cut);
  const received = state.slice(cut + 1);
  if (!/^[a-f0-9]{64}$/.test(received)) return null;
  const expected = createHmac("sha256", stateKey()).update(value).digest("hex");
  if (!timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"))) return null;
  const [userId, stateKind, issued] = value.split(".");
  if (!userId || stateKind !== kind) return null;
  const age = Date.now() - Number(issued);
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) return null;
  return userId;
}

/** What is configured on this server, so the UI can say so instead of failing. */
export function configured() {
  return {
    slack: Boolean(
      process.env["SLACK_CLIENT_ID"] &&
      process.env["SLACK_CLIENT_SECRET"] &&
      process.env["SLACK_SIGNING_SECRET"],
    ),
    jira: Boolean(process.env["JIRA_CLIENT_ID"] && process.env["JIRA_CLIENT_SECRET"]),
  };
}
