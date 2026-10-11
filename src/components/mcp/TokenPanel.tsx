import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
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
    await fetch(`/api/mcp-tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  };

  if (status === "loading")
    return <p className="text-muted-foreground text-sm">Checking your GitHub connection…</p>;

  if (status === "signed-out")
    return (
      <div className="border-border bg-surface rounded-lg border p-4">
        <p className="text-sm">You're not signed in yet.</p>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Connect GitHub and map a repository first, then come back here to create your token.
        </p>
        <Link
          to="/"
          className="bg-primary text-primary-foreground mt-3 inline-flex min-h-10 items-center rounded-md px-4 text-sm font-semibold hover:opacity-90"
        >
          Connect GitHub
        </Link>
      </div>
    );

  if (status === "error")
    return (
      <p className="text-danger text-sm">
        {message || "Something went wrong."}{" "}
        <button className="inline-flex min-h-10 items-center underline" onClick={() => void load()}>
          Try again
        </button>
      </p>
    );

  return (
    <div className="space-y-3">
      {token ? (
        <div className="border-border bg-warn-soft rounded-lg border p-4">
          <p className="text-warn text-sm font-semibold">
            Your new token. Copy it now: Nykst can't show it again.
          </p>
          <div className="border-border bg-card mt-2 flex items-center justify-between gap-2 rounded-md border py-0.5 pr-1 pl-3">
            <code className="min-w-0 truncate font-mono text-sm">{token}</code>
            <CopyButton text={token} />
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            The setup snippets below now contain this token.
          </p>
        </div>
      ) : (
        <button
          onClick={() => void create()}
          disabled={busy}
          className="bg-primary text-primary-foreground inline-flex min-h-10 items-center rounded-md px-4 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Creating…" : tokens.length ? "Create another token" : "Create access token"}
        </button>
      )}
      {token && (
        <button
          onClick={() => void create()}
          disabled={busy}
          className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center text-sm underline disabled:opacity-60"
        >
          Create another token
        </button>
      )}
      {message && <p className="text-danger text-sm">{message}</p>}
      {tokens.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm font-semibold">Your active tokens</p>
          {tokens.map((item) => (
            <div
              key={item.id}
              className="border-border bg-card flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border py-1 pr-1 pl-3 text-sm"
            >
              <span className="font-mono">{item.token_prefix}…</span>
              <span className="text-muted-foreground text-xs">
                created {new Date(item.created_at).toLocaleDateString()}
                {item.last_used_at
                  ? ` · used ${new Date(item.last_used_at).toLocaleDateString()}`
                  : " · never used"}
              </span>
              <button
                onClick={() => void revoke(item.id)}
                aria-label={`Revoke token ${item.token_prefix}`}
                className="text-danger hover:bg-danger-soft inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
