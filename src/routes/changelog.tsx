import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, GitCommitHorizontal, ShieldCheck } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";

export const Route = createFileRoute("/changelog")({
  head: () => ({ meta: [{ title: "Changelog · Nykst" }] }),
  component: ChangelogPage,
});

const REPO = "https://github.com/flawsom/Nykst/commit";

function Entry({
  commit,
  date,
  title,
  children,
}: {
  commit: string;
  date: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="border-border bg-card/70 rounded-2xl border p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={`${REPO}/${commit}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px] hover:underline"
        >
          <GitCommitHorizontal className="size-3.5" /> {commit.slice(0, 7)}
        </a>
        <span className="text-muted-foreground font-mono text-[10px]">{date}</span>
      </div>
      <h2 className="mt-2 text-base font-semibold">{title}</h2>
      <div className="text-muted-foreground mt-3 space-y-2 text-[12px] leading-relaxed">
        {children}
      </div>
    </article>
  );
}

function ChangelogPage() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Changelog" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/docs" className="text-muted-foreground hover:text-foreground">
            Docs
          </Link>
          <Link to="/status" className="text-muted-foreground hover:text-foreground">
            Status
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
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">Changelog</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Release notes with a build and a test count.
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Each entry names the commit it describes. A feature is listed only when its test passed on
          that build. Work that is gated or unbuilt is listed as such.
        </p>

        <div className="mt-6 space-y-4">
          <Entry
            commit="486adec6eb6823fd5181833d82581af07e4b8715"
            date="28 Oct 2026"
            title="Razorpay webhook and the current product surfaces"
          >
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Added a verified Razorpay webhook receiver at{" "}
                <code className="text-foreground">/api/webhooks/razorpay</code>, with HMAC SHA256
                verification over the raw body, idempotent event recording, and explicit missing
                secret and invalid signature responses.
              </li>
              <li>
                Added the <code className="text-foreground">razorpay_webhook_events</code> table and
                included it in the readiness probe.
              </li>
              <li>
                Added the public plan registry, plans API, billing, limits, and privacy surfaces.
                Docs, status, changelog, and partnerships are not in this commit. Checkout remains
                gated because no real plan id or live gate sign off is recorded.
              </li>
              <li>
                Added graph selection, dossier, MCP target path, and Safe Code Loop coverage work
                with unit, contract, and browser journeys.
              </li>
            </ul>
            <div className="border-border mt-3 flex items-start gap-2 border-t pt-3">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
              <p className="text-[11px]">
                Verified on this commit: 173 unit and integration tests passed, TypeScript passed,
                the claims check passed at 233 files, 44,036 LOC, 507 edges, and 11 tools, and the
                live canonical health probe reported 11 tables with none missing.
              </p>
            </div>
          </Entry>

          <Entry
            commit="f6d15b93dced61e0b7ee8f3a4fb1beb5dda08c65"
            date="28 Oct 2026"
            title="Navigation suite included in the verified totals"
          >
            <p>
              The README and snapshot totals were updated to include the browser navigation suite.
              This entry records the documentation and claims update only.
            </p>
          </Entry>
        </div>

        <section className="border-border bg-surface/50 mt-6 rounded-2xl border border-dashed p-5">
          <h2 className="text-sm font-semibold">Not claimed in this release</h2>
          <ul className="text-muted-foreground mt-3 space-y-1.5 text-[11px] leading-relaxed">
            <li>No live Razorpay checkout, charge, trial, GST invoice, or refund flow.</li>
            <li>No substantive DPDP compliance claim before the May 2027 duties are in force.</li>
            <li>No precomputed public repo graph set and no Repo B promotion gate pass.</li>
            <li>No enterprise price, SLA, white label, or offline mode.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
