import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { ContactForm } from "@/components/site/ContactForm";
import { CONTACT_EMAIL } from "@/lib/contact";

export const Route = createFileRoute("/status")({
  head: () => ({ meta: [{ title: "Status · Nykst" }] }),
  component: StatusPage,
});

type Health = {
  status: "ok" | "degraded";
  reachable: boolean;
  missing: string[];
  error: string | null;
  checkedAt?: string;
};

type RowState = "normal" | "issue" | "checking";

function timeLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toISOString().slice(11, 16)} UTC`;
}

function StatusRow({ name, detail, state }: { name: string; detail: string; state: RowState }) {
  return (
    <div className="border-border bg-surface/60 flex items-start justify-between gap-4 rounded-xl border p-4">
      <div>
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">{detail}</p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
          state === "normal"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : state === "issue"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "border-border bg-card text-muted-foreground"
        }`}
      >
        {state === "normal" ? (
          <CheckCircle2 className="size-3" />
        ) : state === "issue" ? (
          <CircleAlert className="size-3" />
        ) : null}
        {state === "normal"
          ? "Working normally"
          : state === "issue"
            ? "We are looking into it"
            : "Checking"}
      </span>
    </div>
  );
}

function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as Health | null;
      setHealth(body);
    } catch {
      setHealth(null);
    } finally {
      setCheckedAt(new Date().toISOString());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checked = timeLabel(checkedAt);
  const apiState: RowState = loading ? "checking" : health?.reachable ? "normal" : "issue";
  const databaseState: RowState = loading
    ? "checking"
    : health && health.missing.length === 0
      ? "normal"
      : "issue";

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

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">Status</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Is everything working?
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
          Here is the current state of the service, checked from this page.
          {checked ? ` Last checked ${checked}.` : ""}
        </p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Current state</h2>
          <button
            type="button"
            onClick={() => void load()}
            className="border-border bg-surface hover:bg-surface-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold"
          >
            <RefreshCw className={loading ? "size-3 animate-spin" : "size-3"} /> Check again
          </button>
        </div>

        <section data-testid="status-health" className="mt-3 space-y-2.5">
          <StatusRow
            name="Website"
            detail="Pages, navigation and the repository map."
            state={loading ? "checking" : "normal"}
          />
          <StatusRow
            name="API"
            detail="The service that answers questions about your repositories."
            state={apiState}
          />
          <StatusRow
            name="Database"
            detail="Where your account and repository maps are stored."
            state={databaseState}
          />
        </section>

        <section className="border-border bg-card/70 mt-6 rounded-2xl border p-5">
          <h2 className="text-sm font-semibold">Something looks wrong?</h2>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Tell us what you saw and we will look into it. You can email{" "}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{" "}
            or send a message here. You get a reference straight away, and we reply within 2
            business days.
          </p>
          <div className="mt-4">
            <ContactForm defaultTopic="Support" />
          </div>
        </section>
      </div>
    </main>
  );
}
