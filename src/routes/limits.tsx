import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gauge, Info, Ruler } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";

type SelfStats = {
  stats?: {
    sourceFiles: number;
    analyzedFiles: number;
    loc: number;
    internalEdges: number;
    unresolvedImports: number;
    skippedFiles: number;
    durationMs: number;
  };
  ref?: string;
  generatedAt?: string;
  repository?: string;
};

export const Route = createFileRoute("/limits")({
  head: () => ({ meta: [{ title: "Limits and tested ceilings · Nykst" }] }),
  component: LimitsPage,
});

const CAPS = [
  {
    surface: "Single source file",
    cap: "400 KB",
    behaviour: "Skipped with a stated reason; the count of skipped files is shown.",
  },
  {
    surface: "Dossier first paint",
    cap: "40 rows per section",
    behaviour: "Total and distinct counts are shown, with Show all up to 1000 rows.",
  },
  {
    surface: "Orbit sector",
    cap: "24 nodes per sector",
    behaviour: "A sector switcher states the range and total; list view reaches every node.",
  },
  {
    surface: "MCP search_files",
    cap: "50 results",
    behaviour: "Scoped to the stated target path, or an explicit target path not found error.",
  },
  {
    surface: "simulate_change",
    cap: "50 file changes per call",
    behaviour: "Refused above the cap; nothing is written in any case.",
  },
  {
    surface: "Public precomputed graphs",
    cap: "0 of 10 loaded",
    behaviour:
      "Typing a public owner/repo shows a clear not-browsable state. No sample fallback is used.",
  },
  {
    surface: "Phase 1 public target",
    cap: "25,000 source files",
    behaviour:
      "A target, not a measured capability. Above it the graph must be partial and stated.",
  },
];

export function LimitsPage() {
  const [self, setSelf] = useState<SelfStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void fetch("/api/analysis/self", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The self snapshot is unavailable (${response.status}).`);
        const body = (await response.json()) as SelfStats;
        if (live) setSelf(body);
      })
      .catch((cause) => {
        if (live) setError(cause instanceof Error ? cause.message : "Limits are unavailable.");
      });
    return () => {
      live = false;
    };
  }, []);

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

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
          Limits and tested ceilings
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          A ceiling is a fact, not a marketing number.
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
          Every cap below is enforced in code and labelled where it appears, or is marked as an
          unmeasured target. A capped list never presents itself as a complete result.
        </p>

        <section className="border-border bg-card/70 mt-6 rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <Ruler className="text-primary size-4" />
            <h2 className="text-sm font-semibold">Measured on this build</h2>
          </div>
          {error ? (
            <p className="text-muted-foreground mt-3 text-xs">{error}</p>
          ) : !self ? (
            <p className="text-muted-foreground mt-3 text-xs">Reading the self snapshot…</p>
          ) : (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Source files", self.stats?.sourceFiles],
                  ["Analyzed files", self.stats?.analyzedFiles],
                  ["Lines", self.stats?.loc],
                  ["Internal edges", self.stats?.internalEdges],
                  ["Unresolved imports", self.stats?.unresolvedImports],
                  ["Skipped files", self.stats?.skippedFiles],
                  ["Compile time", self.stats ? `${self.stats.durationMs} ms` : null],
                  ["Snapshot ref", self.ref ?? null],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-muted-foreground text-[10px] uppercase tracking-wide">
                      {label}
                    </dt>
                    <dd className="mt-0.5 font-mono text-sm font-semibold">
                      {value === null || value === undefined
                        ? "not reported"
                        : typeof value === "number"
                          ? value.toLocaleString("en-US")
                          : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-muted-foreground mt-4 flex items-start gap-1.5 text-[10px] leading-relaxed">
                <Info className="mt-0.5 size-3 shrink-0" />
                Snapshot {self.repository ?? "self"} generated{" "}
                {self.generatedAt ?? "at an unknown time"}. These are self-repo measurements, not a
                Repo B pass and not a claim for every repository size.
              </p>
            </>
          )}
        </section>

        <section className="border-border bg-card/70 mt-5 rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <Gauge className="text-primary size-4" />
            <h2 className="text-sm font-semibold">Enforced caps</h2>
          </div>
          <ul className="mt-4 space-y-2">
            {CAPS.map((item) => (
              <li key={item.surface} className="border-border bg-surface/60 rounded-xl border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold">{item.surface}</p>
                  <p className="text-primary font-mono text-[11px]">{item.cap}</p>
                </div>
                <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                  {item.behaviour}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-border bg-card/70 mt-5 rounded-2xl border p-5">
          <h2 className="text-sm font-semibold">What is not measured</h2>
          <ul className="text-muted-foreground mt-3 space-y-1.5 text-[11px] leading-relaxed">
            <li>
              Repo B has no selected external repository and no hand-written known answers yet.
            </li>
            <li>The 25,000 source-file Phase 1 target has not been measured on any repository.</li>
            <li>Public precomputed graphs: 0 of the Phase 1 set are ingested.</li>
            <li>
              Incremental push-to-snapshot latency has not been measured, so no real-time claim is
              made.
            </li>
            <li>No enterprise uptime, SLA or air-gapped deployment is claimed.</li>
          </ul>
        </section>

        <p className="text-muted-foreground mt-6 text-[10px] leading-relaxed">
          If a cap is hit, the product shows the limit and a way to reach the rest, or a clear limit
          error. Silent truncation presented as complete is a defect.
        </p>
      </div>
    </main>
  );
}
