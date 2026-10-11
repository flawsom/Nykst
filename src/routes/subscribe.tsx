import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Copy, Globe2, X } from "lucide-react";
import { Badge, ErrorNote, buttonClass } from "@/components/workspace/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/subscribe")({
  head: () => ({ meta: [{ title: "Nykst subscription — eSewa" }] }),
  component: SubscribePage,
});

type Plan = "monthly" | "annual";
type SubscriptionState = {
  subscription?: { status: string; plan?: Plan; active_until?: string | null };
  submission?: {
    status: string;
    plan?: Plan;
    amount_npr: number;
    transaction_reference: string;
    created_at: string;
    review_note?: string | null;
  } | null;
  plans: Record<Plan, { label: string; amountNpr: number; days: number }>;
  display_name: string;
  instructions: string;
  qr_url: string;
};

function SubscribePage() {
  const [data, setData] = useState<SubscriptionState | null>(null);
  const [plan, setPlan] = useState<Plan>("monthly");
  const [showPlans, setShowPlans] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/subscription", { credentials: "include" });
      const body = (await response.json()) as SubscriptionState & { error?: string };
      if (!response.ok) setError(body.error || "Connect GitHub before subscribing.");
      else {
        setData(body);
        if (body.subscription?.plan) setPlan(body.subscription.plan);
        else if (body.submission?.plan) setPlan(body.submission.plan);
        setError("");
      }
    } catch {
      setError("Subscription details are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
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
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, transaction_reference: reference, payer_note: note }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not submit payment.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit payment.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPlan = data?.plans?.[plan] ?? {
    label: plan === "monthly" ? "Monthly" : "Annual",
    amountNpr: plan === "monthly" ? 999 : 9999,
  };
  const active = data?.subscription?.status === "active" || data?.submission?.status === "approved";
  const pending = data?.submission?.status === "pending";

  const fieldClass =
    "border-input bg-surface text-foreground focus-visible:border-primary w-full rounded-lg border px-3 text-sm";

  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card sticky top-0 z-20 flex items-center justify-between gap-2 border-b px-4 py-2 sm:px-6">
        <Link to="/" className="flex min-h-10 items-center gap-2.5">
          <span className="bg-primary size-2 rounded-full" aria-hidden />
          <span className="text-base font-semibold">Nykst</span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.assign("/");
            }}
            className={buttonClass.ghost}
          >
            <ArrowLeft className="size-4" aria-hidden /> Back
          </button>
          <button
            onClick={() => window.location.assign("/")}
            className={cn(buttonClass.ghost, "w-10 px-0")}
            aria-label="Close pricing"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <section>
          <p className="text-primary text-sm font-medium">Nykst subscription</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Subscribe to Nykst
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl text-base leading-relaxed">
            Basic AI access and the first system-understanding moment stay free. A subscription is
            arranged personally and paid through eSewa, then reviewed by hand.
          </p>
          <ol className="mt-8 space-y-3 text-sm">
            {[
              "Choose a plan and pay with the eSewa QR code.",
              "Enter the transaction reference from your receipt.",
              "We check the payment manually and activate your subscription.",
            ].map((item, index) => (
              <li key={item} className="flex items-start gap-3">
                <span className="border-border bg-surface text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                  {index + 1}
                </span>
                <span className="pt-0.5">{item}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-border bg-card rounded-xl border p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold">Choose your plan</h2>
            <Badge tone="info">eSewa</Badge>
          </div>

          <div className="border-border bg-surface mt-5 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Globe2 className="text-primary size-4" aria-hidden />
              <p className="text-sm font-semibold">Nepal subscription</p>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Nepal subscriptions are handled through eSewa. The monthly plan is NPR 999.
            </p>
          </div>

          {loading ? (
            <p role="status" className="text-muted-foreground mt-8 text-sm">
              Preparing your payment instructions…
            </p>
          ) : error && !data ? (
            <div className="mt-6 space-y-4">
              <ErrorNote>{error}</ErrorNote>
              <a
                href="/api/integrations/github/start"
                className={cn(buttonClass.primary, "w-full")}
              >
                Connect GitHub to continue
              </a>
            </div>
          ) : data ? (
            <>
              {!showPlans ? (
                <button
                  onClick={() => setShowPlans(true)}
                  className={cn(buttonClass.primary, "mt-6 w-full")}
                >
                  See Nepal plans
                </button>
              ) : (
                <>
                  <div role="radiogroup" aria-label="Plan" className="mt-6 grid grid-cols-2 gap-2">
                    {(["monthly", "annual"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="radio"
                        aria-checked={plan === item}
                        onClick={() => setPlan(item)}
                        className={cn(
                          "min-h-10 rounded-lg border p-3 text-left transition-colors",
                          plan === item
                            ? "border-primary bg-surface-2"
                            : "border-border bg-surface hover:bg-surface-2",
                        )}
                      >
                        <span className="block text-sm font-semibold">
                          {item === "monthly" ? "Monthly" : "Annual"}
                        </span>
                        <span className="text-primary mt-1 block text-lg font-semibold">
                          NPR {item === "monthly" ? "999" : "9,999"}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="border-border bg-surface mt-5 rounded-lg border p-4">
                    <p className="text-sm font-medium">
                      Scan to pay NPR {selectedPlan.amountNpr.toLocaleString()}
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <div className="border-border rounded-lg border bg-white p-2">
                        <img
                          src={data.qr_url}
                          alt="eSewa payment QR code"
                          className="aspect-square w-full rounded object-contain"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{data.display_name}</p>
                          <button
                            onClick={() => void copyName()}
                            className={cn(buttonClass.ghost, "px-2")}
                          >
                            {copied ? (
                              <CheckCircle2 className="text-ok size-4" aria-hidden />
                            ) : (
                              <Copy className="size-4" aria-hidden />
                            )}
                            <span role="status">{copied ? "Copied" : "Copy name"}</span>
                          </button>
                        </div>
                        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                          {data.instructions}
                        </p>
                      </div>
                    </div>
                  </div>

                  {active ? (
                    <div className="border-ok/30 bg-ok-soft mt-4 rounded-lg border p-4">
                      <p className="text-ok text-sm font-semibold">
                        Payment approved. Your subscription is active.
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Plan: {data.subscription?.plan ?? data.submission?.plan ?? plan}.{" "}
                        {data.subscription?.active_until
                          ? `Active until ${new Date(data.subscription.active_until).toLocaleDateString()}.`
                          : ""}
                      </p>
                    </div>
                  ) : pending ? (
                    <div className="border-warn/30 bg-warn-soft mt-4 rounded-lg border p-4">
                      <p className="text-warn text-sm font-semibold">
                        Payment submitted for review.
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Reference:{" "}
                        <span className="font-mono">{data.submission?.transaction_reference}</span>
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      <div>
                        <label htmlFor="esewa-ref" className="mb-1.5 block text-sm font-medium">
                          eSewa transaction reference
                        </label>
                        <input
                          id="esewa-ref"
                          value={reference}
                          onChange={(event) => setReference(event.target.value)}
                          placeholder="Enter the reference from your receipt"
                          className={cn(fieldClass, "min-h-10")}
                          autoComplete="off"
                          aria-describedby={error ? "esewa-error" : undefined}
                          aria-invalid={error ? true : undefined}
                        />
                        {error && data && (
                          <p id="esewa-error" role="alert" className="text-danger mt-1.5 text-sm">
                            {error}
                          </p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="esewa-note" className="mb-1.5 block text-sm font-medium">
                          Note <span className="text-muted-foreground font-normal">(optional)</span>
                        </label>
                        <textarea
                          id="esewa-note"
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="Anything helpful for validation"
                          className={cn(fieldClass, "min-h-20 resize-none py-2.5")}
                        />
                      </div>
                      <button
                        onClick={() => void submit()}
                        disabled={submitting || !reference.trim()}
                        className={cn(buttonClass.primary, "w-full")}
                      >
                        {submitting ? "Submitting…" : "I’ve paid. Submit for validation"}
                      </button>
                    </div>
                  )}
                  {error && data && (active || pending) && (
                    <p role="alert" className="text-danger mt-3 text-sm">
                      {error}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
                    Payments are manually reviewed. Do not send passwords, OTPs, or account
                    credentials. Keep your eSewa receipt until validation is complete.
                  </p>
                </>
              )}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
