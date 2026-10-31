import { useCallback, useEffect, useState } from "react";
import { CopyButton } from "./CodeBlock";

type TokenRecord = {
  id: string;
  label: string;
  token_prefix: string;
  created_at: string;
  last_used_at?: string | null;
};

type Status = "loading" | "signed-out" | "ready" | "error";

type Props = {
  /** Called with the plain token right after it is created; it is never shown again. */
  onCreated: (token: string) => void;
  token: string | null;
};

/** Sign-in state, token creation and revoking, using the same API as the graph's dialog. */
export function TokenPanel({ onCreated, token }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  /** A success line for create and revoke, so no action ends without feedback. */
  const [notice, setNotice] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/mcp-tokens");
      if (response.status === 401) {
        setStatus("signed-out");
        return;
      }
      const payload = (await response.json()) as { tokens?: TokenRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load your tokens.");
      setTokens(payload.tokens ?? []);
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load your tokens.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setMessage("");
    setNotice("");
    try {
      const response = await fetch("/api/mcp-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "AI coding agent" }),
      });
      const payload = (await response.json()) as { token?: string; error?: string };
      if (!response.ok || !payload.token)
        throw new Error(payload.error ?? "Could not create a token.");
      onCreated(payload.token);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create a token.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setRevoking(true);
    setMessage("");
    setNotice("");
    try {
      const response = await fetch(`/api/mcp-tokens?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not delete that key. Please try again.");
      setNotice("Key deleted. Any AI tool using it can no longer read your map.");
      setConfirmRevoke(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete that key.");
    } finally {
      setRevoking(false);
    }
  };

  if (status === "loading")
    return <p className="text-muted-foreground text-sm">Checking your GitHub connection…</p>;

  if (status === "signed-out")
    return (
      <div className="border-border bg-surface rounded-xl border p-4">
        <p className="text-sm">You're not signed in yet.</p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Connect GitHub and map a repository first, then come back here to create your token.
        </p>
        <a
          href="/api/integrations/github/start?returnTo=%2Fmcp"
          className="bg-primary text-primary-foreground hover:bg-primary-glow mt-3 inline-block rounded-lg px-4 py-2 text-xs font-semibold"
        >
          Connect GitHub
        </a>
      </div>
    );

  if (status === "error")
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <p className="text-sm text-red-300">
          We could not load your keys. {message || "The connection failed."}
        </p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Your GitHub connection is separate from this key. Try again, or create a fresh key below.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => void load()}
            className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-xs font-semibold"
          >
            Try again
          </button>
          <button
            onClick={() => void create()}
            disabled={busy}
            className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create a new key"}
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-3">
      {token ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-amber-300">
            Your new token. Copy it now: Nykst can't show it again.
          </p>
          <div className="border-border bg-background mt-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <code className="min-w-0 truncate font-mono text-[12px]">{token}</code>
            <CopyButton text={token} />
          </div>
          <p className="text-muted-foreground mt-2 text-[11px]">
            The setup snippets below now contain this token.
          </p>
        </div>
      ) : (
        <button
          onClick={() => void create()}
          disabled={busy}
          className="bg-primary text-primary-foreground hover:bg-primary-glow rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-60"
        >
          {busy ? "Creating…" : tokens.length ? "Create another token" : "Create access token"}
        </button>
      )}
      {token && (
        <button
          onClick={() => void create()}
          disabled={busy}
          className="text-muted-foreground hover:text-foreground text-[11px] underline disabled:opacity-60"
        >
          Create another token
        </button>
      )}
      {message && (
        <p role="alert" className="text-xs text-red-400">
          {message}
        </p>
      )}
      {notice && (
        <p role="status" className="text-primary text-xs">
          {notice}
        </p>
      )}
      {tokens.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-[11px] font-semibold">Your active keys</p>
          {tokens.map((item) => (
            <div
              key={item.id}
              className="border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs"
            >
              <span className="font-mono">{item.token_prefix}…</span>
              <span className="text-muted-foreground text-[10px]">
                created {new Date(item.created_at).toLocaleDateString()}
                {item.last_used_at
                  ? ` · used ${new Date(item.last_used_at).toLocaleDateString()}`
                  : " · never used"}
              </span>
              {confirmRevoke === item.id ? (
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => void revoke(item.id)}
                    disabled={revoking}
                    className="rounded-md bg-red-500/90 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-60"
                  >
                    {revoking ? "Deleting" : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirmRevoke(null)}
                    disabled={revoking}
                    className="text-muted-foreground text-[10px] underline"
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => {
                    setConfirmRevoke(item.id);
                    setNotice("");
                  }}
                  className="text-[11px] text-red-400 hover:underline"
                >
                  Delete key
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
