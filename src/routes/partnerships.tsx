import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Handshake, LockKeyhole, Mail } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";

export const Route = createFileRoute("/partnerships")({
  head: () => ({ meta: [{ title: "Partnerships · Nykst" }] }),
  component: PartnershipsPage,
});

const TYPES = [
  {
    title: "Technology integration",
    detail:
      "Connect Nykst evidence to an editor, CI, observability, or data platform, with a read-only scope and a published data flow.",
  },
  {
    title: "Reseller and referral",
    detail:
      "Introduce teams that need pre-change impact evidence, with clear pricing and no credit metering for core answers.",
  },
  {
    title: "Enterprise and team deployment",
    detail:
      "Evaluate org scope, permission-aware indexing, and deployment options. Enterprise terms are not published yet.",
  },
  {
    title: "Education and research",
    detail:
      "Use Nykst on a public or owned repository for teaching or a reproducible study, with a cited snapshot and no private data.",
  },
  {
    title: "Community and open source",
    detail:
      "Contribute adapters, fixtures, or documentation. A contribution must have a licence record and a test.",
  },
];

function PartnershipsPage() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Partnerships" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/docs" className="text-muted-foreground hover:text-foreground">
            Docs
          </Link>
          <Link to="/subscribe" className="text-muted-foreground hover:text-foreground">
            Plans
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
          Partnerships
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Partnerships with evidence, not a logo wall.
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          A partnership must serve the core question: what breaks if a file changes. The types below
          are proposed. None is open for applications yet, because the criteria and benefits are not
          recorded and no dedicated partnership contact is confirmed.
        </p>

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-amber-200">
              Partnership inquiries are not enabled
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
              No partnership email or form is published here. Publishing a placeholder address would
              send business inquiries into a channel the founders have not confirmed. This page does
              not pretend a submission succeeded.
            </p>
          </div>
        </div>

        <section className="mt-5 space-y-3">
          {TYPES.map((type) => (
            <article key={type.title} className="border-border bg-card/70 rounded-2xl border p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Handshake className="text-primary size-4" />
                  <h2 className="text-sm font-semibold">{type.title}</h2>
                </div>
                <span className="border-border bg-surface text-muted-foreground rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase">
                  Proposed · not open
                </span>
              </div>
              <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
                {type.detail}
              </p>
            </article>
          ))}
        </section>

        <section className="border-border bg-card/70 mt-5 rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <Mail className="text-muted-foreground size-4" />
            <h2 className="text-sm font-semibold">What to prepare when the channel opens</h2>
          </div>
          <ul className="text-muted-foreground mt-3 space-y-1.5 text-[11px] leading-relaxed">
            <li>Your organisation, country, and the partnership type you are proposing.</li>
            <li>The integration or distribution surface, and the data each side would receive.</li>
            <li>The customer problem, expected volume or audience, and a named contact.</li>
            <li>Your security, privacy, and DPDP role in the proposed flow.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="border-border bg-card text-muted-foreground cursor-not-allowed rounded-lg border px-3 py-1.5 text-[11px] font-semibold"
            >
              Contact partnerships · not enabled
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
