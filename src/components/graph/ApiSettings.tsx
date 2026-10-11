import { useEffect, useId, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2, X } from "lucide-react";
import { fetchKeyStatus, type KeyStatus } from "@/lib/ai-client";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/workspace/ui";

const PROVIDERS = [
  { id: "openai", label: "OpenAI", hint: "sk-...", model: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", hint: "sk-ant-...", model: "claude-3-5-haiku-latest" },
  { id: "gemini", label: "Google Gemini", hint: "AIza...", model: "gemini-3.5-flash-lite" },
  { id: "deepseek", label: "DeepSeek", hint: "sk-...", model: "deepseek-chat" },
  { id: "custom", label: "OpenRouter", hint: "sk-or-v1-...", model: "openrouter/free" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

export function ApiSettingsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<KeyStatus>({
    configured: false,
    provider: null,
    last4: null,
  });

  useEffect(() => {
    void fetchKeyStatus().then(setStatus);
    const handler = () => setOpen(true);
    window.addEventListener("nykst:open-api-settings", handler);
    return () => window.removeEventListener("nykst:open-api-settings", handler);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(buttonClass.secondary, "px-3", className)}
      >
        <KeyRound className="size-4" aria-hidden />
        Connect API
        <span
          className={cn("size-2 rounded-full", status.configured ? "bg-ok" : "bg-subtle")}
          role="img"
          aria-label={status.configured ? "Provider connected" : "No provider connected"}
        />
      </button>
      {open && (
        <ApiSettingsDialog status={status} onStatus={setStatus} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ApiSettingsDialog({
  status,
  onStatus,
  onClose,
}: {
  status: KeyStatus;
  onStatus: (s: KeyStatus) => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<ProviderId>((status.provider as ProviderId) ?? "openai");
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<"test" | "save" | "remove" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const selected = PROVIDERS.find((item) => item.id === provider)!;
  const connectedLabel =
    PROVIDERS.find((item) => item.id === status.provider)?.label ?? status.provider;

  useEffect(() => {
    setApiBaseUrl(provider === "custom" ? "https://openrouter.ai/api/v1" : "");
    setModel(selected.model);
    setAdvanced(false);
    setMessage(null);
  }, [provider, selected.model]);

  const run = async (kind: "test" | "save") => {
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fetch(kind === "test" ? "/api/ai/test" : "/api/ai/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, apiKey, apiBaseUrl, model }),
      });
      const data = (await res.json()) as { error?: string; last4?: string };
      if (!res.ok)
        setMessage({ tone: "error", text: data.error ?? "That key could not be verified." });
      else if (kind === "test")
        setMessage({ tone: "ok", text: "Connected successfully. The key works." });
      else {
        setMessage({
          tone: "ok",
          text: "Connected and saved securely. Nykst features can now use this provider.",
        });
        setApiKey("");
        onStatus({ configured: true, provider, last4: data.last4 ?? null });
      }
    } catch {
      setMessage({ tone: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    await fetch("/api/ai/key", { method: "DELETE" });
    onStatus({ configured: false, provider: null, last4: null });
    setMessage({ tone: "ok", text: "Connected provider removed." });
    setBusy(null);
  };

  const titleId = useId();
  const keyId = useId();
  const endpointId = useId();
  const modelId = useId();
  const inputClass =
    "border-input bg-surface text-foreground focus-visible:border-primary min-h-10 w-full rounded-lg border px-3 font-mono text-sm";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="border-border bg-card max-h-full w-full max-w-lg overflow-y-auto rounded-xl border p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Connect your own AI provider
            </h2>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Choose one provider. Nykst tests the key before saving it. Your key is encrypted and
              used only to run your requests.
            </p>
          </div>
          <button
            onClick={onClose}
            className={cn(buttonClass.ghost, "-mt-1 -mr-2 w-10 shrink-0 px-0")}
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {status.configured && (
          <div className="border-ok/30 bg-ok-soft mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <span className="text-ok flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4" aria-hidden /> {connectedLabel} connected · ends in{" "}
              {status.last4}
            </span>
            <button
              onClick={remove}
              disabled={busy !== null}
              className={cn(buttonClass.ghost, "px-2")}
            >
              <Trash2 className="size-4" aria-hidden /> Remove
            </button>
          </div>
        )}

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Provider</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PROVIDERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={provider === item.id}
                onClick={() => setProvider(item.id)}
                className={cn(
                  "min-h-10 rounded-lg border px-3 py-2 text-left transition-colors",
                  provider === item.id
                    ? "border-primary bg-surface-2"
                    : "border-border bg-surface hover:bg-surface-2",
                )}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="text-muted-foreground block truncate font-mono text-xs">
                  {item.model}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {provider === "custom" && (
          <div className="border-border bg-surface mt-4 rounded-lg border p-3">
            <p className="text-sm font-medium">OpenRouter: one key, many models</p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Paste your OpenRouter key below. Nykst uses the OpenRouter endpoint and its free
              router, so you do not need to remember any links or model names.
            </p>
            <button
              type="button"
              onClick={() => setAdvanced((value) => !value)}
              aria-expanded={advanced}
              className="text-primary mt-2 inline-flex min-h-10 items-center text-sm font-medium hover:underline"
            >
              {advanced ? "Hide advanced settings" : "Use another compatible provider"}
            </button>
            {advanced && (
              <div className="mt-2 grid gap-3">
                <div>
                  <label htmlFor={endpointId} className="mb-1.5 block text-sm font-medium">
                    Provider endpoint (HTTPS)
                  </label>
                  <input
                    id={endpointId}
                    value={apiBaseUrl}
                    onChange={(event) => setApiBaseUrl(event.target.value)}
                    placeholder="https://api.example.com/v1"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={modelId} className="mb-1.5 block text-sm font-medium">
                    Model name
                  </label>
                  <input
                    id={modelId}
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="provider-model"
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <label htmlFor={keyId} className="mb-1.5 block text-sm font-medium">
            {provider === "custom" ? "OpenRouter API key" : `${selected.label} API key`}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={keyId}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type={reveal ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={selected.hint}
              aria-describedby={message?.tone === "error" ? `${keyId}-msg` : undefined}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              className={cn(buttonClass.secondary, "w-10 shrink-0 px-0")}
              aria-label={reveal ? "Hide key" : "Show key"}
            >
              {reveal ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {message && (
          <p
            id={`${keyId}-msg`}
            role={message.tone === "error" ? "alert" : "status"}
            className={cn(
              "mt-3 rounded-lg border px-3 py-2 text-sm",
              message.tone === "ok"
                ? "border-ok/30 bg-ok-soft text-ok"
                : "border-danger/30 bg-danger-soft text-danger",
            )}
          >
            {message.text}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => run("test")}
            disabled={!apiKey || busy !== null}
            className={buttonClass.secondary}
          >
            {busy === "test" && <Loader2 className="size-4 animate-spin" aria-hidden />} Test
            connection
          </button>
          <button
            onClick={() => run("save")}
            disabled={!apiKey || busy !== null}
            className={buttonClass.primary}
          >
            {busy === "save" && <Loader2 className="size-4 animate-spin" aria-hidden />} Connect and
            save
          </button>
        </div>
      </div>
    </div>
  );
}
