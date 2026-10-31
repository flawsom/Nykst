import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { fetchKeyStatus, type KeyStatus } from "@/lib/ai-client";
import { cn } from "@/lib/utils";

/**
 * The AI service a visitor already pays for. The internal `model` value is sent
 * to the server as a default and is never rendered: a customer sees the service
 * they recognise and a plain description, not a version string or a key suffix.
 */
const PROVIDERS = [
  {
    id: "custom",
    label: "Another AI service",
    description: "Any service with an OpenAI compatible endpoint you control",
    hint: "Paste the key from your account",
    model: "",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Use your own OpenAI account",
    hint: "Paste the key from your account",
    model: "gpt-4o-mini",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Use your own Anthropic account",
    hint: "Paste the key from your account",
    model: "claude-haiku-5-5",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Use your own Google AI account",
    hint: "Paste the key from your account",
    model: "gemini-3.8-flash",
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    description: "Use your own Cloudflare account",
    hint: "Paste your Workers AI token",
    model: "@cf/qwen/qwen3.8-27b",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "Use your own DeepSeek account",
    hint: "Paste the key from your account",
    model: "deepseek-flash",
  },
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
        AI settings
        <span
          className={cn(
            "ml-1 size-1.5 rounded-full",
            status.configured ? "bg-brand-ivory/80" : "bg-subtle-foreground/50",
          )}
        />
      </button>
      {open &&
        (typeof document === "undefined"
          ? null
          : createPortal(
              <ApiSettingsDialog
                status={status}
                onStatus={setStatus}
                onClose={() => setOpen(false)}
              />,
              document.body,
            ))}
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
  const [cloudflareAccountId, setCloudflareAccountId] = useState("");
  const [model, setModel] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<"test" | "save" | "remove" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const selected = PROVIDERS.find((item) => item.id === provider)!;
  const connectedLabel =
    PROVIDERS.find((item) => item.id === status.provider)?.label ?? "An AI service";

  useEffect(() => {
    setApiBaseUrl("");
    setModel(selected.model);
    setAdvanced(provider === "custom");
    setMessage(null);
    setConfirmRemove(false);
  }, [provider, selected.model]);

  const run = async (kind: "test" | "save") => {
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fetch(kind === "test" ? "/api/ai/test" : "/api/ai/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          apiBaseUrl:
            provider === "cloudflare"
              ? `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId.trim()}/ai/v1`
              : apiBaseUrl,
          model,
        }),
      });
      const data = (await res.json()) as { error?: string; last4?: string };
      if (!res.ok)
        setMessage({ tone: "error", text: data.error ?? "That key could not be verified." });
      else if (kind === "test")
        setMessage({ tone: "ok", text: "Connected successfully. The key works." });
      else {
        setMessage({
          tone: "ok",
          text: "Connected and saved securely. Nykst features can now use this AI account.",
        });
        setApiKey("");
        onStatus({ configured: true, provider, last4: null });
      }
    } catch {
      setMessage({ tone: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setMessage(null);
    try {
      const response = await fetch("/api/ai/key", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove the key. Please try again.");
      onStatus({ configured: false, provider: null, last4: null });
      setMessage({ tone: "ok", text: "Key removed. Nykst no longer uses this AI account." });
      setConfirmRemove(false);
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Could not remove the key. Please try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI settings"
        onClick={(event) => event.stopPropagation()}
        className="border-border bg-card my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-primary text-[10px] font-mono tracking-[0.24em] uppercase">
              Use your own AI account
            </p>
            <h2 className="mt-1 text-lg font-semibold">AI settings</h2>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Use an AI account you already pay for. Nykst tests the key, then stores it encrypted
              on the server. Only the parts of a repository needed to answer a question are sent.
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
          <div className="border-primary/25 bg-primary/5 mt-4 rounded-xl border px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs">
                <ShieldCheck className="text-primary size-4" />{" "}
                {status.platformDefault
                  ? `Your AI answers use Nykst's shared account. Add your own account to use it instead.`
                  : `${connectedLabel} connected.`}
              </span>
              {!status.platformDefault && !confirmRemove && (
                <button
                  onClick={() => setConfirmRemove(true)}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px]"
                >
                  <Trash2 className="size-3.5" /> Remove
                </button>
              )}
            </div>
            {!status.platformDefault && confirmRemove && (
              <div className="border-border mt-3 border-t pt-2">
                <p className="text-[11px] leading-relaxed">
                  Remove this key? Nykst stops using this account immediately. Your key itself is
                  not changed at the AI service, so you can also revoke it there.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void remove()}
                    disabled={busy !== null}
                    className="rounded-lg bg-red-500/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                  >
                    {busy === "remove" ? "Removing" : "Yes, remove the key"}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(false)}
                    disabled={busy !== null}
                    className="border-border bg-surface rounded-lg border px-3 py-1.5 text-[11px] font-semibold"
                  >
                    Keep it
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-5">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Choose your AI service
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
                <span className="text-muted-foreground mt-0.5 block text-[10px] leading-snug">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {provider === "gemini" && (
          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
            Gemini offers a limited free tier. Google may use unpaid API input and output to improve
            its products; do not submit confidential code to it. Review regional and API terms
            before use.
          </p>
        )}
        {provider === "cloudflare" && (
          <div className="border-primary/20 bg-primary/5 mt-4 rounded-xl border px-3 py-3">
            <p className="text-xs font-medium">Cloudflare Workers AI</p>
            <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
              A shared 10,000 Neurons per day are included on the Workers Free plan. Limits and
              model availability can change. Standard inference is not used to train models; review
              Cloudflare's data terms and model licenses before sending code.
            </p>
            <label className="text-muted-foreground mt-3 block text-[11px] uppercase tracking-wide">
              Cloudflare account ID
              <input
                value={cloudflareAccountId}
                onChange={(event) => setCloudflareAccountId(event.target.value)}
                placeholder="Account ID"
                className="border-border bg-surface mt-2 w-full rounded-xl border px-3 py-2.5 font-mono text-xs outline-none focus:border-primary"
              />
            </label>
          </div>
        )}
        {provider === "custom" && (
          <div className="border-primary/20 bg-primary/5 mt-4 rounded-xl border px-3 py-3">
            <p className="text-xs font-medium">Another AI service</p>
            <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
              Enter the web address of the service you use. Nykst sends your question to that
              address only. The service must accept the standard chat format used by OpenAI
              compatible endpoints. If you do not know the address, choose a listed service instead.
            </p>
            <div className="mt-3 grid gap-3">
              <label className="text-muted-foreground text-[11px] tracking-wide uppercase">
                Web address of the service
                <input
                  value={apiBaseUrl}
                  onChange={(event) => setApiBaseUrl(event.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="border-border bg-surface focus:border-primary mt-2 w-full rounded-xl border px-3 py-2.5 font-mono text-xs outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => setAdvanced((value) => !value)}
                className="text-primary text-left text-[11px] font-medium hover:underline"
              >
                {advanced ? "Hide the exact version name" : "Set the exact version name"}
              </button>
              {advanced && (
                <label className="text-muted-foreground text-[11px] tracking-wide uppercase">
                  Version name, exactly as your service documents it
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="the name from your service's documentation"
                    className="border-border bg-surface focus:border-primary mt-2 w-full rounded-xl border px-3 py-2.5 font-mono text-xs outline-none"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            {provider === "cloudflare" ? "Your Workers AI token" : "Your key from that account"}
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
            disabled={
              !apiKey || busy !== null || (provider === "cloudflare" && !cloudflareAccountId.trim())
            }
            className="border-border hover:border-primary/40 flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium disabled:opacity-40"
          >
            {busy === "test" && <Loader2 className="size-3.5 animate-spin" />} Test connection
          </button>
          <button
            onClick={() => run("save")}
            disabled={
              !apiKey || busy !== null || (provider === "cloudflare" && !cloudflareAccountId.trim())
            }
            className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            {busy === "save" && <Loader2 className="size-3.5 animate-spin" />} Connect and save
          </button>
        </div>
      </div>
    </div>
  );
}
