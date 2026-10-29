import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Braces, FileText, Gauge, LockKeyhole, Terminal } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";

export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [{ title: "Docs · Nykst" }] }),
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
          Documentation that matches this build.
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
          Every link below points to a document, endpoint, or measured page that exists in this
          repository. There is no separate versioned docs archive yet, so this index does not
          pretend to be one.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <DocsCard icon={<BookOpen className="size-4" />} title="Start here">
            <p className="text-muted-foreground">
              The README carries the product definition, the current snapshot numbers, setup steps,
              and the limits this build does not claim.
            </p>
            <a
              href={`${REPO}/README.md`}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-block font-medium hover:underline"
            >
              Read the README
            </a>
            <Link to="/changelog" className="text-primary block font-medium hover:underline">
              Release notes
            </Link>
          </DocsCard>

          <DocsCard icon={<Terminal className="size-4" />} title="MCP">
            <p className="text-muted-foreground">
              Nykst exposes 11 read-only MCP tools. The schema is generated from the executable
              catalog, so the count and names cannot drift from the tool list.
            </p>
            <Link to="/mcp" className="text-primary block font-medium hover:underline">
              MCP guide and sandbox
            </Link>
            <a
              href="/api/mcp/schema"
              target="_blank"
              rel="noreferrer"
              className="text-primary block font-medium hover:underline"
            >
              Live MCP schema
            </a>
          </DocsCard>

          <DocsCard icon={<Braces className="size-4" />} title="API">
            <p className="text-muted-foreground">
              The OpenAPI document lists the routes that are actually served. The health probe
              reports measured database readiness, not a static badge.
            </p>
            <a
              href={`${REPO}/docs/openapi.json`}
              target="_blank"
              rel="noreferrer"
              className="text-primary block font-medium hover:underline"
            >
              OpenAPI document
            </a>
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="text-primary block font-medium hover:underline"
            >
              Live health probe
            </a>
          </DocsCard>

          <DocsCard icon={<Gauge className="size-4" />} title="Limits">
            <p className="text-muted-foreground">
              Published caps are enforced in code or marked as unmeasured targets. A capped list
              must say that it is capped.
            </p>
            <Link to="/limits" className="text-primary block font-medium hover:underline">
              Limits and tested ceilings
            </Link>
          </DocsCard>

          <DocsCard icon={<LockKeyhole className="size-4" />} title="Privacy and data">
            <p className="text-muted-foreground">
              The transparency page lists data categories, processors, consent purposes, rights, and
              the controls that are still gated. It does not claim substantive DPDP compliance
              before the duties are in force and tested.
            </p>
            <Link to="/privacy" className="text-primary block font-medium hover:underline">
              Privacy and data
            </Link>
            <a
              href={`${REPO}/README.md`}
              target="_blank"
              rel="noreferrer"
              className="text-primary block font-medium hover:underline"
            >
              Security and data notes in the README
            </a>
          </DocsCard>

          <DocsCard icon={<FileText className="size-4" />} title="Payments and billing">
            <p className="text-muted-foreground">
              Plan prices and gated checkout states are public. Live checkout is disabled until plan
              ids, tax confirmation, credential rotation, and the test-mode suite are signed off.
            </p>
            <Link to="/subscribe" className="text-primary block font-medium hover:underline">
              Plans and prices
            </Link>
            <Link to="/billing" className="text-primary block font-medium hover:underline">
              Billing
            </Link>
          </DocsCard>
        </div>

        <section className="border-border bg-surface/50 mt-6 rounded-2xl border border-dashed p-5">
          <h2 className="text-sm font-semibold">Not built yet</h2>
          <ul className="text-muted-foreground mt-3 space-y-1.5 text-[11px] leading-relaxed">
            <li>A separate versioned docs site with archived versions and docs search.</li>
            <li>A docs feedback channel and a release gate that blocks a feature without docs.</li>
            <li>Localised docs beyond the English README and this index.</li>
          </ul>
          <p className="text-muted-foreground mt-3 text-[10px] leading-relaxed">
            These are scheduled work, not current features. This page does not show placeholder
            documentation for them.
          </p>
        </section>
      </div>
    </main>
  );
}
