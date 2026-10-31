import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileCode2, Files, Layers, ShieldCheck } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { CONTACT_EMAIL } from "@/lib/contact";
import { canonicalUrl, shareMeta } from "@/lib/seo";

export const Route = createFileRoute("/limits")({
  head: () => ({
    meta: [
      { title: "Limits · Nykst" },
      {
        name: "description",
        content:
          "The repository, file and analysis limits Nykst applies, and what the map says when a limit is reached.",
      },
      ...shareMeta({
        title: "Limits · Nykst",
        description:
          "The repository, file and analysis limits Nykst applies, and what the map says when a limit is reached.",
        path: "/limits",
      }),
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/limits") }],
  }),
  component: LimitsPage,
});

const LIMITS = [
  {
    icon: Files,
    title: "Repository size",
    value: "25,000 files",
    copy: "We map repositories up to 25,000 source files. Most teams are far below this. If yours is larger, tell us and we will look at it with you.",
  },
  {
    icon: FileCode2,
    title: "Single file",
    value: "400 KB",
    copy: "Very large single files are skipped so one generated file cannot slow the whole map. The map tells you when files were skipped.",
  },
  {
    icon: ShieldCheck,
    title: "Binary and generated files",
    value: "Not treated as source",
    copy: "Images, archives, build output and other generated files are not analysed as code. They stay out of the map so the map reflects what you actually maintain.",
  },
  {
    icon: Layers,
    title: "Very large repositories",
    value: "Partial map, clearly stated",
    copy: "Above the ceiling you still get a map of the files that were read, with the limit shown on screen. We never present a partial map as a complete one.",
  },
];

export function LimitsPage() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Limits" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy
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
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">Limits</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          How large can a repository be?
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
          These are the limits we apply to every repository. They exist so the map stays accurate
          and fast. When a limit applies to your repository, the map says so plainly.
        </p>

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          {LIMITS.map((limit) => (
            <div key={limit.title} className="border-border bg-card/70 rounded-2xl border p-5">
              <span className="border-primary/30 bg-primary/10 flex size-9 items-center justify-center rounded-lg border">
                <limit.icon className="text-primary size-4" />
              </span>
              <h2 className="mt-3 text-sm font-semibold">{limit.title}</h2>
              <p className="text-primary mt-0.5 font-mono text-[11px]">{limit.value}</p>
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{limit.copy}</p>
            </div>
          ))}
        </section>

        <section className="border-border bg-card/70 mt-6 rounded-2xl border p-5">
          <h2 className="text-sm font-semibold">A larger codebase?</h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            If your repository is above the file limit, or you need several repositories in one map,
            email{" "}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{" "}
            with the size and what you need to see. We will tell you honestly what we can map today
            and what we would need to do to support it.
          </p>
          <Link
            to="/subscribe"
            className="bg-primary text-primary-foreground hover:bg-primary-glow mt-4 inline-flex rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            Talk to us
          </Link>
        </section>
      </div>
    </main>
  );
}
