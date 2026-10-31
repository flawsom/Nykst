import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, Lock } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { ContactForm } from "@/components/site/ContactForm";
import { formatInr, type CheckoutState, type PlanId } from "@/lib/pricing";
import { fetchWithTimeout, readableRequestError } from "@/lib/fetch-with-timeout";
import { canonicalUrl, shareMeta } from "@/lib/seo";

export const Route = createFileRoute("/subscribe")({
  head: () => ({
    meta: [
      { title: "Plans and access · Nykst" },
      {
        name: "description",
        content:
          "Choose Nykst Pro monthly or annual, start a 7-day trial, or talk to us about your team.",
      },
      ...shareMeta({
        title: "Plans and access · Nykst",
        description:
          "Choose Nykst Pro monthly or annual, start a 7-day trial, or talk to us about your team.",
        path: "/subscribe",
      }),
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/subscribe") }],
  }),
  component: PlansPage,
});

type PublicPlan = {
  id: PlanId;
  label: string;
  priceInr: number;
  period: "week" | "month" | "year";
  summary: string;
  refundCopy: string;
  checkout: CheckoutState;
};

type PublicPricing = {
  plans: PublicPlan[];
  anyPlanLive: boolean;
  trialDays: number;
  trialCopy: string;
  gstPercent: number;
  gstIncluded: boolean;
};

type Subscription = {
  status: string;
  plan: string;
  active_until: string | null;
  trial_ends_at?: string | null;
};

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = { open: () => void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let razorpayScript: Promise<void> | null = null;

function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout is unavailable."));
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScript) return razorpayScript;
  razorpayScript = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-nykst-razorpay="true"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => {
          razorpayScript = null;
          reject(new Error("Checkout could not load. Check your connection and try again."));
        },
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset["nykstRazorpay"] = "true";
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayScript = null;
      reject(new Error("Checkout could not load. Check your connection and try again."));
    };
    document.body.appendChild(script);
  });
  return razorpayScript;
}

function activeUntil(subscription: Subscription | null) {
  if (!subscription?.active_until) return null;
  const time = Date.parse(subscription.active_until);
  return Number.isFinite(time) && time > Date.now() ? subscription.active_until : null;
}

function periodLabel(period: PublicPlan["period"]) {
  return period === "month" ? "per month" : period === "year" ? "per year" : "per week";
}

function PlansPage() {
  const [pricing, setPricing] = useState<PublicPricing | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState<PlanId | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [plansResponse, subscriptionResponse] = await Promise.all([
      fetchWithTimeout("/api/plans", { cache: "no-store" }, 12_000),
      fetchWithTimeout("/api/subscription", { cache: "no-store" }, 12_000),
    ]);
    const plansBody = (await plansResponse.json().catch(() => null)) as PublicPricing | null;
    if (!plansResponse.ok || !plansBody) throw new Error("Could not load the plans.");
    setPricing(plansBody);

    if (subscriptionResponse.status === 401) {
      setSignedIn(false);
      setSubscription(null);
      return;
    }
    const subscriptionBody = (await subscriptionResponse.json().catch(() => null)) as {
      subscription?: Subscription;
    } | null;
    if (!subscriptionResponse.ok || !subscriptionBody?.subscription)
      throw new Error("Could not load your subscription.");
    setSignedIn(true);
    setSubscription(subscriptionBody.subscription);
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    setLoadError("");
    void load()
      .catch((error) => setLoadError(readableRequestError(error, "Could not load the plans.")))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    retry();
  }, [retry]);

  const startCheckout = async (plan: PublicPlan) => {
    if (checkoutBusy) return;
    setCheckoutBusy(plan.id);
    setCheckoutError("");
    setNotice("");
    try {
      const response = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: plan.id }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        key_id?: string;
        subscription_id?: string;
      };
      if (response.status === 401) {
        setSignedIn(false);
        throw new Error("Connect GitHub before starting a trial.");
      }
      if (!response.ok) {
        if (body.code === "authorized" || body.code === "active") {
          setNotice("Your subscription is already active. The status below has been refreshed.");
          await load();
          setCheckoutBusy(null);
          return;
        }
        throw new Error(body.error || "Could not start checkout.");
      }
      if (!body.key_id || !body.subscription_id)
        throw new Error("Checkout did not return a subscription.");

      await loadRazorpay();
      const RazorpayCheckout = window.Razorpay;
      if (!RazorpayCheckout) throw new Error("Checkout could not load. Try again.");
      let completed = false;
      const checkout = new RazorpayCheckout({
        key: body.key_id,
        subscription_id: body.subscription_id,
        name: "Nykst",
        description: `${plan.label} plan, ${pricing?.trialDays ?? 7}-day trial`,
        handler: async (result: RazorpayHandlerResponse) => {
          completed = true;
          try {
            const verify = await fetch("/api/billing/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                payment_id: result.razorpay_payment_id,
                subscription_id: body.subscription_id,
                signature: result.razorpay_signature,
              }),
            });
            const verified = (await verify.json().catch(() => ({}))) as { error?: string };
            if (!verify.ok) throw new Error(verified.error || "The payment could not be verified.");
            setNotice(
              `Your ${pricing?.trialDays ?? 7}-day trial is active. You will not be charged during the trial, and you can cancel before it ends.`,
            );
            await load();
          } catch (error) {
            setCheckoutError(
              error instanceof Error ? error.message : "The payment could not be verified.",
            );
          } finally {
            setCheckoutBusy(null);
          }
        },
        modal: {
          ondismiss: () => {
            if (!completed) {
              setCheckoutBusy(null);
              setCheckoutError("Checkout closed before the payment was authorized.");
            }
          },
        },
      });
      checkout.open();
    } catch (error) {
      setCheckoutBusy(null);
      setCheckoutError(error instanceof Error ? error.message : "Could not start checkout.");
    }
  };

  const currentUntil = activeUntil(subscription);
  const isActive = Boolean(currentUntil);
  const sellable = (pricing?.plans ?? []).filter(
    (plan) => plan.id === "monthly" || plan.id === "annual",
  );

  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Plans" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy
          </Link>
          <Link to="/docs" className="text-muted-foreground hover:text-foreground">
            Docs
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

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
            Plans and access
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Understand the code before you change it.
          </h1>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            Start a 7-day Nykst Pro trial on your own repository. Pick monthly or annual, authorize
            the trial with Razorpay, and cancel any time before day 8.
          </p>
        </div>

        {isActive && (
          <div className="mt-7 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <CheckCircle2 className="size-4" /> Nykst Pro is active
            </p>
            <p className="mt-1 text-xs text-emerald-100/80">
              Your {subscription?.plan} plan is active until{" "}
              {new Date(currentUntil!).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              .
            </p>
          </div>
        )}

        {notice && (
          <p
            role="status"
            className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200"
          >
            {notice}
          </p>
        )}
        {(checkoutError || loadError) && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200"
          >
            <p>{checkoutError || loadError}</p>
            {loadError && (
              <button
                type="button"
                onClick={retry}
                className="mt-2 inline-flex min-h-9 items-center gap-1.5 border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 hover:bg-amber-300/15"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="border-border bg-card/60 mt-8 rounded-2xl border border-dashed p-10 text-center">
            <Loader2 className="text-primary mx-auto size-5 animate-spin" />
            <p className="text-muted-foreground mt-3 text-xs">Loading plans.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {sellable.map((plan) => {
              const live = plan.checkout.state === "live";
              const busy = checkoutBusy === plan.id;
              return (
                <section
                  key={plan.id}
                  className="border-border bg-card/70 flex flex-col rounded-2xl border p-5 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-primary font-mono text-[10px] tracking-[0.22em] uppercase">
                        {plan.label}
                      </p>
                      <p className="mt-2 text-3xl font-semibold tracking-tight">
                        {formatInr(plan.priceInr)}
                        <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                          {periodLabel(plan.period)}
                        </span>
                      </p>
                    </div>
                    {plan.id === "annual" && (
                      <span className="border-primary/30 bg-primary/10 text-primary rounded-full border px-2.5 py-1 text-[10px] font-mono">
                        SAVE MORE
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-3 text-sm">{plan.summary}</p>
                  <ul className="mt-4 space-y-2 text-xs">
                    <li className="flex gap-2">
                      <CheckCircle2 className="text-primary mt-0.5 size-3.5 shrink-0" />
                      <span>{pricing?.trialCopy ?? "7-day free trial."}</span>
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="text-primary mt-0.5 size-3.5 shrink-0" />
                      <span>{plan.refundCopy}</span>
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="text-primary mt-0.5 size-3.5 shrink-0" />
                      <span>
                        Prices include {pricing?.gstPercent ?? 18}% GST. Nykst never sees your card
                        details.
                      </span>
                    </li>
                  </ul>
                  <div className="mt-5">
                    {isActive ? (
                      <p className="text-muted-foreground text-xs">
                        You already have an active plan. Manage it from the status above.
                      </p>
                    ) : !live ? (
                      <button
                        type="button"
                        disabled
                        className="bg-primary text-primary-foreground inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold opacity-50"
                      >
                        <CreditCard className="size-4" /> Checkout is not open yet
                      </button>
                    ) : signedIn === false ? (
                      <a
                        href="/api/integrations/github/start?returnTo=%2Fsubscribe"
                        className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
                      >
                        <Lock className="size-4" /> Connect GitHub to start
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void startCheckout(plan)}
                        className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CreditCard className="size-4" />
                        )}
                        {busy ? "Opening checkout" : "Start 7-day trial"}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <p className="text-muted-foreground mt-4 text-[11px] leading-relaxed">
          {pricing?.anyPlanLive
            ? "The trial is free for 7 days. Razorpay authorizes the payment method now and charges on day 8 unless you cancel. Card details are handled by Razorpay, not stored by Nykst."
            : pricing
              ? "Checkout is not open yet. Send a message below and we will tell you when access opens."
              : "The live checkout state is still loading. Reload this page before starting a trial."}
        </p>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-lg font-semibold">What access includes</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                "A map of every file and how it connects, built from your repository.",
                "A clear answer to what a change will affect, before you make it.",
                "History and decisions in one place, so the next person does not start from zero.",
                "Help getting your first repository connected, by a person, not a form reply.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
              Prefer to talk first? Tell us about your team and the repository you want to map. We
              will answer with a real plan, not a sales sequence.
            </p>
          </div>
          <ContactForm
            defaultTopic="Plans and access"
            intro="Tell us your name, the best email to reach you, and one sentence about your codebase."
          />
        </div>
      </div>
    </main>
  );
}
