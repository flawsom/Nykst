import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { githubToken, githubUser } from "@/lib/integrations/github";

export type AiProvider = "openai" | "anthropic" | "deepseek";

export const AI_PROVIDERS: { id: AiProvider; label: string; hint: string; model: string }[] = [
  { id: "openai", label: "OpenAI", hint: "sk-...", model: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", hint: "sk-ant-...", model: "claude-3-5-sonnet-latest" },
  { id: "deepseek", label: "DeepSeek", hint: "sk-...", model: "deepseek-chat" },
];

export function isAiProvider(value: unknown): value is AiProvider {
  return value === "openai" || value === "anthropic" || value === "deepseek";
}

function encryptionKey(): Buffer {
  const raw = process.env["NYKST_BYOK_SECRET"];
  if (!raw) throw new Error("Key storage is not configured.");
  // Derive a stable 32-byte key from the configured secret.
  return Buffer.from(raw.padEnd(32, "0").slice(0, 32), "utf8");
}

export function encryptKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Identity for BYOK storage: the connected GitHub account. */
export async function currentUserId(request: Request): Promise<string | null> {
  const token = githubToken(request);
  if (!token) return null;
  try {
    const user = await githubUser(token);
    return String(user.id);
  } catch {
    return null;
  }
}

export type StoredKey = { provider: AiProvider; last4: string; apiKey: string };

export async function loadUserKey(userId: string): Promise<StoredKey | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_ai_keys")
    .select("ai_provider, key_ciphertext, key_last4")
    .eq("auth_provider", "github")
    .eq("provider_user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  if (!isAiProvider(data.ai_provider)) return null;
  try {
    return {
      provider: data.ai_provider,
      last4: data.key_last4,
      apiKey: decryptKey(data.key_ciphertext),
    };
  } catch {
    return null;
  }
}

export async function saveUserKey(userId: string, provider: AiProvider, apiKey: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("user_ai_keys").upsert(
    {
      provider_user_id: userId,
      auth_provider: "github",
      ai_provider: provider,
      key_ciphertext: encryptKey(apiKey),
      key_last4: apiKey.slice(-4),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "auth_provider,provider_user_id" },
  );
  // Never surface raw provider errors that could echo the submitted value.
  if (error) throw new Error("Could not save your key. Please try again.");
}

export async function deleteUserKey(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("user_ai_keys")
    .delete()
    .eq("auth_provider", "github")
    .eq("provider_user_id", userId);
}

/* ---------------- provider calls ---------------- */

export class AiKeyError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function friendly(status: number): string {
  if (status === 401 || status === 403)
    return "Your API key was rejected by the provider. Update it in API Settings.";
  if (status === 429)
    return "Your provider account is rate limited or out of quota. Check your plan, then retry.";
  return "Your AI provider could not be reached right now. Please try again.";
}

/** Validate a key without storing it. Never echoes the key back. */
export async function testProviderKey(provider: AiProvider, apiKey: string): Promise<void> {
  let response: Response;
  try {
    if (provider === "anthropic") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
    } else {
      const base =
        provider === "deepseek" ? "https://api.deepseek.com/v1" : "https://api.openai.com/v1";
      response = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    }
  } catch {
    throw new AiKeyError("Could not reach the provider. Check your network and try again.", 502);
  }
  if (!response.ok) throw new AiKeyError(friendly(response.status), response.status);
}

/** Run a chat completion with the user's own provider + key. */
export async function chatWithUserKey(
  key: StoredKey,
  system: string,
  prompt: string,
): Promise<string> {
  const model = AI_PROVIDERS.find((p) => p.id === key.provider)!.model;
  let response: Response;
  try {
    if (key.provider === "anthropic") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 900,
          system,
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } else {
      const base =
        key.provider === "deepseek" ? "https://api.deepseek.com/v1" : "https://api.openai.com/v1";
      response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 900,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      });
    }
  } catch {
    throw new AiKeyError("Could not reach your AI provider. Please try again.", 502);
  }

  if (!response.ok) throw new AiKeyError(friendly(response.status), response.status);

  const data = (await response.json()) as Record<string, unknown>;
  if (key.provider === "anthropic") {
    const content = data["content"] as { text?: string }[] | undefined;
    return (
      content
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() || "No answer returned."
    );
  }
  const choices = data["choices"] as { message?: { content?: string } }[] | undefined;
  return choices?.[0]?.message?.content?.trim() || "No answer returned.";
}
