import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { githubToken, githubUser } from "@/lib/integrations/github";

export type AiProvider = "openai" | "anthropic" | "gemini" | "deepseek" | "cloudflare" | "custom";

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
  { id: "anthropic", label: "Anthropic", hint: "sk-ant-...", model: "claude-haiku-5-5" },
  {
    id: "gemini",
    label: "Google Gemini",
    hint: "AIza...",
    model: "gemini-3.8-flash",
    baseUrl: "https://generativelanguage.googleapis.com",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "sk-...",
    model: "deepseek-flash",
    baseUrl: "https://api.deepseek.com/v1",
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    hint: "Workers AI API token",
    model: "@cf/qwen/qwen3.8-27b",
  },
  {
    id: "custom",
    label: "Nara / OpenRouter",
    hint: "Provider API key",
    model: "agnes-2.5-flash",
    baseUrl: "https://router.bynara.id/v1",
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
    model: "gemini-3.8-flash",
  };
}

/**
 * Platform router key (any OpenAI-compatible endpoint) so a first-time user can ask a
 * question before adding their own. Configuration lives in the host's secret store, never
 * in the client bundle: NYKST_AI_API_KEY, NYKST_AI_BASE_URL and NYKST_AI_MODEL.
 */
export function platformRouterKey(): StoredKey | null {
  const apiKey = process.env["NYKST_AI_API_KEY"]?.trim();
  if (!apiKey) return null;
  let apiBaseUrl: string | null;
  try {
    apiBaseUrl = safeBaseUrl(process.env["NYKST_AI_BASE_URL"], "custom");
  } catch {
    return null;
  }
  return {
    provider: "custom",
    last4: apiKey.slice(-4),
    apiKey,
    apiBaseUrl,
    model: safeModel(process.env["NYKST_AI_MODEL"]?.trim() || "agnes-2.5-flash", "custom"),
  };
}

/** The platform-provided key used when a user has not connected their own provider. */
export function platformKey(): StoredKey | null {
  return platformRouterKey() ?? platformGeminiKey();
}

function providerDefinition(provider: AiProvider) {
  return AI_PROVIDERS.find((item) => item.id === provider)!;
}

function safeBaseUrl(value: unknown, provider: AiProvider): string | null {
  const raw = typeof value === "string" ? value.trim().replace(/\/$/, "") : "";
  const defaultUrl = providerDefinition(provider).baseUrl ?? "";
  if (!raw) {
    if (provider === "cloudflare")
      throw new AiKeyError("Enter your Cloudflare Workers AI account endpoint.", 400);
    return defaultUrl || null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    if (
      provider === "cloudflare" &&
      (url.hostname !== "api.cloudflare.com" ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        url.hash ||
        !/^\/client\/v4\/accounts\/[a-zA-Z0-9]+\/ai\/v1\/?$/.test(url.pathname))
    )
      throw new Error("Invalid Cloudflare Workers AI endpoint");
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
  if (status === 402)
    return "Your AI provider account has no credit left. Top up the balance, then retry.";
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

function textFromCompatibleResponse(data: Record<string, unknown>): string {
  const choices = data["choices"] as
    { message?: { content?: unknown }; text?: unknown }[] | undefined;
  const content = choices?.[0]?.message?.content ?? choices?.[0]?.text;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content))
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part)
          return typeof part.text === "string" ? part.text : "";
        return "";
      })
      .join("")
      .trim();
  return "";
}

function openAiBase(key: { provider: AiProvider; apiBaseUrl: string | null }): string {
  return (
    key.apiBaseUrl ||
    (key.provider === "deepseek" ? "https://api.deepseek.com/v1" : "https://api.openai.com/v1")
  );
}

/**
 * Slow reasoning routers routinely take 30s+ for a full answer, and a grounded
 * code generation is longer still. A tight ceiling here turns a working provider
 * into a fake outage, so the budget is generous and the message names it.
 */
const PROVIDER_TIMEOUT_MS = 75_000;
const PROVIDER_TIMEOUT_SECONDS = Math.round(PROVIDER_TIMEOUT_MS / 1000);

async function providerRequest(
  key: { provider: AiProvider; apiKey: string; apiBaseUrl: string | null; model: string },
  system: string,
  prompt: string,
  maxTokens = 900,
) {
  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  if (key.provider === "anthropic") {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "x-api-key": key.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: key.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  }
  if (key.provider === "gemini") {
    const endpoint = `${key.apiBaseUrl || "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(key.model)}:generateContent`;
    return fetch(endpoint, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": key.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });
  }
  const baseUrl = openAiBase(key);
  const openRouterHeaders = baseUrl.includes("openrouter.ai")
    ? {
        "HTTP-Referer": "https://nykst.unifies.codes",
        "X-OpenRouter-Title": "Nykst",
      }
    : {};
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${key.apiKey}`,
      "content-type": "application/json",
      ...openRouterHeaders,
    },
    body: JSON.stringify({
      model: key.model,
      max_tokens: maxTokens,
      ...(new URL(baseUrl).hostname === "api.cloudflare.com" && key.model === "@cf/qwen/qwen3.8-27b"
        ? { reasoning_effort: "low" }
        : {}),
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
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }] }),
        },
      );
    } else if (provider === "anthropic") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
    } else if (provider === "cloudflare") {
      response = await providerRequest(
        { provider, apiKey, apiBaseUrl: baseUrl, model: modelName },
        "Reply briefly.",
        "Reply with OK.",
        512,
      );
    } else {
      const base = baseUrl || "https://api.openai.com/v1";
      response = await fetch(`${base}/models`, {
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    }
  } catch {
    throw new AiKeyError("Could not reach the provider. Check the endpoint and try again.", 502);
  }
  if (!response.ok)
    throw new AiKeyError(
      friendly(response.status, await providerErrorMessage(response)),
      response.status,
    );
  if (provider === "cloudflare") {
    const data = (await response.json()) as Record<string, unknown>;
    if (!textFromCompatibleResponse(data))
      throw new AiKeyError("The provider returned no text. Check the model and try again.", 502);
  }
}

export async function chatWithUserKey(
  key: StoredKey,
  system: string,
  prompt: string,
  options?: { maxTokens?: number },
): Promise<string> {
  let response: Response;
  try {
    response = await providerRequest(key, system, prompt, options?.maxTokens);
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
      throw new AiKeyError(
        `The AI provider did not answer within ${PROVIDER_TIMEOUT_SECONDS} seconds. Retry, or add your own provider key in API Settings.`,
        504,
      );
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
  return textFromCompatibleResponse(data) || "No answer returned.";
}
