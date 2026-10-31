import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, GitCommitHorizontal, ShieldCheck } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { CONTACT_EMAIL, mailtoHref } from "@/lib/contact";
import { canonicalUrl, shareMeta } from "@/lib/seo";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog · Nykst" },
      {
        name: "description",
        content: "What changed in Nykst, written for the people using it.",
      },
      ...shareMeta({
        title: "Changelog · Nykst",
        description: "What changed in Nykst, written for the people using it.",
        path: "/changelog",
      }),
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/changelog") }],
  }),
  component: ChangelogPage,
});

function Entry({ date, title, children }: { date: string; title: string; children: ReactNode }) {
  return (
    <article className="border-border bg-card/70 rounded-2xl border p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px]">
          <GitCommitHorizontal className="size-3.5" /> {date}
        </span>
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
          What changed for you.
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Short notes on what is new or better, written for the person using Nykst rather than for
          the person building it.
        </p>

        <div className="mt-6 space-y-4">
          <Entry date="29 October 2026" title="A simpler way to start">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                The plans page now shows the live monthly and annual terms, including the 7-day
                trial, the refund window, GST and the checkout state read from the plans API. The
                weekly plan stays visibly gated until its refund window is decided.
              </li>
              <li>
                Privacy requests now get a reference straight away, and a person replies within 2
                business days.
              </li>
              <li>
                New docs, status and release notes pages, written in plain language, with every link
                working.
              </li>
              <li>Old links to the pricing page now land on the plans page instead of an error.</li>
              <li>
                The system map reads clearly on a phone, and the dialog that only offered to close
                itself is gone.
              </li>
            </ul>
          </Entry>

          <Entry date="28 October 2026" title="The map follows the exact file you pick">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Selecting a file now moves the whole view with you: the centre of the map, the path,
                the details panel and the link you can share.
              </li>
              <li>Reloading a shared link opens the same file, not the top of the repository.</li>
              <li>
                When a change is refused, the reason names the exact problem instead of a generic
                warning.
              </li>
              <li>
                The details panel says what each count counts, so call sites and database tables are
                never confused with files.
              </li>
            </ul>
          </Entry>

          <Entry date="27 October 2026" title="One number, one meaning">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                The example map now shows the same file, line and connection counts everywhere they
                appear.
              </li>
              <li>
                The database count counts database tables, and says so, on every page that shows it.
              </li>
              <li>
                History figures that had nothing behind them were removed rather than displayed as
                zero.
              </li>
            </ul>
          </Entry>
        </div>

        <div className="border-border mt-6 flex items-start gap-2 border-t pt-4">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Every entry above is live on this site before it appears here. If something looks wrong,
            email{" "}
            <a href={mailtoHref("Support")} className="underline">
              {CONTACT_EMAIL}
            </a>{" "}
            and a person will reply.
          </p>
        </div>
      </div>
    </main>
  );
}
