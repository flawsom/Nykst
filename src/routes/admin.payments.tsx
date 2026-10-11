import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, X } from "lucide-react";
import { Badge, EmptyState, ErrorNote, buttonClass } from "@/components/workspace/ui";
import { cn } from "@/lib/utils";

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
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card flex items-center justify-between gap-2 border-b px-4 py-2 sm:px-6">
        <Link to="/" className="flex min-h-10 items-center gap-2.5">
          <span className="bg-primary size-2 rounded-full" aria-hidden />
          <span className="text-base font-semibold">Nykst</span>
        </Link>
        <Link to="/subscribe" className={buttonClass.ghost}>
          <ArrowLeft className="size-4" aria-hidden /> Subscription
        </Link>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold sm:text-3xl">Payment validation</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Review the eSewa account directly, then approve only references you have verified.
        </p>
        {error && (
          <div className="mt-5">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        <div className="mt-6 space-y-3">
          {submissions.length ? (
            submissions.map((submission) => (
              <section
                key={submission.id}
                aria-label={`Payment ${submission.transaction_reference}`}
                className="border-border bg-card rounded-xl border p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {submission.nykst_subscriptions?.provider_username || "GitHub user"}
                    </p>
                    <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
                      {submission.transaction_reference}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      NPR {submission.amount_npr} ·{" "}
                      {new Date(submission.created_at).toLocaleString()}
                    </p>
                    {submission.payer_note && (
                      <p className="text-muted-foreground mt-3 text-sm">
                        Note: {submission.payer_note}
                      </p>
                    )}
                  </div>
                  <Badge tone="warn">Pending</Badge>
                </div>
                <div className="mt-4">
                  <label
                    htmlFor={`note-${submission.id}`}
                    className="mb-1.5 block text-sm font-medium"
                  >
                    Review note{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input
                    id={`note-${submission.id}`}
                    value={note[submission.id] || ""}
                    onChange={(event) =>
                      setNote((current) => ({ ...current, [submission.id]: event.target.value }))
                    }
                    className="border-input bg-surface text-foreground focus-visible:border-primary min-h-10 w-full rounded-lg border px-3 text-sm"
                  />
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    onClick={() => void review(submission.id, "reject")}
                    disabled={busy === submission.id}
                    className={cn(
                      buttonClass.secondary,
                      "border-danger/30 text-danger hover:bg-danger-soft",
                    )}
                  >
                    <X className="size-4" aria-hidden /> Reject
                  </button>
                  <button
                    onClick={() => void review(submission.id, "approve")}
                    disabled={busy === submission.id}
                    className={buttonClass.primary}
                  >
                    <Check className="size-4" aria-hidden /> Approve
                  </button>
                </div>
              </section>
            ))
          ) : (
            <EmptyState title="No pending payments.">
              New manual submissions will appear here.
            </EmptyState>
          )}
        </div>
      </div>
    </main>
  );
}
