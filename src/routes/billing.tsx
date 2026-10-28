import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, LockKeyhole, ReceiptText, RefreshCw } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";

type SubscriptionState = {
  subscription?: {
    status?: string;
    plan?: "monthly" | "annual";
    active_until?: string | null;
  };
  submission?: {
    status: string;
    plan?: "monthly" | "annual";
    transaction_reference?: string;
    created_at?: string;
  } | null;
};

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing · Nykst" }] }),
  component: BillingPage,
});

/**
 * Billing reads only server state. Live invoices, refunds and retry actions are
 * not rendered until the Razorpay order and webhook flow is implemented and
 * verified in test mode; the page says so instead of showing fake receipts.
 */
function BillingPage() {
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/subscription", {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        setSignedOut(true);
        setState(null);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as SubscriptionState & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Billing is temporarily unavailable.");
      setSignedOut(false);
      setState(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Billing is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const subscription = state?.subscription;
  const submission = state?.submission;

  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Billing" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/subscribe" className="text-muted-foreground hover:text-foreground">
            Plans
          </Link>
          <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy and data
          </Link>
          <button
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.assign("/");
            }}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-lg px-2 py-1"
          >
            <ArrowLeft className="size-3.5" /> Back
          </button>
        </nav>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
          Billing and invoices
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Server state, not browser guesses.
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          A subscription becomes active only after the payment provider confirms it. No invoice,
          receipt or refund state is generated on this page.
        </p>

        <div className="border-amber-500/30 bg-amber-500/10 mt-6 flex items-start gap-2 rounded-xl border px-4 py-3">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-amber-200">Live billing is not enabled</p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
              Razorpay checkout, signature verification, the idempotent webhook, GST invoices and
              refunds are not live. The M2-09 gate needs credential rotation, real plan ids, tax
              confirmation and a passing test-mode suite first.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground mt-8 text-sm">Reading server billing state…</p>
        ) : error ? (
          <p className="border-red-500/30 bg-red-500/10 mt-8 rounded-xl border px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : signedOut ? (
          <section className="border-border bg-card/80 mt-8 rounded-2xl border p-5">
            <h2 className="text-sm font-semibold">No signed-in billing account</h2>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              Connect GitHub to see a server-side subscription record. Plan prices stay visible
              without signing in on the plans page.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="/api/integrations/github/start"
                className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-xs font-semibold"
              >
                Connect GitHub
              </a>
              <Link
                to="/subscribe"
                className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-4 py-2 text-xs font-semibold"
              >
                Compare plans
              </Link>
            </div>
          </section>
        ) : (
          <div className="mt-8 space-y-4">
            <section className="border-border bg-card/80 rounded-2xl border p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Subscription</h2>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="border-border bg-surface hover:bg-surface-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold"
                >
                  <RefreshCw className="size-3" /> Refresh from server
                </button>
              </div>
              {subscription ? (
                <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd className="mt-0.5 font-medium">
                      {subscription.plan ?? "No plan recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="mt-0.5 font-medium">{subscription.status ?? "Unknown"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Active until</dt>
                    <dd className="mt-0.5 font-medium">
                      {subscription.active_until
                        ? new Date(subscription.active_until).toLocaleDateString()
                        : "Not recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Next charge</dt>
                    <dd className="mt-0.5 font-medium">Not scheduled: checkout is off</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-muted-foreground mt-3 text-xs">
                  No subscription record was returned by the server.
                </p>
              )}
              {submission ? (
                <div className="border-border mt-4 border-t pt-3">
                  <p className="text-[11px] font-semibold">Legacy manual payment record</p>
                  <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                    Status: {submission.status}. Plan: {submission.plan ?? "not recorded"}. This is
                    retained as billing history only; it is not a current purchasable price.
                  </p>
                </div>
              ) : null}
            </section>

            <section className="border-border bg-card/80 rounded-2xl border p-5">
              <div className="flex items-center gap-2">
                <ReceiptText className="text-muted-foreground size-4" />
                <h2 className="text-sm font-semibold">Invoices and receipts</h2>
              </div>
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                No invoice is shown until the provider webhook and the GST invoice format are
                verified. When live, invoices will be generated from server payment data, not from a
                browser toggle.
              </p>
              <div className="text-muted-foreground mt-3 flex items-center gap-1.5 text-[10px]">
                <FileText className="size-3" /> Invoice format pending tax confirmation
              </div>
            </section>
          </div>
        )}

        <p className="text-muted-foreground mt-8 text-[10px] leading-relaxed">
          Refund windows: monthly 7 days and annual 14 days after the first charge. Weekly has no
          decided refund window (OD-15), so it is not on sale.
        </p>
      </div>
    </main>
  );
}
