import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Clock3, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/subscribe")({
  head: () => ({ meta: [{ title: "Nykst Subscription — NPR 999" }] }),
  component: SubscribePage,
});

type SubscriptionState = {
  subscription?: { status: string };
  submission?: {
    status: string;
    transaction_reference: string;
    created_at: string;
    review_note?: string | null;
  } | null;
  amount_npr: number;
  display_name: string;
  instructions: string;
};

function SubscribePage() {
  const [data, setData] = useState<SubscriptionState | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/subscription");
    const body = await response.json();
    if (!response.ok) setError(body.error || "Connect GitHub before subscribing.");
    else {
      setData(body);
      setError("");
    }
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  const copyName = async () => {
    if (!data?.display_name || !navigator.clipboard) return;
    await navigator.clipboard.writeText(data.display_name);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transaction_reference: reference, payer_note: note }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not submit payment.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-6 py-4 backdrop-blur">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary size-2 rounded-full" />
          <span className="text-[13px] font-semibold uppercase tracking-[0.24em]">Nykst</span>
        </Link>
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
        >
          <ArrowLeft className="size-3.5" /> Back
        </Link>
      </header>
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <section>
          <p className="text-primary font-mono text-[10px] uppercase tracking-[0.28em]">
            One clear subscription
          </p>
          <h1 className="text-gradient mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Put Nykst above your software.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-relaxed">
            One payment. One access level. A persistent intelligence layer that helps you understand
            the consequences of change before you act.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="border-border bg-card/70 rounded-xl border p-4">
              <ShieldCheck className="text-primary size-4" />
              <p className="mt-3 text-xs font-semibold">Evidence first</p>
              <p className="text-muted-foreground mt-1 text-[11px]">Context before code.</p>
            </div>
            <div className="border-border bg-card/70 rounded-xl border p-4">
              <Clock3 className="text-primary size-4" />
              <p className="mt-3 text-xs font-semibold">Manual validation</p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Access activates after review.
              </p>
            </div>
            <div className="border-border bg-card/70 rounded-xl border p-4">
              <CheckCircle2 className="text-primary size-4" />
              <p className="mt-3 text-xs font-semibold">One-time payment</p>
              <p className="text-muted-foreground mt-1 text-[11px]">NPR 999, no plan maze.</p>
            </div>
          </div>
        </section>
        <section className="border-border bg-card/90 rounded-2xl border p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-[0.2em]">
                Nykst access
              </p>
              <h2 className="mt-2 text-2xl font-semibold">NPR 999</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                One payment for access activation.
              </p>
            </div>
            <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-[10px] font-mono">
              eSewa
            </span>
          </div>
          {loading ? (
            <p className="text-muted-foreground mt-8 text-sm">
              Preparing your payment instructions…
            </p>
          ) : error && !data ? (
            <div className="mt-6 space-y-4">
              <p className="border-red-500/30 bg-red-500/10 rounded-xl border px-4 py-3 text-sm text-red-300">
                {error}
              </p>
              <a
                href="/api/integrations/github/start"
                className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Connect GitHub to continue
              </a>
            </div>
          ) : data ? (
            <>
              <div className="border-border bg-surface mt-6 rounded-xl border p-4">
                <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-[0.18em]">
                  Send payment to
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{data.display_name}</p>
                  <button
                    onClick={() => void copyName()}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px]"
                  >
                    {copied ? (
                      <CheckCircle2 className="size-3.5 text-emerald-300" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                  {data.instructions}
                </p>
              </div>
              {data.subscription?.status === "active" || data.submission?.status === "approved" ? (
                <div className="border-emerald-500/30 bg-emerald-500/10 mt-4 rounded-xl border p-4">
                  <p className="text-sm font-semibold text-emerald-300">
                    Payment approved. Your subscription is active.
                  </p>
                </div>
              ) : data.submission?.status === "pending" ? (
                <div className="border-amber-500/30 bg-amber-500/10 mt-4 rounded-xl border p-4">
                  <p className="text-sm font-semibold text-amber-200">
                    Payment submitted for review.
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Reference: {data.submission.transaction_reference}
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <label className="text-muted-foreground block text-[10px] font-mono uppercase tracking-[0.18em]">
                    eSewa transaction reference
                  </label>
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="Enter the reference from your receipt"
                    className="border-border bg-surface w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-primary"
                    autoComplete="off"
                  />
                  <label className="text-muted-foreground block text-[10px] font-mono uppercase tracking-[0.18em]">
                    Optional note
                  </label>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Anything helpful for validation"
                    className="border-border bg-surface min-h-20 w-full resize-none rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => void submit()}
                    disabled={submitting || !reference.trim()}
                    className="bg-primary text-primary-foreground disabled:opacity-40 w-full rounded-xl px-4 py-3 text-sm font-semibold"
                  >
                    {submitting ? "Submitting…" : "I’ve paid — submit for validation"}
                  </button>
                </div>
              )}
              {error && data && <p className="mt-3 text-xs text-red-300">{error}</p>}
              <p className="text-muted-foreground mt-5 text-[10px] leading-relaxed">
                Payments are manually reviewed. Do not send passwords, OTPs, or account credentials.
                Keep your eSewa receipt until validation is complete.
              </p>
            </>
          ) : null}
          <a
            href="https://esewa.com.np"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-primary mt-4 inline-flex items-center gap-1 text-[11px]"
          >
            Open eSewa <ExternalLink className="size-3" />
          </a>
        </section>
      </div>
    </main>
  );
}
