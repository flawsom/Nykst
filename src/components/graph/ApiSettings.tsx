import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { fetchKeyStatus, type KeyStatus } from "@/lib/ai-client";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  { id: "custom", label: "Nara / OpenRouter", hint: "nara_... or sk-or-...", model: "agnes-2.5-flash" },
  { id: "openai", label: "OpenAI", hint: "sk-...", model: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", hint: "sk-ant-...", model: "claude-haiku-5-5" },
  { id: "gemini", label: "Google Gemini", hint: "AIza...", model: "gemini-3.5-flash-lite" },
  { id: "deepseek", label: "DeepSeek", hint: "sk-...", model: "deepseek-flash" },
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
        className={cn(
          "border-border bg-surface hover:border-primary/40 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
          className,
        )}
      >
        <KeyRound className="size-3.5" />
        Connect API
        <span
          className={cn(
            "ml-1 size-1.5 rounded-full",
            status.configured ? "bg-primary glow-ring" : "bg-muted-foreground/50",
          )}
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
    setApiBaseUrl(provider === "custom" ? "https://router.bynara.id/v1" : "");
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="border-border bg-card w-full max-w-lg rounded-2xl border p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-primary text-[10px] font-mono tracking-[0.24em] uppercase">
              Bring your own provider
            </p>
            <h2 className="mt-1 text-lg font-semibold">Connect an API</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Choose one provider. Nykst tests the key before saving it encrypted on the server so
              Memory can use it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {status.configured && (
          <div className="border-primary/25 bg-primary/5 mt-4 flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
            <span className="flex items-center gap-2 text-xs">
              <ShieldCheck className="text-primary size-4" />{" "}
              {status.platformDefault
                ? `Nara Router (${status.model ?? "agnes-2.5-flash"}) active · platform key · ends in ${status.last4}`
                : `${connectedLabel} connected · ends in ${status.last4}`}
            </span>
            {!status.platformDefault && (
              <button
                onClick={remove}
                disabled={busy !== null}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px]"
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
            )}
          </div>
        )}

        <div className="mt-5">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Choose provider
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PROVIDERS.map((item) => (
              <button
                key={item.id}
                onClick={() => setProvider(item.id)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  provider === item.id
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-surface hover:border-primary/30",
                )}
              >
                <span className="block text-xs font-semibold">{item.label}</span>
                <span className="text-muted-foreground block font-mono text-[10px]">
                  {item.model}
                </span>
              </button>
            ))}
          </div>
        </div>

        {provider === "custom" && (
          <div className="border-primary/20 bg-primary/5 mt-4 rounded-xl border px-3 py-3">
            <p className="text-xs font-medium">Nara Router & OpenAI-compatible endpoints</p>
            <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
              Defaults to <code className="text-primary font-mono">https://router.bynara.id/v1</code>{" "}
              with <code className="text-primary font-mono">agnes-2.5-flash</code>. Expand advanced
              settings to switch to OpenRouter or any custom endpoint.
            </p>
            <button
              type="button"
              onClick={() => setAdvanced((value) => !value)}
              className="text-primary mt-2 text-[11px] font-medium hover:underline"
            >
              {advanced ? "Hide advanced settings" : "Configure endpoint or model"}
            </button>
            {advanced && (
              <div className="mt-3 grid gap-3">
                <label className="text-muted-foreground text-[11px] uppercase tracking-wide">
                  Provider endpoint (HTTPS)
                  <input
                    value={apiBaseUrl}
                    onChange={(event) => setApiBaseUrl(event.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="border-border bg-surface mt-2 w-full rounded-xl border px-3 py-2.5 font-mono text-xs outline-none focus:border-primary"
                  />
                </label>
                <label className="text-muted-foreground text-[11px] uppercase tracking-wide">
                  Model name
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="provider-model"
                    className="border-border bg-surface mt-2 w-full rounded-xl border px-3 py-2.5 font-mono text-xs outline-none focus:border-primary"
                  />
                </label>
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            {provider === "custom" ? "OpenRouter API key" : "API key"}
          </p>
          <div className="border-border bg-surface mt-2 flex items-center gap-2 rounded-xl border px-3">
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type={reveal ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={selected.hint}
              className="flex-1 bg-transparent py-2.5 font-mono text-sm outline-none"
            />
            <button
              onClick={() => setReveal((value) => !value)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={reveal ? "Hide key" : "Show key"}
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {message && (
          <p
            className={cn(
              "mt-3 text-xs",
              message.tone === "ok" ? "text-primary" : "text-destructive",
            )}
          >
            {message.text}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => run("test")}
            disabled={!apiKey || busy !== null}
            className="border-border hover:border-primary/40 flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium disabled:opacity-40"
          >
            {busy === "test" && <Loader2 className="size-3.5 animate-spin" />} Test connection
          </button>
          <button
            onClick={() => run("save")}
            disabled={!apiKey || busy !== null}
            className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            {busy === "save" && <Loader2 className="size-3.5 animate-spin" />} Connect and save
          </button>
        </div>
      </div>
    </div>
  );
}
