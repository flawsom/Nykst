import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Braces, FileText, Gauge, LockKeyhole, Terminal } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { CONTACT_EMAIL, mailtoHref } from "@/lib/contact";
import { canonicalUrl, shareMeta } from "@/lib/seo";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs · Nykst" },
      {
        name: "description",
        content:
          "How to connect a repository, read the system map, understand change impact, and use Nykst from a coding assistant.",
      },
      ...shareMeta({
        title: "Docs · Nykst",
        description:
          "How to connect a repository, read the system map, understand change impact, and use Nykst from a coding assistant.",
        path: "/docs",
      }),
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/docs") }],
  }),
  component: DocsPage,
});

const REPO = "https://github.com/flawsom/Nykst/blob/main";

function DocsCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-card/70 rounded-2xl border p-5">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="mt-3 space-y-2 text-[12px] leading-relaxed">{children}</div>
    </section>
  );
}

function DocsPage() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Docs" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/status" className="text-muted-foreground hover:text-foreground">
            Status
          </Link>
          <Link to="/changelog" className="text-muted-foreground hover:text-foreground">
            Changelog
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

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">Docs</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          From your repository to a map you can trust.
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
          These pages walk through the whole product: connecting a repository, reading the map,
          understanding what a change will touch, and keeping the reasons behind the code. If you
          would rather be shown than read, tell us and we will walk through it with you.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <DocsCard icon={<BookOpen className="size-4" />} title="Start here">
            <p className="text-muted-foreground">
              Sign in with GitHub, choose the repositories Nykst may read, and the map appears.
              There is nothing to install in your codebase and nothing to configure first.
            </p>
            <ol className="text-muted-foreground list-decimal space-y-1 pl-4">
              <li>Connect your GitHub account.</li>
              <li>Choose one repository to start with.</li>
              <li>Open the map and pick any file.</li>
            </ol>
            <Link to="/subscribe" className="text-primary block font-medium hover:underline">
              Get your workspace set up
            </Link>
            <Link to="/changelog" className="text-primary block font-medium hover:underline">
              What changed recently
            </Link>
          </DocsCard>

          <DocsCard icon={<LockKeyhole className="size-4" />} title="Connect a repository">
            <p className="text-muted-foreground">
              You decide which repositories to connect, one or many. You can remove access at any
              time from your GitHub settings or by asking us. Your code is never written to.
            </p>
            <p className="text-muted-foreground">
              Private repositories are supported. If your organisation requires an owner to approve
              access, GitHub will send that request for you.
            </p>
          </DocsCard>

          <DocsCard icon={<Gauge className="size-4" />} title="Read the map">
            <p className="text-muted-foreground">
              The map has six levels: your whole organization, the areas your system divides into,
              what each area does, the services and database tables it uses, its modules, and the
              files inside them.
            </p>
            <p className="text-muted-foreground">
              Click any level to move into it. The path at the top always shows where you are, and
              the page updates in place, so you can go back without losing your place.
            </p>
            <Link to="/graph" className="text-primary block font-medium hover:underline">
              Open the system map
            </Link>
          </DocsCard>

          <DocsCard icon={<Braces className="size-4" />} title="What a change will touch">
            <p className="text-muted-foreground">
              Pick a file and see what imports it directly, what depends on it further away, which
              pages and endpoints reach it, and which tests cover it. The same view tells you what
              removing an export, renaming a column, or changing a function signature would break.
            </p>
            <Link to="/graph" className="text-primary block font-medium hover:underline">
              Check a file before you edit it
            </Link>
          </DocsCard>

          <DocsCard icon={<FileText className="size-4" />} title="Keep the history">
            <p className="text-muted-foreground">
              Decisions, past incidents and team conventions stay attached to the parts of the
              system they explain. When someone asks why a file looks the way it does, the reason is
              next to the file instead of in a chat thread.
            </p>
            <Link to="/intelligence" className="text-primary block font-medium hover:underline">
              Explore system history
            </Link>
          </DocsCard>

          <DocsCard icon={<Terminal className="size-4" />} title="Use it in your editor">
            <p className="text-muted-foreground">
              If you work in an editor or a coding assistant, you can ask the same questions there
              and get the same answers before the code is written.
            </p>
            <Link to="/mcp" className="text-primary block font-medium hover:underline">
              Set up your coding assistant
            </Link>
            <a
              href={`${REPO}/README.md`}
              target="_blank"
              rel="noreferrer"
              className="text-primary block font-medium hover:underline"
            >
              Developer notes
            </a>
            <a
              href={`${REPO}/docs/openapi.json`}
              target="_blank"
              rel="noreferrer"
              className="text-primary block font-medium hover:underline"
            >
              Technical reference
            </a>
          </DocsCard>
        </div>

        <section className="border-border bg-card/70 mt-6 rounded-2xl border p-5">
          <p className="text-primary font-mono text-[10px] tracking-[0.22em] uppercase">Guides</p>
          <h2 className="mt-2 text-lg font-semibold">Three proofs you can check yourself</h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-[12px] leading-relaxed">
            Each guide uses the public Nykst example, cites the file and line, and states what the
            proof does not cover. No account needed.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link
              to="/guides/read-impact-proof"
              className="border-border bg-surface hover:border-primary/40 rounded-xl border p-4 transition-colors"
            >
              <span className="text-foreground block text-xs font-semibold">
                Read a change impact proof
              </span>
              <span className="text-muted-foreground mt-1 block text-[11px] leading-relaxed">
                Importers, runtime dependents, entrypoints and the checks that cover them.
              </span>
            </Link>
            <Link
              to="/guides/sql-migration-impact"
              className="border-border bg-surface hover:border-primary/40 rounded-xl border p-4 transition-colors"
            >
              <span className="text-foreground block text-xs font-semibold">
                SQL column and migration impact
              </span>
              <span className="text-muted-foreground mt-1 block text-[11px] leading-relaxed">
                What a static read can prove about a column change, and what it cannot.
              </span>
            </Link>
            <Link
              to="/guides/mcp-read-only"
              className="border-border bg-surface hover:border-primary/40 rounded-xl border p-4 transition-colors"
            >
              <span className="text-foreground block text-xs font-semibold">
                Use the read-only MCP tools safely
              </span>
              <span className="text-muted-foreground mt-1 block text-[11px] leading-relaxed">
                Token storage, scope, revocation and the three tools to start with.
              </span>
            </Link>
          </div>
        </section>

        <section className="border-border bg-surface/50 mt-6 rounded-2xl border p-5">
          <h2 className="text-sm font-semibold">Your account, your data and help</h2>
          <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
            You can ask for a copy of your data, correct it, or close your account at any time. If
            something looks wrong, tell us and a person will reply within 2 business days.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
            <Link to="/privacy" className="text-primary font-medium hover:underline">
              Privacy and data
            </Link>
            <Link to="/limits" className="text-primary font-medium hover:underline">
              Limits
            </Link>
            <Link to="/status" className="text-primary font-medium hover:underline">
              Service status
            </Link>
            <a href={mailtoHref("Support")} className="text-primary font-medium hover:underline">
              {CONTACT_EMAIL}
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
