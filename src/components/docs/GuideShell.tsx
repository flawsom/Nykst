import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, FileCode2, GitCommitHorizontal } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { CONTACT_EMAIL, mailtoHref } from "@/lib/contact";

export function Evidence({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="border-primary/25 bg-primary/[0.055] mt-6 rounded-xl border p-4 sm:p-5">
      <p className="text-primary flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] uppercase">
        <FileCode2 className="size-3.5" /> {title}
      </p>
      <div className="text-muted-foreground mt-3 space-y-2 text-xs leading-relaxed">{children}</div>
    </aside>
  );
}

export function GuideShell({
  eyebrow,
  title,
  description,
  reviewed,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  reviewed: string;
  children: ReactNode;
}) {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/85 sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <NykstBrand subtitle="Guides" size={26} />
        </Link>
        <nav className="flex shrink-0 items-center gap-3 text-xs">
          <Link to="/docs" className="text-muted-foreground hover:text-foreground">
            Docs
          </Link>
          <Link to="/graph" className="text-muted-foreground hover:text-foreground">
            System map
          </Link>
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.assign("/docs");
            }}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 py-1"
          >
            <ArrowLeft className="size-3.5" /> Back
          </button>
        </nav>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <nav
          aria-label="Breadcrumb"
          className="text-muted-foreground flex items-center gap-2 text-[11px]"
        >
          <Link to="/docs" className="hover:text-foreground">
            Docs
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{eyebrow}</span>
        </nav>

        <p className="text-primary mt-8 flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase">
          <BookOpen className="size-3.5" /> {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl leading-[1.08] tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">{description}</p>
        <p className="text-muted-foreground mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px]">
          <GitCommitHorizontal className="size-3.5" />
          <span>Reviewed {reviewed}</span>
          <span aria-hidden="true">/</span>
          <span>Nykst example repository: flawsom/nykst</span>
        </p>

        <article className="mt-9 space-y-8 text-sm leading-relaxed [overflow-wrap:anywhere]">
          {children}
        </article>

        <div className="border-border mt-10 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground max-w-md text-xs leading-relaxed">
            Every example links to the file it comes from. If a claim here cannot be checked in the
            repository, treat it as a bug and tell us.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/graph"
              className="bg-primary text-primary-foreground inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold"
            >
              Open the live map <ArrowRight className="size-3.5" />
            </Link>
            <a
              href={mailtoHref("Support", "docs feedback")}
              className="border-border bg-surface hover:bg-surface-2 inline-flex min-h-10 items-center rounded-lg border px-4 py-2 text-xs font-semibold"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
