import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, X } from "lucide-react";

export const Route = createFileRoute("/admin/payments")({ component: AdminPaymentsPage });

type Submission = {
  id: string;
  amount_npr: number;
  transaction_reference: string;
  payer_note?: string | null;
  created_at: string;
  nykst_subscriptions?: { provider_username?: string; provider_user_id?: string } | null;
};

function AdminPaymentsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  async function load() {
    const response = await fetch("/api/subscription/admin");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load payment reviews.");
    setSubmissions(body.submissions || []);
  }
  useEffect(() => {
    void load().catch((loadError) =>
      setError(loadError instanceof Error ? loadError.message : "Could not load payment reviews."),
    );
  }, []);

  async function review(id: string, decision: "approve" | "reject") {
    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/subscription/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submission_id: id, decision, note: note[id] || "" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not review payment.");
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review payment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-border bg-card/90 flex items-center justify-between border-b px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary size-2 rounded-full" />
          <span className="text-sm font-semibold uppercase tracking-[0.24em]">Nykst</span>
        </Link>
        <Link
          to="/subscribe"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
        >
          <ArrowLeft className="size-3.5" /> Subscription
        </Link>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-primary text-[10px] font-mono uppercase tracking-[0.24em]">
          Private review
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Payment validation</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Review the eSewa account directly, then approve only references you have verified.
        </p>
        {error && (
          <p className="border-red-500/30 bg-red-500/10 mt-5 rounded-xl border px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="mt-6 space-y-3">
          {submissions.length ? (
            submissions.map((submission) => (
              <section
                key={submission.id}
                className="border-border bg-card/80 rounded-2xl border p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {submission.nykst_subscriptions?.provider_username || "GitHub user"}
                    </p>
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      {submission.transaction_reference}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      NPR {submission.amount_npr} ·{" "}
                      {new Date(submission.created_at).toLocaleString()}
                    </p>
                    {submission.payer_note && (
                      <p className="text-muted-foreground mt-3 text-xs">
                        Note: {submission.payer_note}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-mono text-amber-200">
                    PENDING
                  </span>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={note[submission.id] || ""}
                    onChange={(event) =>
                      setNote((current) => ({ ...current, [submission.id]: event.target.value }))
                    }
                    placeholder="Optional review note"
                    className="border-border bg-surface flex-1 rounded-xl border px-3 py-2.5 text-xs outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => void review(submission.id, "reject")}
                    disabled={busy === submission.id}
                    className="border-red-500/30 text-red-300 hover:bg-red-500/10 inline-flex items-center justify-center gap-1 rounded-xl border px-4 py-2 text-xs font-semibold"
                  >
                    <X className="size-3.5" /> Reject
                  </button>
                  <button
                    onClick={() => void review(submission.id, "approve")}
                    disabled={busy === submission.id}
                    className="bg-primary text-primary-foreground inline-flex items-center justify-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold"
                  >
                    <Check className="size-3.5" /> Approve
                  </button>
                </div>
              </section>
            ))
          ) : (
            <div className="border-border bg-card/60 rounded-2xl border border-dashed p-10 text-center">
              <p className="text-sm font-medium">No pending payments.</p>
              <p className="text-muted-foreground mt-1 text-xs">
                New manual submissions will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
