import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type TokenRecord = {
  id: string;
  label: string;
  token_prefix: string;
  created_at: string;
  last_used_at?: string | null;
};

function CopyBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[11px] font-semibold">{title}</span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="text-primary text-[11px]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-background border-border overflow-x-auto rounded-lg border p-3 font-mono text-[11px] whitespace-pre-wrap break-all">
        {text}
      </pre>
    </div>
  );
}

/** Issues MCP access tokens so Claude Code, Cursor and others can query the analysis. */
export function ConnectAiTools({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;

  const load = () =>
    fetch("/api/mcp-tokens")
      .then(async (response) => {
        const payload = (await response.json()) as { tokens?: TokenRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Connect GitHub first.");
        setTokens(payload.tokens ?? []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load tokens."),
      );

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setError(null);
    void load();
  }, [open]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mcp-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "AI coding tool" }),
      });
      const payload = (await response.json()) as { token?: string; error?: string };
      if (!response.ok || !payload.token)
        throw new Error(payload.error ?? "Could not create a token.");
      setCreated(payload.token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a token.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    await fetch(`/api/mcp-tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  };

  const token = created ?? "<your-token>";
  const cursorConfig = JSON.stringify(
    { mcpServers: { nykst: { url: endpoint, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="border-border bg-card max-h-[90vh] max-w-2xl overflow-y-auto">
        <div className="space-y-5">
          <div>
            <p className="text-primary font-mono text-[10px] tracking-[0.24em] uppercase">
              Model Context Protocol
            </p>
            <h2 className="mt-1 text-lg font-semibold">Connect your AI coding tool</h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              Let Claude Code, Cursor or any MCP client ask Nykst what a change will break before it
              writes code. It gets read-only access to the analysis of repositories you have
              connected — never your GitHub token.
            </p>
          </div>

          <a href="/mcp" className="text-primary block text-xs font-semibold underline">
            Step-by-step setup guides for Claude Code, Cursor, VS Code, Codex and more →
          </a>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {created ? (
            <div className="space-y-4">
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
                Copy this token now. Nykst stores only a hash of it and cannot show it again.
              </p>
              <CopyBlock
                title="Claude Code"
                text={`claude mcp add --transport http nykst ${endpoint} --header "Authorization: Bearer ${token}"`}
              />
              <CopyBlock title="Cursor (.cursor/mcp.json)" text={cursorConfig} />
              <CopyBlock title="Token" text={token} />
            </div>
          ) : (
            <button
              onClick={create}
              disabled={busy}
              className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg border px-4 py-2 text-xs font-semibold disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create access token"}
            </button>
          )}

          <div className="space-y-2">
            <p className="text-muted-foreground text-[11px] font-semibold">
              Tools your assistant gets
            </p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs">
              <li>
                <span className="text-foreground font-mono">get_impact</span> — files, entry points
                and tests affected by changing given paths
              </li>
              <li>
                <span className="text-foreground font-mono">find_usages</span> — every line touching
                a table, external service or env var
              </li>
              <li>
                <span className="text-foreground font-mono">get_architecture</span> — areas,
                services, data, hotspots and cycles
              </li>
              <li>
                <span className="text-foreground font-mono">search_files</span>,{" "}
                <span className="text-foreground font-mono">list_repositories</span>
              </li>
            </ul>
          </div>

          {tokens.length > 0 && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-[11px] font-semibold">Active tokens</p>
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
                  <button onClick={() => void revoke(item.id)} className="text-[11px] text-red-400">
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
