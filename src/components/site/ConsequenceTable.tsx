import { Link } from "@tanstack/react-router";
import { ArrowRight, GitBranch, ShieldCheck } from "lucide-react";
import { SectionLabel } from "@/components/site/SectionLabel";

const ROWS = [
  {
    question: "How are these two files connected?",
    before: "Search names, read snippets, or open files one by one until the chain appears.",
    after:
      "Trace the shortest import chain in either direction, with the exact line for every hop.",
  },
  {
    question: "What breaks if I change this?",
    before: "Guess from filenames or wait for CI to tell you what you missed.",
    after:
      "See direct importers, transitive files, affected routes and covering tests before you edit.",
  },
  {
    question: "Which data contracts are involved?",
    before: "Treat SQL migrations and API contracts as text that lives somewhere else.",
    after: "Replay the schema, link tables and columns to call sites, and flag drift in the code.",
  },
  {
    question: "Will this patch make the system worse?",
    before: "Write the change, run the build, and discover the cycle or missing import afterwards.",
    after: "Overlay the change on a safe copy, check the result, and only return a verified diff.",
  },
  {
    question: "Can my assistant use the same evidence?",
    before: "Paste files into a chat window and hope the context is complete.",
    after:
      "Call eleven read-only tools over MCP from Claude Code, Cursor, VS Code, Codex and more.",
  },
];

export function ConsequenceTable() {
  return (
    <section className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-16 sm:px-6 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-14">
        <div>
          <SectionLabel icon={<GitBranch className="size-3.5" />}>Beyond the graph</SectionLabel>
          <h2 className="font-display mt-3 max-w-md text-3xl leading-[1.08] tracking-tight sm:text-4xl">
            A map shows the shape. Nykst shows the consequence.
          </h2>
          <p className="text-body-ink mt-4 max-w-md text-sm leading-relaxed">
            Graph and search tools are good at finding what exists. Nykst is built for the next
            question: what does this change touch, what proves it, and what happens before it ships?
          </p>
          <Link
            to="/graph"
            className="border-border text-foreground hover:border-primary/45 hover:bg-surface/70 mt-6 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors"
          >
            Open the live map <ArrowRight className="size-3.5" />
          </Link>
          <p className="text-subtle-foreground mt-5 flex items-start gap-2 text-[10px] leading-relaxed">
            <ShieldCheck className="text-brand-ivory/60 mt-0.5 size-3.5 shrink-0" />
            Every row is computed from the repository. Nothing is seeded, sampled or inferred from a
            filename.
          </p>
        </div>

        <div className="space-y-2.5" data-testid="consequence-table">
          {ROWS.map((row, index) => (
            <article
              key={row.question}
              className="border-border bg-card/55 rounded-2xl border p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <span className="text-subtle-foreground/60 mt-0.5 font-mono text-[9px] tracking-[0.16em]">
                  0{index + 1}
                </span>
                <h3 className="text-sm font-semibold tracking-tight">{row.question}</h3>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="border-border/70 bg-surface/45 rounded-xl border p-3">
                  <p className="text-subtle-foreground font-mono text-[9px] tracking-[0.14em] uppercase">
                    A graph or search tool
                  </p>
                  <p className="text-subtle-foreground mt-1.5 text-[11px] leading-relaxed">
                    {row.before}
                  </p>
                </div>
                <div className="border-border bg-surface/70 rounded-xl border p-3">
                  <p className="text-foreground flex items-center gap-2 font-mono text-[9px] tracking-[0.14em] uppercase">
                    <span aria-hidden="true" className="bg-live h-px w-3 shrink-0" />
                    With Nykst
                  </p>
                  <p className="text-body-ink mt-1.5 text-[11px] leading-relaxed">{row.after}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
