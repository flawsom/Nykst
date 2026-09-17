import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { githubToken, githubUser } from "@/lib/integrations/github";

export type AiProvider = "openai" | "anthropic" | "gemini" | "deepseek" | "custom";

type ProviderDefinition = {
  id: AiProvider;
  label: string;
  hint: string;
  model: string;
  baseUrl?: string;
};

export const AI_PROVIDERS: ProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI",
    hint: "sk-...",
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
  },
  { id: "anthropic", label: "Anthropic", hint: "sk-ant-...", model: "claude-3-5-haiku-latest" },
  {
    id: "gemini",
    label: "Google Gemini",
    hint: "AIza...",
    model: "gemini-3.5-flash-lite",
    baseUrl: "https://generativelanguage.googleapis.com",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "sk-...",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
  },
  {
    id: "custom",
    label: "Custom / Kimi",
    hint: "Provider API key",
    model: "provider-model",
    baseUrl: "",
  },
];

export function isAiProvider(value: unknown): value is AiProvider {
  return AI_PROVIDERS.some((provider) => provider.id === value);
}

function encryptionKey(): Buffer {
  const raw = process.env["NYKST_BYOK_SECRET"];
  if (!raw) throw new Error("Key storage is not configured.");
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

export type StoredKey = {
  provider: AiProvider;
  last4: string;
  apiKey: string;
  apiBaseUrl: string | null;
  model: string;
};

export function platformGeminiKey(): StoredKey | null {
  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!apiKey) return null;
  return {
    provider: "gemini",
    last4: apiKey.slice(-4),
    apiKey,
    apiBaseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-3.5-flash-lite",
  };
}

function providerDefinition(provider: AiProvider) {
  return AI_PROVIDERS.find((item) => item.id === provider)!;
}

function safeBaseUrl(value: unknown, provider: AiProvider): string | null {
  const raw = typeof value === "string" ? value.trim().replace(/\/$/, "") : "";
  const defaultUrl = providerDefinition(provider).baseUrl ?? "";
  if (!raw) return defaultUrl || null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new AiKeyError("Enter a valid HTTPS provider endpoint.", 400);
  }
}

function safeModel(value: unknown, provider: AiProvider): string {
  const model = typeof value === "string" ? value.trim() : "";
  if (model.length > 120 || /[\r\n]/.test(model))
    throw new AiKeyError("Enter a valid model name.", 400);
  if (
    provider === "gemini" &&
    (!model ||
      model === "gemini-2.0-flash" ||
      model === "gemini-1.5-flash" ||
      model === "gemini-2.5-flash-lite")
  )
    return providerDefinition(provider).model;
  return model || providerDefinition(provider).model;
}

export async function loadUserKey(userId: string): Promise<StoredKey | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_ai_keys")
    .select("ai_provider, key_ciphertext, key_last4, api_base_url, model_name")
    .eq("auth_provider", "github")
    .eq("provider_user_id", userId)
    .maybeSingle();
  if (error || !data || !isAiProvider(data.ai_provider)) return null;
  try {
    return {
      provider: data.ai_provider,
      last4: data.key_last4,
      apiKey: decryptKey(data.key_ciphertext),
      apiBaseUrl: data.api_base_url ?? providerDefinition(data.ai_provider).baseUrl ?? null,
      model: safeModel(data.model_name, data.ai_provider),
    };
  } catch {
    return null;
  }
}

export async function saveUserKey(
  userId: string,
  provider: AiProvider,
  apiKey: string,
  apiBaseUrl?: unknown,
  model?: unknown,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const baseUrl = safeBaseUrl(apiBaseUrl, provider);
  const modelName = safeModel(model, provider);
  const { error } = await supabaseAdmin.from("user_ai_keys").upsert(
    {
      provider_user_id: userId,
      auth_provider: "github",
      ai_provider: provider,
      key_ciphertext: encryptKey(apiKey),
      key_last4: apiKey.slice(-4),
      api_base_url: baseUrl,
      model_name: modelName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "auth_provider,provider_user_id" },
  );
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

export class AiKeyError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function friendly(status: number, providerMessage?: string): string {
  if (status === 401 || status === 403)
    return "Your API key was rejected by the provider. Update it in Connect API.";
  if (status === 429)
    return "Your provider account is rate limited or out of quota. Check your plan, then retry.";
  if (status === 400 || status === 404)
    return (
      providerMessage ||
      "The provider rejected this model or request. Check the provider settings and try again."
    );
  return "Your AI provider could not be reached right now. Please try again.";
}

async function providerErrorMessage(response: Response) {
  try {
    const data = (await response.clone().json()) as {
      error?: { message?: string };
      message?: string;
    };
    return data.error?.message || data.message;
  } catch {
    return undefined;
  }
}

function openAiBase(key: { provider: AiProvider; apiBaseUrl: string | null }): string {
  return (
    key.apiBaseUrl ||
    (key.provider === "deepseek" ? "https://api.deepseek.com/v1" : "https://api.openai.com/v1")
  );
}

async function providerRequest(
  key: { provider: AiProvider; apiKey: string; apiBaseUrl: string | null; model: string },
  system: string,
  prompt: string,
) {
  if (key.provider === "anthropic") {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: key.model,
        max_tokens: 900,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  }
  if (key.provider === "gemini") {
    const endpoint = `${key.apiBaseUrl || "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(key.model)}:generateContent`;
    return fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });
  }
  return fetch(`${openAiBase(key)}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: key.model,
      max_tokens: 900,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
}

export async function testProviderKey(
  provider: AiProvider,
  apiKey: string,
  apiBaseUrl?: unknown,
  model?: unknown,
): Promise<void> {
  const baseUrl = safeBaseUrl(apiBaseUrl, provider);
  const modelName = safeModel(model, provider);
  let response: Response;
  try {
    if (provider === "gemini") {
      response = await fetch(
        `${baseUrl || "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }] }),
        },
      );
    } else if (provider === "anthropic") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
    } else {
      const base = baseUrl || "https://api.openai.com/v1";
      response = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    }
  } catch {
    throw new AiKeyError("Could not reach the provider. Check the endpoint and try again.", 502);
  }
  if (!response.ok)
    throw new AiKeyError(
      friendly(response.status, await providerErrorMessage(response)),
      response.status,
    );
}

export async function chatWithUserKey(
  key: StoredKey,
  system: string,
  prompt: string,
): Promise<string> {
  let response: Response;
  try {
    response = await providerRequest(key, system, prompt);
  } catch {
    throw new AiKeyError("Could not reach your AI provider. Please try again.", 502);
  }
  if (!response.ok)
    throw new AiKeyError(
      friendly(response.status, await providerErrorMessage(response)),
      response.status,
    );
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
  if (key.provider === "gemini") {
    const candidates = data["candidates"] as
      { content?: { parts?: { text?: string }[] } }[] | undefined;
    return (
      candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() || "No answer returned."
    );
  }
  const choices = data["choices"] as { message?: { content?: string } }[] | undefined;
  return choices?.[0]?.message?.content?.trim() || "No answer returned.";
}
