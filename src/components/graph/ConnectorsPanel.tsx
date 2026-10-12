import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type Status = {
  configured: { slack: boolean; jira: boolean };
  slack: { label: string; channel: string } | null;
  jira: { label: string; url: string } | null;
};
type Issue = { key: string; summary: string; status: string };
type Analysis = { key: string; summary: string; lines: string[]; commented: boolean };

const button =
  "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg border px-4 py-2 text-xs font-semibold disabled:opacity-60";
const quiet =
  "border-border bg-surface text-foreground hover:bg-surface-2 rounded-lg border px-4 py-2 text-xs font-semibold disabled:opacity-60";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error ?? "Something went wrong. Please try again.");
  return body as T;
}

/**
 * Slack and Jira connections. Slack: Nykst answers "/nykst impact <file>" in a channel and can
 * post an impact report. Jira: analyze a ticket against the repository and comment the result
 * on the ticket. Everything shown comes from the real repository analysis.
 */
export function ConnectorsPanel({
  open,
  onClose,
  message,
}: {
  open: boolean;
  onClose: () => void;
  message?: string | null;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [ticket, setTicket] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/integrations/connectors"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load connections.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const failed = Boolean(message && /failed/i.test(message));
    setError(failed ? message! : null);
    setNotice(!failed && message ? message : null);
    void load();
  }, [open, load, message]);

  useEffect(() => {
    if (!open || !status?.jira) return;
    api<{ issues: Issue[] }>("/api/integrations/jira/issues")
      .then((data) => setIssues(data.issues))
      .catch((err: Error) => setError(err.message));
  }, [open, status?.jira]);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = (kind: "slack" | "jira") =>
    run(`disconnect-${kind}`, async () => {
      await api(`/api/integrations/connectors?kind=${kind}`, { method: "DELETE" });
      if (kind === "jira") {
        setIssues(null);
        setAnalysis(null);
      }
      await load();
    });

  const post = () =>
    run("post", async () => {
      const result = await api<{ channel: string }>("/api/integrations/slack/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      setNotice(`Posted to ${result.channel || "your Slack channel"}.`);
    });

  const analyze = (key: string, comment: boolean) =>
    run(`jira-${comment ? "comment" : "analyze"}`, async () => {
      const result = await api<Analysis>("/api/integrations/jira/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, comment }),
      });
      setAnalysis(result);
      if (result.commented) setNotice(`Commented on ${result.key} in Jira.`);
    });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <div className="space-y-5">
          <div>
            <p className="text-primary font-mono text-[10px] tracking-[0.24em] uppercase">
              Connectors
            </p>
            <h2 className="mt-1 text-lg font-semibold">Work where your team already works</h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              Ask Nykst from Slack what a change will break, and let it analyze Jira tickets against
              your code and comment the result back.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-xs text-emerald-400">
              {notice}
            </p>
          )}
          {!status && !error && <p className="text-muted-foreground text-xs">Loading…</p>}

          {status && (
            <>
              <section className="border-border space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Slack</h3>
                    <p className="text-muted-foreground text-xs">
                      {status.slack
                        ? `Connected to ${status.slack.label}${status.slack.channel ? ` · posts to ${status.slack.channel}` : ""}`
                        : "Use /nykst in a channel and get impact reports posted for you."}
                    </p>
                  </div>
                  {status.slack ? (
                    <button
                      className={quiet}
                      disabled={busy !== null}
                      onClick={() => void disconnect("slack")}
                    >
                      Disconnect
                    </button>
                  ) : status.configured.slack ? (
                    <a className={button} href="/api/integrations/slack/start">
                      Connect Slack
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">Not set up on this server</span>
                  )}
                </div>
                {status.slack && (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs">
                      In Slack, try{" "}
                      <span className="text-foreground font-mono">
                        /nykst impact src/lib/auth.ts
                      </span>{" "}
                      or <span className="text-foreground font-mono">/nykst overview</span>. Or post
                      a report now:
                    </p>
                    <div className="flex gap-2">
                      <label className="sr-only" htmlFor="slack-query">
                        File, folder or description
                      </label>
                      <input
                        id="slack-query"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="File, folder or description"
                        className="border-border bg-surface min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs"
                      />
                      <button
                        className={button}
                        disabled={busy !== null || !query.trim()}
                        onClick={() => void post()}
                      >
                        {busy === "post" ? "Posting…" : "Post impact"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="border-border space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Jira</h3>
                    <p className="text-muted-foreground text-xs">
                      {status.jira
                        ? `Connected to ${status.jira.label}`
                        : "Analyze a ticket against your code and comment what it touches."}
                    </p>
                  </div>
                  {status.jira ? (
                    <button
                      className={quiet}
                      disabled={busy !== null}
                      onClick={() => void disconnect("jira")}
                    >
                      Disconnect
                    </button>
                  ) : status.configured.jira ? (
                    <a className={button} href="/api/integrations/jira/start">
                      Connect Jira
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">Not set up on this server</span>
                  )}
                </div>
                {status.jira && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <label className="sr-only" htmlFor="jira-ticket">
                        Ticket key
                      </label>
                      <input
                        id="jira-ticket"
                        value={ticket}
                        onChange={(event) => setTicket(event.target.value.toUpperCase())}
                        placeholder="Ticket key, e.g. ABC-123"
                        className="border-border bg-surface min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs"
                      />
                      <button
                        className={quiet}
                        disabled={busy !== null || !ticket.trim()}
                        onClick={() => void analyze(ticket.trim(), false)}
                      >
                        Analyze
                      </button>
                    </div>
                    {issues && issues.length > 0 && (
                      <ul className="border-border max-h-40 divide-y overflow-y-auto rounded-lg border text-xs">
                        {issues.map((issue) => (
                          <li key={issue.key}>
                            <button
                              className="hover:bg-surface-2 flex w-full items-center gap-2 px-3 py-2 text-left"
                              onClick={() => {
                                setTicket(issue.key);
                                void analyze(issue.key, false);
                              }}
                            >
                              <span className="text-primary font-mono">{issue.key}</span>
                              <span className="min-w-0 flex-1 truncate">{issue.summary}</span>
                              <span className="text-muted-foreground">{issue.status}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {issues && issues.length === 0 && (
                      <p className="text-muted-foreground text-xs">
                        No tickets were updated in the last 60 days.
                      </p>
                    )}
                    {analysis && (
                      <div className="bg-surface border-border space-y-2 rounded-lg border p-3">
                        <p className="text-xs font-semibold">
                          {analysis.key}: {analysis.summary}
                        </p>
                        {analysis.lines.map((line, index) => (
                          <p key={index} className="text-muted-foreground text-xs leading-relaxed">
                            {line}
                          </p>
                        ))}
                        {!analysis.commented && (
                          <button
                            className={button}
                            disabled={busy !== null}
                            onClick={() => void analyze(analysis.key, true)}
                          >
                            {busy === "jira-comment" ? "Commenting…" : "Comment this on the ticket"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
