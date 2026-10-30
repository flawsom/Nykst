import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Box,
  Boxes,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  Database,
  FileCode2,
  Layers3,
  Lock,
  Mail,
  Plug,
  Server,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { GithubConnectPanel } from "@/components/graph/GithubConnectPanel";
import { LandingGraphPreview } from "@/components/graph/LandingGraphPreview";
import {
  LiveGraphRagExplorer,
  type LiveSelfAnalysis,
} from "@/components/graph/LiveGraphRagExplorer";
import { PreRegisterForm } from "@/components/graph/PreRegisterForm";
import { AdvantagesForm } from "@/components/graph/AdvantagesForm";
import { ApiSettingsButton } from "@/components/graph/ApiSettings";
import { RepoSwitcherBar } from "@/components/graph/RepoSwitcherBar";

import snapshotStats from "@/lib/analysis/self-snapshot-stats.json";
import { CONTACT_EMAIL, mailtoHref } from "@/lib/contact";

import { CodeProblemInspector, type CodeTarget } from "@/components/graph/CodeProblemInspector";
import {
  AnimatedCounter,
  BlurReveal,
  InfiniteMarquee,
  Magnetic,
  ScrambleText,
  SpotlightBackdrop,
  TiltCard,
} from "@/components/motion/VariantMotion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nykst · See what your next change will affect" },
      {
        name: "description",
        content:
          "Connect your repositories and get one map of how your system fits together. See every file, service and database table a change will touch before you make it.",
      },
      {
        property: "og:title",
        content: "Nykst · See what your next change will affect",
      },
      {
        property: "og:description",
        content:
          "One map of your system, built from your real code. See what a change will touch before you make it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const LEVELS = [
  {
    icon: Building2,
    level: "01",
    title: "Organization",
    count: "Everything in one place",
    copy: "All of your repositories, services, databases and the people who work on them, seen together.",
  },
  {
    icon: Layers3,
    level: "02",
    title: "System area",
    count: "How your code is actually organised",
    copy: "The parts your system really divides into, read from the directories and connections in your code rather than a document someone has to maintain.",
  },
  {
    icon: Boxes,
    level: "03",
    title: "What it does",
    count: "Grouped by what depends on it",
    copy: "What each part is responsible for, ordered by how much of the rest of your system relies on it.",
  },
  {
    icon: Server,
    level: "04",
    title: "Services and data",
    count: "External services and database tables",
    copy: "The external services you call and the database tables you use, linked to the places in your code that touch them.",
  },
  {
    icon: Box,
    level: "05",
    title: "Module",
    count: "Files that belong together",
    copy: "The internal boundaries inside each part: request handlers, helpers, and shared utilities.",
  },
  {
    icon: FileCode2,
    level: "06",
    title: "File",
    count: "What it exports and what uses it",
    copy: "For any single file: what it exports, who imports it, which pages or endpoints reach it, and which tests cover it.",
  },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Know what a change will touch",
    copy: "Before you edit a file, see every place that depends on it, which pages and endpoints are affected, and which tests cover it.",
    link: "Open the navigator",
    to: "/graph",
  },
  {
    icon: BrainCircuit,
    title: "Keep the reasons, not just the code",
    copy: "Decisions, past incidents and team conventions stay attached to the parts of the system they explain, so the next person does not start from zero.",
    link: "Explore system memory",
    to: "/intelligence",
  },
  {
    icon: Plug,
    title: "Use it where you already work",
    copy: "Ask the same questions from your editor or coding assistant, so the answer arrives before the code is written.",
    link: "Set up your coding assistant",
    to: "/mcp",
  },
];

const TRUST = [
  { icon: Lock, label: "You choose which repositories to connect" },
  { icon: Cpu, label: "Built from your real code, not a diagram" },
  { icon: Database, label: "Database tables linked to the code that uses them" },
  { icon: ShieldCheck, label: "Nothing written back to your repositories" },
];

function Landing() {
  const [preRegister, setPreRegister] = useState(false);
  const [advantages, setAdvantages] = useState(false);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [codeTarget, setCodeTarget] = useState<CodeTarget | null>(null);
  const [loopAccent, setLoopAccent] = useState<"teal" | "cyan" | "amber">("teal");
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubNotice, setGithubNotice] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [liveSelf, setLiveSelf] = useState<LiveSelfAnalysis | null>(null);

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

    void fetch("/api/integrations/github/organizations")
      .then((response) => {
        if (active && response.ok) setGithubConnected(true);
      })
      .catch(() => undefined);

    void fetch("/api/analysis/self")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LiveSelfAnalysis | null) => {
        if (active && data) {
          setLiveSelf(data);
          setActiveRepo((current) => current ?? data.repository);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const connect = () => {
    window.location.assign("/api/integrations/github/start");
  };

  const scrollToWorkbench = (sampleFile?: string) => {
    if (sampleFile) {
      void fetch(`/api/analysis/self?path=${encodeURIComponent(sampleFile)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: LiveSelfAnalysis | null) => {
          if (data) setLiveSelf(data);
        });
    }
    document.getElementById("live-workbench")?.scrollIntoView({ behavior: "smooth" });
  };

  // Before the client fetch resolves, render the committed snapshot. An invented
  // fallback here used to print 156 files and 22,797 LOC on a 237 file tree, so
  // the page contradicted both the graph and the README.
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
    <main className="relative min-h-screen overflow-hidden">
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

      {preRegister && <PreRegisterForm onClose={() => setPreRegister(false)} />}
      {advantages && <AdvantagesForm onClose={() => setAdvantages(false)} />}
      {contactOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setContactOpen(false)}
        >
          <div
            className="border-border bg-card relative w-full max-w-md rounded-2xl border p-6 shadow-2xl"
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
              <button
                onClick={() => {
                  setContactOpen(false);
                  setPreRegister(true);
                }}
                className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors"
              >
                Request access instead
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span
          className="aurora size-[520px]"
          style={{ background: "var(--primary)", opacity: 0.16, top: "-14%", left: "-8%" }}
        />
        <span
          className="aurora size-[420px]"
          style={{
            background: "var(--node-capability)",
            opacity: 0.12,
            top: "22%",
            right: "-10%",
            animationDelay: "-6s",
          }}
        />
        <span
          className="aurora size-[380px]"
          style={{
            background: "var(--node-service)",
            opacity: 0.1,
            bottom: "-12%",
            left: "34%",
            animationDelay: "-11s",
          }}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-grid" />

      {/* Top Executive Navigation */}
      <header className="relative z-20 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <Link to="/" className="group flex items-center gap-2.5">
          <NykstBrand subtitle="See what your change will touch" size={32} />
        </Link>
        <nav className="flex w-full items-center gap-1 overflow-x-auto pb-0.5 text-xs sm:w-auto sm:gap-1.5 sm:text-sm">
          <a
            href="#architecture-engine"
            className="text-muted-foreground hover:text-foreground hover:bg-surface hidden shrink-0 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-colors md:inline-flex"
          >
            How it works
          </a>
          <Link
            to="/graph"
            className="text-muted-foreground hover:text-foreground hover:bg-surface shrink-0 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-colors"
          >
            System map
          </Link>
          <Link
            to="/intelligence"
            className="text-muted-foreground hover:text-foreground hover:bg-surface shrink-0 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-colors"
          >
            History
          </Link>
          <Link
            to="/mcp"
            className="text-muted-foreground hover:text-foreground hover:bg-surface shrink-0 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-colors"
          >
            Developers
          </Link>
          <Link
            to="/subscribe"
            className="text-muted-foreground hover:text-foreground hover:bg-surface shrink-0 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-colors"
          >
            Plans
          </Link>
          <ApiSettingsButton />
          <Magnetic strength={0.18}>
            <button
              onClick={() => setPreRegister(true)}
              className="bg-primary text-primary-foreground hover:bg-primary-glow glow-ring ml-1 shrink-0 rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              Get access
            </button>
          </Magnetic>
        </nav>
      </header>

      {/* Live Telemetry Infinite Marquee */}
      <div className="relative z-20">
        <InfiniteMarquee items={marqueeItems} />
      </div>

      {/* Hero Section */}
      <section className="relative z-20 mx-auto max-w-6xl px-4 pt-8 pb-14 sm:px-6 sm:pt-12 sm:pb-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
          <div>
            <div className="animate-rise inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3 py-1 font-mono text-[10px] tracking-[0.22em] uppercase text-primary">
              <span className="bg-primary size-1.5 rounded-full animate-pulse" />
              <ScrambleText text="A MAP OF YOUR SYSTEM, FROM YOUR REAL CODE" durationMs={750} />
            </div>
            <h1
              className="animate-rise text-gradient mt-4 max-w-[19ch] text-4xl leading-[1.04] font-semibold tracking-tight sm:mt-5 sm:text-5xl md:text-6xl"
              style={{ animationDelay: "60ms" }}
            >
              See what your next change will affect.
            </h1>
            <p
              className="animate-rise text-muted-foreground mt-5 max-w-xl text-sm leading-relaxed sm:text-base"
              style={{ animationDelay: "130ms" }}
            >
              A change that looks small can reach further than you think. Nykst maps every file,
              connection and database table in your repositories, then shows you exactly what a
              change will touch before you make it.
            </p>

            <div
              className="animate-rise mt-7 flex flex-col items-stretch gap-2.5 sm:flex-row sm:flex-wrap sm:items-center"
              style={{ animationDelay: "190ms" }}
            >
              <Magnetic strength={0.2}>
                <Link
                  to="/graph"
                  className="bg-primary text-primary-foreground hover:bg-primary-glow magic-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold shadow-lg shadow-primary/20 sm:w-auto"
                >
                  Open the example map <ArrowRight className="size-4" />
                </Link>
              </Magnetic>
              <Magnetic strength={0.16}>
                <button
                  onClick={connect}
                  className="border-border bg-surface hover:bg-surface-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-6 py-3.5 text-sm font-semibold transition-colors sm:w-auto"
                >
                  Connect GitHub
                </button>
              </Magnetic>
              <button
                onClick={() => scrollToWorkbench()}
                className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-4 py-3.5 text-xs font-semibold transition-colors sm:w-auto"
              >
                <Activity className="size-3.5" /> See a live example
              </button>
              <button
                onClick={() => setAdvantages(true)}
                className="text-muted-foreground hover:text-foreground inline-flex w-full items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors sm:w-auto"
              >
                Why teams use Nykst <ChevronRight className="size-3.5" />
              </button>
            </div>

            <ul
              className="animate-rise text-muted-foreground mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[11px]"
              style={{ animationDelay: "240ms" }}
            >
              {TRUST.map((item) => (
                <li key={item.label} className="flex items-center gap-1.5">
                  <item.icon className="text-primary size-3.5" />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <LandingGraphPreview
            className="animate-rise"
            liveData={liveSelf}
            onSelectDomain={(file) => scrollToWorkbench(file)}
          />
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
              value: 1,
              suffix: "",
              label: "Example repository to explore",
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
          <code className="text-primary">{liveSelf?.repository ?? "the example repository"}</code>.
          Nothing is estimated or filled in.
        </p>
      </section>

      {/* NEW: Sticky Scroll-Storytelling Graph-RAG Architecture & Live AST Workbench */}
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
                void fetch(`/api/analysis/self?repo=${encodeURIComponent(repository)}`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((data: LiveSelfAnalysis | null) => {
                    if (data) setLiveSelf(data);
                  });
              }}
              onAnalyzed={(repository) => {
                setActiveRepo(repository);
                void fetch(`/api/analysis/self?repo=${encodeURIComponent(repository)}`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((data: LiveSelfAnalysis | null) => {
                    if (data) setLiveSelf(data);
                  });
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
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              The graph is the navigation, not a visualization.
            </h2>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed sm:text-base">
              Every click re-centers the graph on the node you clicked and reveals the architectural
              layer beneath it. The breadcrumb, the left tree, and the browser history state stay
              synchronized so you never lose your footing in a system with thousands of files.
            </p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LEVELS.map((level) => (
              <TiltCard
                key={level.title}
                className="border-border bg-card/75 card-3d group rounded-2xl border p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="border-border bg-surface text-muted-foreground flex size-9 items-center justify-center rounded-lg border">
                    <level.icon className="text-primary size-4" />
                  </span>
                  <span className="text-muted-foreground/60 font-mono text-[10px] tracking-[0.2em]">
                    LVL {level.level}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-semibold tracking-tight">{level.title}</h3>
                <p className="text-primary/80 mt-0.5 font-mono text-[10px]">{level.count}</p>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{level.copy}</p>
              </TiltCard>
            ))}
          </div>
        </BlurReveal>
      </section>

      {/* Core Product Experiences */}
      <section className="relative z-20 mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="grid gap-3 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <TiltCard
              key={feature.title}
              className="border-border bg-card/75 card-3d group rounded-2xl border"
            >
              <Link to={feature.to} className="flex h-full flex-col p-6">
                <span className="border-primary/30 bg-primary/10 flex size-10 items-center justify-center rounded-xl border">
                  <feature.icon className="text-primary size-5" />
                </span>
                <h3 className="mt-5 text-base font-semibold tracking-tight">{feature.title}</h3>
                <p className="text-muted-foreground mt-2 flex-1 text-xs leading-relaxed">
                  {feature.copy}
                </p>
                <span className="text-primary mt-5 inline-flex items-center gap-1.5 text-xs font-semibold">
                  {feature.link}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* Connect Your Organization */}
      <section
        id="connect"
        className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-16 sm:px-6 sm:py-24"
      >
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
              Connect your repository
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
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
                <Lock className="text-primary size-3.5" /> Never writes to your repository
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="text-primary size-3.5" /> Disconnect at any time
              </span>
            </div>
          </div>

          <div
            className="border-border bg-card/95 rounded-2xl border p-4 sm:p-6"
            style={{ boxShadow: "var(--shadow-panel)" }}
          >
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
      </section>

      {/* Pricing Section */}
      <section className="relative z-20 mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div
          className="border-primary/20 bg-card/80 relative overflow-hidden rounded-3xl border p-6 sm:p-10"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          <div className="pointer-events-none absolute inset-0 bg-grid" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
                Plans
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Start with the map. Keep the memory.
              </h2>
              <p className="text-muted-foreground mt-3 max-w-lg text-sm leading-relaxed">
                Nykst is open for early access. We set your workspace up with you, connect your
                first repository, and agree the right plan before anything starts.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  to="/subscribe"
                  className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
                >
                  Talk to us about access <ArrowRight className="size-4" />
                </Link>
                <button
                  onClick={() => setContactOpen(true)}
                  className="border-border bg-surface hover:bg-surface-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors"
                >
                  Talk to us
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              {(
                [
                  ["One repository", "Everything you need to map it and keep its history."],
                  ["A whole team", "One shared map, so nobody has to reconstruct context alone."],
                  [
                    "Your own setup",
                    "Tell us what you need and we will agree it with you in writing.",
                  ],
                ] as const
              ).map(([title, copy]) => (
                <div
                  key={title}
                  className="border-border bg-surface/80 rounded-xl border px-4 py-3"
                >
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">{copy}</p>
                </div>
              ))}
              <p className="text-muted-foreground text-[10px] leading-relaxed">
                No payment is taken on this site. You agree a plan with us before anything starts,
                and you can stop at any time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Map your first repository.
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
              Tell us about your codebase, or connect GitHub now and see the map of your own code.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPreRegister(true)}
              className="bg-primary text-primary-foreground hover:bg-primary-glow rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
            >
              Request access
            </button>
            <button
              onClick={() => setAdvantages(true)}
              className="border-border bg-surface hover:bg-surface-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-colors"
            >
              Advantages of using Nykst
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <NykstBrand subtitle="software system intelligence" size={26} />
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[11px]">
            <Link to="/graph" className="text-muted-foreground hover:text-foreground">
              {" "}
              System map
            </Link>
            <Link to="/intelligence" className="text-muted-foreground hover:text-foreground">
              History
            </Link>
            <Link to="/mcp" className="text-muted-foreground hover:text-foreground">
              Developers
            </Link>
            <Link to="/subscribe" className="text-muted-foreground hover:text-foreground">
              Plans
            </Link>
            <Link to="/docs" className="text-muted-foreground hover:text-foreground">
              Docs
            </Link>
            <Link to="/status" className="text-muted-foreground hover:text-foreground">
              Status
            </Link>
            <Link to="/changelog" className="text-muted-foreground hover:text-foreground">
              Changelog
            </Link>
            <Link to="/partnerships" className="text-muted-foreground hover:text-foreground">
              Partnerships
            </Link>
            <button
              onClick={() => setContactOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              Contact
            </button>
          </nav>
        </div>
        <p className="text-muted-foreground/60 mt-5 max-w-2xl text-[10px] leading-relaxed">
          Nykst reads only the repositories you choose and stores a map of how they fit together.
          Your code stays in your GitHub account, and you can remove access at any time.
        </p>
      </footer>
    </main>
  );
}
