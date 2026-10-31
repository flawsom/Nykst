import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronRight, Github, Mail, X } from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { GithubConnectPanel } from "@/components/graph/GithubConnectPanel";
import { LandingGraphPreview, type LandingMapData } from "@/components/graph/LandingGraphPreview";
import {
  LiveGraphRagExplorer,
  type LiveSelfAnalysis,
} from "@/components/graph/LiveGraphRagExplorer";
import { AdvantagesForm } from "@/components/graph/AdvantagesForm";
import { RepoSwitcherBar } from "@/components/graph/RepoSwitcherBar";
import { LandingHeader } from "@/components/site/LandingHeader";
import { ScrollProgress } from "@/components/site/ScrollProgress";
import { PlansPreview } from "@/components/site/PlansPreview";
import { LandingFaq } from "@/components/site/LandingFaq";
import { WorksWith } from "@/components/site/WorksWith";
import { ConsequenceTable } from "@/components/site/ConsequenceTable";

import snapshotStats from "@/lib/analysis/self-snapshot-stats.json";
import { CONTACT_EMAIL, mailtoHref } from "@/lib/contact";

import { CodeProblemInspector, type CodeTarget } from "@/components/graph/CodeProblemInspector";
import {
  AnimatedCounter,
  BlurReveal,
  InfiniteMarquee,
  SplitText,
  SpotlightBackdrop,
} from "@/components/motion/VariantMotion";
import { fetchWithTimeout, readableRequestError } from "@/lib/fetch-with-timeout";
import { canonicalUrl, shareMeta } from "@/lib/seo";

const SAVED_DOMAINS = (snapshotStats as { domains?: LandingMapData["domains"] }).domains ?? [];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nykst · See what your next change will affect" },
      {
        name: "description",
        content:
          "Connect your repositories and get one map of how your system fits together. See every file, service and database table a change will touch before you make it.",
      },
      ...shareMeta({
        title: "Nykst · See what your next change will affect",
        description:
          "One map of your system, built from your real code. See what a change will touch before you make it.",
        path: "/",
      }),
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/") }],
  }),
  component: Landing,
});

const LEVELS = [
  {
    level: "01",
    title: "Organization",
    count: "Everything in one place",
    copy: "All of your repositories, services, databases and the people who work on them, seen together.",
  },
  {
    level: "02",
    title: "System area",
    count: "How your code is actually organised",
    copy: "The parts your system really divides into, read from the directories and connections in your code rather than a document someone has to maintain.",
  },
  {
    level: "03",
    title: "What it does",
    count: "Grouped by what depends on it",
    copy: "What each part is responsible for, ordered by how much of the rest of your system relies on it.",
  },
  {
    level: "04",
    title: "Services and data",
    count: "External services and database tables",
    copy: "The external services you call and the database tables you use, linked to the places in your code that touch them.",
  },
  {
    level: "05",
    title: "Module",
    count: "Files that belong together",
    copy: "The internal boundaries inside each part: request handlers, helpers, and shared utilities.",
  },
  {
    level: "06",
    title: "File",
    count: "What it exports and what uses it",
    copy: "For any single file: what it exports, who imports it, which pages or endpoints reach it, and which tests cover it.",
  },
];

const FEATURES = [
  {
    title: "Know what a change will touch",
    copy: "Before you edit a file, see every place that depends on it, which pages and endpoints are affected, and which tests cover it.",
    link: "Open the navigator",
    to: "/graph",
  },
  {
    title: "Keep the reasons, not just the code",
    copy: "Decisions, past incidents and team conventions stay attached to the parts of the system they explain, so the next person does not start from zero.",
    link: "Explore system memory",
    to: "/intelligence",
  },
  {
    title: "Use it where you already work",
    copy: "Ask the same questions from your editor or coding assistant, so the answer arrives before the code is written.",
    link: "Set up your coding assistant",
    to: "/mcp",
  },
];

const TRUST = [
  "You choose which repositories to connect",
  "Built from real code, not a diagram",
  "Database tables linked to the code that uses them",
  "Nothing written back to your repositories",
];

function Landing() {
  const [advantages, setAdvantages] = useState(false);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [codeTarget, setCodeTarget] = useState<CodeTarget | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubNotice, setGithubNotice] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [liveSelf, setLiveSelf] = useState<LiveSelfAnalysis | null>(null);
  const [selfError, setSelfError] = useState<string | null>(null);
  const [loopAccent, setLoopAccent] = useState<"teal" | "cyan" | "amber">("teal");

  const loadSelf = useCallback(async () => {
    setSelfError(null);
    try {
      const response = await fetchWithTimeout("/api/analysis/self", { cache: "no-store" }, 15_000);
      if (!response.ok) throw new Error(`Live analysis answered with ${response.status}.`);
      const data = (await response.json()) as LiveSelfAnalysis;
      if (!Array.isArray(data.domains) || data.domains.length === 0) {
        throw new Error("Live analysis returned no project areas.");
      }
      setLiveSelf(data);
      setActiveRepo((current) => current ?? data.repository);
    } catch (error) {
      setSelfError(readableRequestError(error, "The live analysis could not be loaded."));
    }
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const githubResult = params.get("github");
    if (githubResult === "connected") setGithubConnected(true);
    if (githubResult === "requested")
      setGithubNotice(
        "Access requested. An owner of that organization has to approve Nykst on GitHub first.",
      );
    if (githubResult === "expired")
      setGithubNotice("That GitHub sign-in link expired. Click Connect GitHub to try again.");
    if (githubResult === "failed") {
      const reason = params.get("reason") ?? "unknown_error";
      setGithubNotice(
        "We could not start the GitHub connection just now. Please try again, or email us and we will help you get set up.",
      );
    }
    if (githubResult) window.history.replaceState(null, "", window.location.pathname);

    void fetchWithTimeout("/api/integrations/github/organizations", { cache: "no-store" }, 10_000)
      .then((response) => {
        if (active && response.ok) setGithubConnected(true);
      })
      .catch(() => undefined);

    void loadSelf();

    return () => {
      active = false;
    };
  }, [loadSelf]);

  const connect = () => {
    window.location.assign("/api/integrations/github/start");
  };

  const scrollToWorkbench = (sampleFile?: string) => {
    if (sampleFile) {
      void fetchWithTimeout(
        `/api/analysis/self?path=${encodeURIComponent(sampleFile)}`,
        { cache: "no-store" },
        15_000,
      )
        .then((response) => {
          if (!response.ok) throw new Error(`Live analysis answered with ${response.status}.`);
          return response.json() as Promise<LiveSelfAnalysis>;
        })
        .then((data) => setLiveSelf(data))
        .catch((error) =>
          setSelfError(readableRequestError(error, "That area could not be opened live.")),
        );
    }
    document.getElementById("live-workbench")?.scrollIntoView({ behavior: "smooth" });
  };

  // The last compiled snapshot is real evidence and renders immediately. A
  // slow cold start must never leave the first screen saying "reading" forever.
  const previewData = useMemo<LandingMapData>(
    () => ({
      repository: liveSelf?.repository ?? "flawsom/nykst",
      generatedAt: liveSelf?.generatedAt ?? snapshotStats.generatedAt,
      stats: liveSelf?.stats ?? snapshotStats,
      domains: liveSelf?.domains ?? SAVED_DOMAINS,
    }),
    [liveSelf],
  );

  const stats = liveSelf?.stats ?? snapshotStats;

  const marqueeItems = [
    {
      label: "EXAMPLE REPOSITORY",
      value: liveSelf?.repository ?? "flawsom/nykst",
      badge: "LIVE MAP",
    },
    {
      label: "FILES MAPPED",
      value: `${stats.analyzedFiles} files, ${stats.loc.toLocaleString()} lines`,
      badge: "READ FROM SOURCE",
    },
    {
      label: "CONNECTIONS",
      value: `${stats.internalEdges} links between files`,
      badge: "TRACED",
    },
    {
      label: "DATABASE",
      value: `${liveSelf?.resources.length ?? snapshotStats.resourceCount} tables and data sources linked to the code that uses them`,
      badge: "LINKED",
    },
    {
      label: "YOUR CONTROL",
      value: "You choose which repositories to connect, and you can remove access at any time",
      badge: "YOUR DATA",
    },
    {
      label: "SUPPORT",
      value: "A person reads every message and replies within 2 business days",
      badge: "HUMAN REPLY",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-x-clip">
      <SpotlightBackdrop accentState={loopAccent} />
      <CodeProblemInspector
        target={codeTarget}
        onClose={() => setCodeTarget(null)}
        onRunLoop={() => {
          setCodeTarget(null);
          window.setTimeout(() => {
            document
              .querySelector('[data-testid="safe-code-loop-engine"]')
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 60);
        }}
      />

      {advantages && <AdvantagesForm onClose={() => setAdvantages(false)} />}
      {contactOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setContactOpen(false)}
        >
          <div
            className="border-border bg-card relative w-full max-w-md rounded-2xl border p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => setContactOpen(false)}
              aria-label="Close contact panel"
              className="text-muted-foreground hover:text-foreground absolute top-4 right-4"
            >
              <X className="size-4" />
            </button>
            <p className="text-primary text-[10px] font-mono tracking-[0.24em] uppercase">
              Talk to the team
            </p>
            <h2 className="mt-2 text-xl font-semibold">Tell us about your system</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Running a large monorepo, several organizations, or a private deployment? We will walk
              through your setup personally and tell you what Nykst can see on day one.
            </p>
            <div className="border-primary/25 bg-primary/5 mt-5 rounded-xl border p-4">
              <p className="text-muted-foreground text-[11px] uppercase tracking-wide">Contact</p>
              <a
                href={mailtoHref("Plans and access")}
                className="text-primary mt-1 flex items-center gap-2 text-sm font-semibold hover:underline"
              >
                <Mail className="size-4" /> {CONTACT_EMAIL}
              </a>
            </div>
            <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
              Prefer self-serve? The plan registry on the pricing page shows every term before you
              sign in.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/subscribe"
                onClick={() => setContactOpen(false)}
                className="bg-primary text-primary-foreground hover:bg-primary-glow rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
              >
                See pricing
              </Link>
              <Link
                to="/subscribe"
                onClick={() => setContactOpen(false)}
                className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors"
              >
                Start 7-day trial
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />

      <ScrollProgress />
      <LandingHeader />

      {/* Live Telemetry Infinite Marquee */}
      <div className="relative z-20">
        <InfiniteMarquee items={marqueeItems} />
      </div>

      {/* Hero Section */}
      <section className="relative z-20 mx-auto max-w-6xl px-4 pt-8 pb-14 sm:px-6 sm:pt-12 sm:pb-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
          <div>
            <div
              className="animate-rise border-border/80 bg-surface/60 text-muted-foreground mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[9px] tracking-[0.16em] uppercase backdrop-blur-sm"
              style={{ animationDelay: "20ms" }}
            >
              <span className="relative flex size-1.5">
                <span className="bg-primary animate-live-dot absolute inline-flex size-full rounded-full" />
                <span className="bg-primary relative inline-flex size-1.5 rounded-full" />
              </span>
              <span>{stats.analyzedFiles} files mapped</span>
              <span className="text-border">/</span>
              <span>{liveSelf ? "Live analysis" : "Last compiled snapshot"}</span>
            </div>
            <h1 className="font-display max-w-[15ch] text-5xl leading-[0.96] font-semibold tracking-[-0.045em] text-foreground sm:text-6xl lg:text-7xl">
              <SplitText text="See what your next change will affect." />
            </h1>
            <p
              className="animate-rise text-muted-foreground mt-6 max-w-xl text-base leading-relaxed"
              style={{ animationDelay: "110ms" }}
            >
              A change that looks small can reach further than you think. Nykst maps every file,
              connection and database table in your repositories, then shows you exactly what that
              change will touch before you make it.
            </p>

            <div
              className="animate-rise mt-8 flex flex-col items-stretch gap-2.5 sm:flex-row sm:flex-wrap sm:items-center"
              style={{ animationDelay: "170ms" }}
            >
              <a
                href="/api/integrations/github/start"
                className="bg-primary text-primary-foreground hover:bg-primary-glow group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold shadow-[0_14px_40px_-18px_var(--primary)] transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_48px_-18px_var(--primary)] sm:w-auto"
              >
                <Github className="size-4 transition-transform duration-300 group-hover:-rotate-6" />
                Map my repository
              </a>
              <Link
                to="/graph"
                className="border-border bg-surface hover:bg-surface-2 group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border px-6 py-3.5 text-sm font-semibold transition-[background-color,border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/40 sm:w-auto"
              >
                Explore the live map
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
            <div
              className="animate-rise text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]"
              style={{ animationDelay: "220ms" }}
            >
              <span>7-day trial, cancel before day 8</span>
              <span className="text-border">/</span>
              <span>Read-only GitHub access</span>
              <button
                type="button"
                onClick={() => setAdvantages(true)}
                className="hover:text-foreground inline-flex min-h-9 items-center gap-1 font-medium transition-colors"
              >
                How we handle your code <ChevronRight className="size-3" />
              </button>
            </div>

            <ul
              className="animate-rise text-muted-foreground mt-7 grid gap-2 text-[11px] sm:grid-cols-2"
              style={{ animationDelay: "250ms" }}
            >
              {TRUST.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="bg-primary mt-1.5 size-1 shrink-0 rounded-full" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="animate-rise" style={{ animationDelay: "300ms" }}>
            <LandingGraphPreview
              data={previewData}
              isLive={Boolean(liveSelf)}
              onSelectDomain={(file) => scrollToWorkbench(file)}
              onRetry={() => void loadSelf()}
              retryLabel={selfError ? "Retry live analysis" : "Refresh live analysis"}
            />
            {selfError && (
              <p role="status" className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                The map above is the last compiled snapshot. The live refresh did not answer:{" "}
                {selfError}
              </p>
            )}
          </div>
        </div>

        {/* What the example map shows, read from real source. */}
        <div
          className="animate-rise border-border bg-border mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:mt-16 sm:grid-cols-3 lg:grid-cols-6"
          style={{ animationDelay: "300ms" }}
        >
          {[
            {
              value: stats.analyzedFiles,
              suffix: "",
              label: "Files mapped",
            },
            {
              value: stats.internalEdges,
              suffix: "",
              label: "Connections traced",
            },
            {
              value: stats.loc,
              suffix: "",
              label: "Lines of code mapped",
            },
            {
              value: liveSelf?.resources.length ?? snapshotStats.resourceCount,
              suffix: "",
              label: "Database tables linked",
            },
            {
              value: 6,
              suffix: "",
              label: "Levels to explore",
            },
            {
              value: stats.unresolvedImports,
              suffix: "",
              label: "Unresolved imports",
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-card/90 px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-2xl font-semibold tracking-tight">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} />
              </p>
              <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-[0.12em] uppercase">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground/80 mt-2.5 font-mono text-[10px]">
          Every number above is read from{" "}
          <code className="text-primary">{liveSelf?.repository ?? "flawsom/nykst"}</code>.{" "}
          {liveSelf ? "Live analysis in this page load." : "Last compiled snapshot."} Nothing is
          estimated or filled in.
        </p>
      </section>

      <WorksWith />

      {/* Live workbench and the six-level navigation */}
      <section
        id="architecture-engine"
        className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-16 sm:px-6 sm:py-24"
      >
        <BlurReveal>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <RepoSwitcherBar
              activeRepo={activeRepo ?? liveSelf?.repository ?? null}
              onSwitch={(repository) => {
                setActiveRepo(repository);
                setSelfError(null);
                void fetchWithTimeout(
                  `/api/analysis/self?repo=${encodeURIComponent(repository)}`,
                  { cache: "no-store" },
                  15_000,
                )
                  .then((response) => {
                    if (!response.ok)
                      throw new Error(`That repository answered with ${response.status}.`);
                    return response.json() as Promise<LiveSelfAnalysis>;
                  })
                  .then((data) => setLiveSelf(data))
                  .catch((error) => {
                    setSelfError(readableRequestError(error, "That repository could not be read."));
                  });
              }}
              onAnalyzed={(repository) => {
                setActiveRepo(repository);
              }}
            />
            <Link
              to="/graph"
              className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors"
            >
              Open the full graph <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <LiveGraphRagExplorer
            initialData={liveSelf}
            {...(activeRepo ? { activeRepo } : {})}
            onDataUpdate={setLiveSelf}
            onOpenCode={setCodeTarget}
            onLoopVerdict={(verdict) =>
              setLoopAccent(
                verdict === "breaking" ? "amber" : verdict === "simulating" ? "cyan" : "teal",
              )
            }
            loadError={selfError}
            onRetry={() => void loadSelf()}
          />
        </BlurReveal>
      </section>

      {/* 6 Levels of Navigation */}
      <section
        id="navigation"
        className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-16 sm:px-6 sm:py-24"
      >
        <BlurReveal>
          <div className="max-w-3xl">
            <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
              Primary navigation
            </p>
            <h2 className="font-display mt-3 text-3xl leading-[1.08] tracking-tight sm:text-4xl">
              The graph is the navigation, not a visualization.
            </h2>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed sm:text-base">
              Every click re-centers the graph on the node you clicked and reveals the architectural
              layer beneath it. The breadcrumb, the left tree, and the browser history state stay
              synchronized so you never lose your footing in a system with thousands of files.
            </p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LEVELS.map((level, index) => (
              <BlurReveal key={level.title} delayMs={index * 60} className="h-full">
                <div className="border-border bg-card/75 hover:border-primary/35 hover:bg-surface/80 group h-full rounded-2xl border p-5 transition-[transform,border-color,background-color,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_20px_60px_-36px_var(--primary)]">
                  <div className="flex items-center justify-between border-b border-border/70 pb-3">
                    <span className="text-muted-foreground group-hover:text-primary font-mono text-[10px] tracking-[0.18em] transition-colors">
                      LEVEL {level.level}
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold tracking-tight">{level.title}</h3>
                  <p className="text-primary/80 mt-1 text-[11px]">{level.count}</p>
                  <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{level.copy}</p>
                </div>
              </BlurReveal>
            ))}
          </div>
        </BlurReveal>
      </section>

      <ConsequenceTable />

      {/* Core Product Experiences */}
      <section className="relative z-20 mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <BlurReveal>
          <div className="mb-8 max-w-2xl">
            <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
              What you get
            </p>
            <h2 className="font-display mt-3 text-3xl leading-[1.08] tracking-tight sm:text-4xl">
              One system. Three ways to use it.
            </h2>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
              Start with the consequence of a change, keep the reasoning behind it, and carry both
              into the editor you already use.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <BlurReveal key={feature.title} delayMs={index * 70} className="h-full">
                <Link
                  to={feature.to}
                  className="border-border bg-card/75 group hover:border-primary/40 hover:bg-surface/80 flex h-full flex-col rounded-2xl border p-6 transition-[transform,border-color,background-color,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_-42px_var(--primary)]"
                >
                  <span className="text-muted-foreground/60 group-hover:text-primary font-mono text-[10px] tracking-[0.18em] transition-colors">
                    0{index + 1}
                  </span>
                  <h3 className="mt-5 text-base font-semibold tracking-tight">{feature.title}</h3>
                  <p className="text-muted-foreground mt-2 flex-1 text-xs leading-relaxed">
                    {feature.copy}
                  </p>
                  <span className="text-primary mt-5 inline-flex items-center gap-1.5 text-xs font-semibold">
                    {feature.link}
                    <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
              </BlurReveal>
            ))}
          </div>
        </BlurReveal>
      </section>

      {/* Evidence guides */}
      <section className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-14 sm:px-6 sm:py-20">
        <BlurReveal>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
                Check the evidence
              </p>
              <h2 className="font-display mt-3 text-3xl leading-[1.08] tracking-tight sm:text-4xl">
                Follow the proof, not the pitch.
              </h2>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                Three guides use the public Nykst example, cite the file and line, and state what
                the evidence does not cover. No account needed.
              </p>
            </div>
            <Link
              to="/docs"
              className="text-primary group inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold hover:underline"
            >
              All documentation
              <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-3">
            {[
              {
                to: "/guides/read-impact-proof" as const,
                title: "Read a change impact proof",
                copy: "Follow one real component from its definition through its importers, render sites and the tests that cover the chain.",
              },
              {
                to: "/guides/sql-migration-impact" as const,
                title: "Trace a SQL migration",
                copy: "See what a static read can prove about a column change across migrations, the schema and the parser, and where it stops.",
              },
              {
                to: "/guides/mcp-read-only" as const,
                title: "Use MCP without write access",
                copy: "Inspect token storage, account scope, revocation and the read-only annotation test behind all 11 tools.",
              },
            ].map((guide, index) => (
              <BlurReveal key={guide.to} delayMs={index * 70} className="h-full">
                <Link
                  to={guide.to}
                  className="border-border bg-card/75 hover:border-primary/40 hover:bg-surface/80 group flex h-full flex-col rounded-2xl border p-5 transition-[transform,border-color,background-color,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_-42px_var(--primary)]"
                >
                  <h3 className="text-sm font-semibold tracking-tight">{guide.title}</h3>
                  <p className="text-muted-foreground mt-2 flex-1 text-xs leading-relaxed">
                    {guide.copy}
                  </p>
                  <span className="text-primary mt-4 inline-flex items-center gap-1.5 text-xs font-semibold">
                    Read the guide
                    <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
              </BlurReveal>
            ))}
          </div>
        </BlurReveal>
      </section>

      {/* Connect Your Organization */}
      <section
        id="connect"
        className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-16 sm:px-6 sm:py-24"
      >
        <BlurReveal>
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div>
              <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
                Connect your repository
              </p>
              <h2 className="font-display mt-3 text-3xl leading-[1.08] tracking-tight sm:text-4xl">
                Three minutes to your first map.
              </h2>
              <p className="text-muted-foreground mt-4 max-w-lg text-sm leading-relaxed">
                Nykst reads the repositories you choose and builds the map itself. It never asks you
                to describe your architecture, and it never writes to your code.
              </p>

              <ol className="mt-8 space-y-4">
                {[
                  {
                    step: "1",
                    title: "Connect your GitHub account",
                    copy: "GitHub asks for access to the repositories you choose, including private ones. Nykst only reads them and never writes. You can remove access at any time.",
                  },
                  {
                    step: "2",
                    title: "Pick a repository",
                    copy: "Personal account or organization; public and private repositories are supported.",
                  },
                  {
                    step: "3",
                    title: "See your system map",
                    copy: "Nykst reads the files you approved and shows how they connect, including the database tables they use.",
                  },
                ].map((item) => (
                  <li key={item.step} className="flex gap-3">
                    <span className="border-primary/35 bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold">
                      {item.step}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                        {item.copy}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="bg-primary size-1 rounded-full" /> Never writes to your
                  repository
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="bg-primary size-1 rounded-full" /> Disconnect at any time
                </span>
              </div>
            </div>

            <div className="border-border bg-card/95 rounded-2xl border p-4 sm:p-6">
              <div className="border-primary/30 bg-secondary/40 rounded-xl border px-4 py-3">
                <span className="block text-sm font-medium">Connect GitHub</span>
                <span className="text-muted-foreground block text-[11px]">
                  Choose an organization and repository, or explore the example map of this site
                  first.
                </span>
              </div>

              {githubNotice && (
                <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
                  {githubNotice}
                </p>
              )}

              <GithubConnectPanel connected={githubConnected} onConnect={connect} />

              <div className="border-border bg-surface/70 mt-3 rounded-xl border px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="block text-sm font-medium">Explore before connecting?</span>
                    <span className="text-muted-foreground block text-[11px]">
                      Open the system map or the history view to see a real repository mapped out
                      before you connect your own.
                    </span>
                  </div>
                  <Link
                    to="/graph"
                    className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 shrink-0 rounded-lg border px-4 py-2 text-center text-xs font-semibold transition-colors"
                  >
                    Explore the example map →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </BlurReveal>
      </section>

      {/* Plans, read from the live public registry. */}
      <section
        id="plans"
        className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-16 sm:px-6 sm:py-24"
      >
        <BlurReveal>
          <PlansPreview onContact={() => setContactOpen(true)} />
        </BlurReveal>
      </section>

      <BlurReveal>
        <LandingFaq />
      </BlurReveal>

      {/* Bottom CTA */}
      <section className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-14 sm:px-6 sm:py-20">
        <BlurReveal className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
              Map your first repository.
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
              Tell us about your codebase, or connect GitHub now and see the map of your own code.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/subscribe"
              className="bg-primary text-primary-foreground hover:bg-primary-glow group inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_-24px_var(--primary)]"
            >
              Start 7-day trial
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              to="/graph"
              className="border-border bg-surface hover:bg-surface-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-[background-color,border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/40"
            >
              Open the live map
            </Link>
          </div>
        </BlurReveal>
      </section>

      {/* Footer */}
      <footer className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_1.85fr] lg:gap-16">
          <div>
            <NykstBrand subtitle="software system intelligence" size={28} />
            <p className="text-muted-foreground mt-4 max-w-xs text-xs leading-relaxed">
              Know the blast radius before you change the code. Built from your real repository,
              with a file and line behind every answer.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="border-primary/25 bg-primary/10 text-primary rounded-full border px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] uppercase">
                Read-only by construction
              </span>
              <span className="border-border bg-surface text-muted-foreground rounded-full border px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] uppercase">
                No training on your code
              </span>
            </div>
            <a
              href="https://github.com/flawsom/nykst"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground mt-5 inline-flex items-center gap-1.5 text-[11px] transition-colors"
            >
              <Github className="size-3.5" /> Source on GitHub
            </a>
          </div>

          <nav
            aria-label="Footer navigation"
            className="grid grid-cols-2 gap-x-6 gap-y-8 text-[11px] sm:grid-cols-4"
          >
            <div className="space-y-2.5">
              <p className="text-foreground font-mono text-[9px] tracking-[0.18em] uppercase">
                Product
              </p>
              <Link to="/graph" className="text-muted-foreground hover:text-foreground block">
                System map
              </Link>
              <Link
                to="/intelligence"
                className="text-muted-foreground hover:text-foreground block"
              >
                History
              </Link>
              <Link to="/mcp" className="text-muted-foreground hover:text-foreground block">
                Developers
              </Link>
              <Link to="/subscribe" className="text-muted-foreground hover:text-foreground block">
                Plans
              </Link>
            </div>
            <div className="space-y-2.5">
              <p className="text-foreground font-mono text-[9px] tracking-[0.18em] uppercase">
                Resources
              </p>
              <Link to="/docs" className="text-muted-foreground hover:text-foreground block">
                Docs
              </Link>
              <Link to="/status" className="text-muted-foreground hover:text-foreground block">
                Status
              </Link>
              <Link to="/changelog" className="text-muted-foreground hover:text-foreground block">
                Changelog
              </Link>
              <Link to="/limits" className="text-muted-foreground hover:text-foreground block">
                Limits
              </Link>
            </div>
            <div className="space-y-2.5">
              <p className="text-foreground font-mono text-[9px] tracking-[0.18em] uppercase">
                Company
              </p>
              <Link
                to="/partnerships"
                className="text-muted-foreground hover:text-foreground block"
              >
                Partnerships
              </Link>
              <Link to="/privacy" className="text-muted-foreground hover:text-foreground block">
                Privacy
              </Link>
              <button
                onClick={() => setContactOpen(true)}
                className="text-muted-foreground hover:text-foreground block text-left"
              >
                Contact
              </button>
            </div>
            <div className="space-y-2.5">
              <p className="text-foreground font-mono text-[9px] tracking-[0.18em] uppercase">
                Trust
              </p>
              <a
                href={mailtoHref("Privacy request")}
                className="text-muted-foreground hover:text-foreground block break-all"
              >
                {CONTACT_EMAIL}
              </a>
              <span className="text-muted-foreground block">Read-only GitHub access</span>
              <span className="text-muted-foreground block">Nothing written back</span>
            </div>
          </nav>
        </div>

        <div className="border-border/70 text-muted-foreground/70 mt-10 flex flex-col gap-3 border-t pt-5 text-[10px] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Nykst. Built in India.</p>
          <p className="max-w-2xl leading-relaxed">
            Nykst reads only the repositories you choose and stores a map of how they fit together.
            Your code stays in your GitHub account, and you can remove access at any time.
          </p>
        </div>
      </footer>
    </main>
  );
}
