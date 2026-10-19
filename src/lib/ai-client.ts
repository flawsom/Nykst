export type AskResult =
  { ok: true; answer: string; provider: string } | { ok: false; error: string; needsKey: boolean };

/** Calls Nykst AI using the signed-in user's own provider key (BYOK). */
export async function askNykstAi(
  prompt: string,
  context?: string,
  options?: { mode?: "navigator" | "code" },
): Promise<AskResult> {
  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, context: context ?? "", mode: options?.mode ?? "navigator" }),
    });
    const data = (await res.json()) as {
      answer?: string;
      provider?: string;
      error?: string;
      needsKey?: boolean;
    };
    if (!res.ok || !data.answer) {
      return {
        ok: false,
        error: data.error ?? "Nykst AI is unavailable right now.",
        needsKey: Boolean(data.needsKey) || res.status === 428,
      };
    }
    return { ok: true, answer: data.answer, provider: data.provider ?? "" };
  } catch {
    return { ok: false, error: "Network error while contacting Nykst AI.", needsKey: false };
  }
}

export type KeyStatus = {
  configured: boolean;
  provider: string | null;
  last4: string | null;
  platformDefault?: boolean;
  model?: string | null;
};

export async function fetchKeyStatus(): Promise<KeyStatus> {
  try {
    const res = await fetch("/api/ai/key");
    const data = (await res.json()) as KeyStatus;
    if (typeof data?.configured === "boolean") return data;
    return { configured: false, provider: null, last4: null };
  } catch {
    return { configured: false, provider: null, last4: null };
  }
}

/** Opens the API Settings dialog from anywhere in the app. */
export function openApiSettings() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("nykst:open-api-settings"));
}
