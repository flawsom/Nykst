import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, RefreshCw } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";

export const Route = createFileRoute("/status")({
  head: () => ({ meta: [{ title: "Status · Nykst" }] }),
  component: StatusPage,
});

type Health = {
  status: "ok" | "degraded";
  configured: boolean;
  reachable: boolean;
  project: string | null;
  tables: Record<string, boolean>;
  missing: string[];
  error: string | null;
  checkedAt?: string;
};

const UNMEASURED = [
  {
    surface: "Graph ingest and index freshness",
    reason:
      "No independent probe is wired for ingest freshness yet. This page does not label it operational.",
  },
  {
    surface: "MCP tool execution",
    reason:
      "The MCP schema and sandbox are live, but there is no separate uptime probe for every tool. A 200 from the schema is not treated as uptime for execution.",
  },
  {
    surface: "Billing and Razorpay",
    reason:
      "Live checkout is gated and no charge is taken. Payment status will be reported from the provider when the live gate passes, not from a frontend badge.",
  },
  {
    surface: "DPDP dashboard and rights workflow",
    reason:
      "The transparency page is live. Consent records, rights requests, and deletion propagation are not enabled, so this surface is not labelled operational.",
  },
];

function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as Health | null;
      if (!body) throw new Error("The health probe did not return JSON.");
      setHealth(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The health probe is unavailable.");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tableCount = health ? Object.keys(health.tables).length : 0;
  const healthy = health?.status === "ok" && health.missing.length === 0;

  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Status" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/docs" className="text-muted-foreground hover:text-foreground">
            Docs
          </Link>
          <Link to="/limits" className="text-muted-foreground hover:text-foreground">
            Limits
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

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">Status</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Measured status, not a green badge.
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
          This page reports only what it can measure. Surfaces without a probe are labelled not
          measured, with the reason. An unmeasured surface is never shown as operational.
        </p>

        <section
          data-testid="status-health"
          className="border-border bg-card/70 mt-6 rounded-2xl border p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {healthy ? (
                <CheckCircle2 className="size-4 text-emerald-400" />
              ) : (
                <CircleAlert className="size-4 text-amber-300" />
              )}
              <h2 className="text-sm font-semibold">API and database readiness</h2>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="border-border bg-surface hover:bg-surface-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold"
            >
              <RefreshCw className={loading ? "size-3 animate-spin" : "size-3"} /> Refresh
            </button>
          </div>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
              {error}
            </p>
          ) : !health ? (
            <p className="text-muted-foreground mt-4 text-xs">Reading the health probe…</p>
          ) : (
            <>
              <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground text-[10px] uppercase tracking-wide">
                    Status
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold">{health.status}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[10px] uppercase tracking-wide">
                    Configured
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold">
                    {health.configured ? "yes" : "no"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[10px] uppercase tracking-wide">
                    Tables reachable
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold">
                    {tableCount - health.missing.length}/{tableCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[10px] uppercase tracking-wide">
                    Checked
                  </dt>
                  <dd className="mt-0.5 font-mono text-[11px]">
                    {health.checkedAt
                      ? new Date(health.checkedAt).toLocaleString()
                      : "not reported"}
                  </dd>
                </div>
              </dl>
              {health.missing.length > 0 ? (
                <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  Missing tables: {health.missing.join(", ")}. Apply the schema in the Supabase SQL
                  editor.
                </p>
              ) : null}
              {health.error ? (
                <p className="text-muted-foreground mt-3 text-[10px] leading-relaxed">
                  Probe detail: {health.error}
                </p>
              ) : null}
            </>
          )}
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2">
          {UNMEASURED.map((item) => (
            <div key={item.surface} className="border-border bg-surface/60 rounded-xl border p-4">
              <div className="flex items-center gap-2">
                <Clock3 className="text-muted-foreground size-3.5" />
                <h2 className="text-xs font-semibold">{item.surface}</h2>
              </div>
              <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                Not independently measured. {item.reason}
              </p>
            </div>
          ))}
        </section>

        <section className="border-border bg-card/70 mt-5 rounded-2xl border p-5">
          <h2 className="text-sm font-semibold">Incident history and updates</h2>
          <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
            No incident history is published in this build, and status subscriptions are not
            enabled. This page does not invent an all clear for a surface it cannot measure.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="border-border bg-card text-muted-foreground cursor-not-allowed rounded-lg border px-3 py-1.5 text-[11px] font-semibold"
            >
              Subscribe to updates · not enabled
            </button>
            <Link
              to="/docs"
              className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-[11px] font-semibold"
            >
              Read the docs
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
