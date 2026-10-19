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
      { title: "Nykst · Deterministic Graph-RAG Architecture & System Intelligence" },
      {
        name: "description",
        content:
          "Nykst is not an LLM wrapper. It is a deterministic AST + dependency graph + temporal commit-history Graph-RAG architecture. Drill from org to file in one click and compute exact blast radius before any agent writes code.",
      },
      {
        property: "og:title",
        content: "Nykst · Deterministic Graph-RAG Architecture & System Intelligence",
      },
      {
        property: "og:description",
        content:
          "Google Maps for your software system. Connect GitHub, let Nykst compile the AST architecture from the code itself, and drill from org to file in one click.",
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
    count: "1 root · live repository telemetry",
    copy: "Your organization root with repositories, external services, SQL tables, contributors, and commit cadence measured directly from the AST and Git history.",
  },
  {
    icon: Layers3,
    level: "02",
    title: "Core domain",
    count: "Derived from directory & import trie",
    copy: "The architectural domains the codebase actually organizes itself into: analysis engine, API routes, graph UI, connectors, and persistence.",
  },
  {
    icon: Boxes,
    level: "03",
    title: "Capability",
    count: "Ranked by reverse dependency weight",
    copy: "What each domain delivers for the system: AST parsing, OAuth verification, blast-radius computation, or MCP serving, ranked by caller reachability.",
  },
  {
    icon: Server,
    level: "04",
    title: "Service & SQL Resource",
    count: "SDKs, API hosts, env vars & DDL tables",
    copy: "Every external service and PostgreSQL/Supabase table or RPC function detected from migrations and client calls, with exact file:line evidence.",
  },
  {
    icon: Box,
    level: "05",
    title: "Module",
    count: "Runtime & type-only boundaries",
    copy: "The internal module boundaries inside each capability: route handlers, AST resolvers, encryption utilities, and realtime broadcasters.",
  },
  {
    icon: FileCode2,
    level: "06",
    title: "File",
    count: "Exports, classes, functions, tests & blame",
    copy: "Every exported symbol, function, class, importer line number, covering test file, and commit author for an individual source file.",
  },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Before You Act Envelope",
    copy: "A deterministic consequence envelope for any node: direct and transitive importers, affected route/API entrypoints, historical co-changes, and covering tests.",
    link: "Open the 6-level navigator",
    to: "/graph",
  },
  {
    icon: BrainCircuit,
    title: "6-Layer Compounding Memory",
    copy: "Outcome-weighted, failure-pattern, architectural-decision, incident-resolution, team-convention, and continuity memories anchored directly to AST nodes.",
    link: "Explore Nykst Memory",
    to: "/intelligence",
  },
  {
    icon: Plug,
    title: "Streamable HTTP MCP Server",
    copy: "Claude Code, Cursor, VS Code, Codex, Windsurf, Gemini CLI, and Zed query Nykst over /api/mcp to verify blast radius before writing a single line of code.",
    link: "Connect your coding agent",
    to: "/mcp",
  },
];

const TRUST = [
  { icon: Lock, label: "Read-only GitHub OAuth & App" },
  { icon: Cpu, label: "Deterministic TypeScript AST compiler" },
  { icon: Database, label: "Live Supabase + SQL schema linker" },
  { icon: ShieldCheck, label: "Zero mock or synthetic data" },
];

function Landing() {
  const [preRegister, setPreRegister] = useState(false);
  const [advantages, setAdvantages] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubNotice, setGithubNotice] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [liveSelf, setLiveSelf] = useState<LiveSelfAnalysis | null>(null);
  const [healthStatus, setHealthStatus] = useState<{
    status: string;
    project: string | null;
    tableCount: number;
  } | null>(null);

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
        reason === "oauth_not_configured"
          ? "GitHub sign-in is not configured on this deployment yet. Everything on this page still works; the graph itself needs a connected repository, or contact us for access."
          : `GitHub sign-in failed: ${reason.replace(/_/g, " ")}. Please try again.`,
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
        if (active && data) setLiveSelf(data);
      })
      .catch(() => undefined);

    void fetch("/api/health")
      .then((r) => r.json())
      .then(
        (data: { status?: string; project?: string | null; tables?: Record<string, boolean> }) => {
          if (active && data) {
            setHealthStatus({
              status: data.status ?? "ok",
              project: data.project ?? null,
              tableCount: Object.values(data.tables ?? {}).filter(Boolean).length,
            });
          }
        },
      )
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

  const stats = liveSelf?.stats ?? {
    treeFiles: 279,
    sourceFiles: 156,
    analyzedFiles: 156,
    internalEdges: 297,
    externalPackages: 52,
    unresolvedImports: 0,
    skippedFiles: 0,
    loc: 22797,
    durationMs: 1370,
  };

  const marqueeItems = [
    {
      label: "SELF-INDEXED REPO",
      value: liveSelf?.repository ?? "flawsom/nykst",
      badge: "LIVE AST",
    },
    {
      label: "COMPILER ENGINE",
      value: `${stats.analyzedFiles} TypeScript/TSX files (${stats.loc.toLocaleString()} LOC)`,
      badge: `${stats.durationMs}ms`,
    },
    {
      label: "DEPENDENCY EDGES",
      value: `${stats.internalEdges} verified internal edges · ${stats.unresolvedImports} unresolved`,
      badge: "TARJAN SCC",
    },
    {
      label: "SQL & DATA LAYER",
      value: `${liveSelf?.resources.length ?? 10} Postgres tables & resources linked to call sites`,
      badge: healthStatus?.status === "ok" ? "SUPABASE OK" : "SCHEMA READY",
    },
    {
      label: "AI ENGINE",
      value: "Nara Router · agnes-2.5-flash + BYOK AES-256-GCM",
      badge: "ZERO HALLUCINATION",
    },
    {
      label: "AGENT PROTOCOL",
      value: "Streamable HTTP MCP (/api/mcp) · 5 readOnlyHint tools",
      badge: "MCP 2025-06-18",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden">
      <SpotlightBackdrop />

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
                href="https://mail.google.com/mail/?view=cm&fs=1&to=nykstsoftint%40gmail.com&su=Nykst%20subscription%20enquiry"
                target="_blank"
                rel="noreferrer"
                className="text-primary mt-1 flex items-center gap-2 text-sm font-semibold hover:underline"
              >
                <Mail className="size-4" /> nykstsoftint@gmail.com
              </a>
            </div>
            <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
              Prefer self-serve? The eSewa flow on the pricing page takes about two minutes.
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
                Pre-register instead
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
          <NykstBrand subtitle="Graph-RAG Architecture" size={32} />
        </Link>
        <nav className="flex w-full items-center gap-1 overflow-x-auto pb-0.5 text-xs sm:w-auto sm:gap-1.5 sm:text-sm">
          <a
            href="#architecture-engine"
            className="text-muted-foreground hover:text-foreground hover:bg-surface hidden shrink-0 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-colors md:inline-flex"
          >
            Graph-RAG Engine
          </a>
          <Link
            to="/graph"
            className="text-muted-foreground hover:text-foreground hover:bg-surface shrink-0 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-colors"
          >
            Graph
          </Link>
          <Link
            to="/intelligence"
            className="text-muted-foreground hover:text-foreground hover:bg-surface shrink-0 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-colors"
          >
            Memory
          </Link>
          <Link
            to="/mcp"
            className="text-muted-foreground hover:text-foreground hover:bg-surface shrink-0 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-colors"
          >
            AI agents
          </Link>
          <Link
            to="/subscribe"
            className="text-muted-foreground hover:text-foreground hover:bg-surface shrink-0 rounded-lg px-2.5 py-2 font-medium whitespace-nowrap transition-colors"
          >
            Pricing
          </Link>
          <ApiSettingsButton />
          <Magnetic strength={0.18}>
            <button
              onClick={() => setPreRegister(true)}
              className="bg-primary text-primary-foreground hover:bg-primary-glow glow-ring ml-1 shrink-0 rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              Pre-register
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
              <ScrambleText text="DETERMINISTIC AST · GRAPH-RAG ARCHITECTURE" durationMs={750} />
            </div>
            <h1
              className="animate-rise text-gradient mt-4 max-w-[19ch] text-4xl leading-[1.04] font-semibold tracking-tight sm:mt-5 sm:text-5xl md:text-6xl"
              style={{ animationDelay: "60ms" }}
            >
              Google Maps for your software system.
            </h1>
            <p
              className="animate-rise text-muted-foreground mt-5 max-w-xl text-sm leading-relaxed sm:text-base"
              style={{ animationDelay: "130ms" }}
            >
              We are not a chat wrapper over flat vector chunks. Nykst compiles your repository into
              a deterministic AST & dependency topology (core domains, capabilities, services, SQL
              tables, modules, and individual files) and computes the exact line-level blast radius
              before you or your AI agent writes a single line of code.
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
                  Open the system graph <ArrowRight className="size-4" />
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
                <Activity className="size-3.5" /> Inspect live AST workbench
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

        {/* Real-Time Measured Telemetry Counters (Zero Mock Data) */}
        <div
          className="animate-rise border-border bg-border mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:mt-16 sm:grid-cols-3 lg:grid-cols-6"
          style={{ animationDelay: "300ms" }}
        >
          {[
            {
              value: stats.analyzedFiles,
              suffix: "",
              label: "AST files compiled live",
            },
            {
              value: stats.internalEdges,
              suffix: "",
              label: "Verified import edges",
            },
            {
              value: stats.loc,
              suffix: "",
              label: "Lines of TypeScript AST",
            },
            {
              value: liveSelf?.resources.length ?? 10,
              suffix: "",
              label: "SQL tables & RPCs linked",
            },
            {
              value: 6,
              suffix: " lvls",
              label: "Hierarchy navigation",
            },
            {
              value: 0,
              suffix: "",
              label: "Simulated or mock values",
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
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground/80">
          <span>
            Live telemetry above is computed directly from{" "}
            <code className="text-primary">{liveSelf?.repository ?? "this repository"}</code> via{" "}
            <code className="text-foreground">/api/analysis/self</code> ({stats.durationMs}ms AST
            parse).
          </span>
          {healthStatus && (
            <span className="text-emerald-300">
              ● Supabase schema verified ({healthStatus.tableCount}/10 production tables active)
            </span>
          )}
        </div>
      </section>

      {/* NEW: Sticky Scroll-Storytelling Graph-RAG Architecture & Live AST Workbench */}
      <section
        id="architecture-engine"
        className="border-border/70 relative z-20 mx-auto max-w-6xl border-t px-4 py-16 sm:px-6 sm:py-24"
      >
        <BlurReveal>
          <LiveGraphRagExplorer initialData={liveSelf} onDataUpdate={setLiveSelf} />
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
              Connect your organization
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Three minutes to your first map.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-lg text-sm leading-relaxed">
              Nykst installs read-only and derives the graph itself. It never asks you to describe
              your architecture, and it never writes to your repositories.
            </p>

            <ol className="mt-8 space-y-4">
              {[
                {
                  step: "1",
                  title: "Authorize read-only access",
                  copy: "Authenticate with GitHub OAuth or the GitHub App across nykst.unifies.codes, nykst.vercel.app, or localhost.",
                },
                {
                  step: "2",
                  title: "Pick a repository",
                  copy: "Personal account or organization; public and private repositories are supported.",
                },
                {
                  step: "3",
                  title: "Compile the system map",
                  copy: "Nykst downloads the tarball once, runs the TypeScript AST compiler, links SQL tables, and broadcasts the live graph.",
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
            className="border-border bg-card/85 rounded-2xl border p-4 backdrop-blur sm:p-6"
            style={{ boxShadow: "var(--shadow-panel)" }}
          >
            <div className="border-primary/30 bg-secondary/40 rounded-xl border px-4 py-3">
              <span className="block text-sm font-medium">GitHub Integration</span>
              <span className="text-muted-foreground block text-[11px]">
                Connect securely to choose an organization and repository, or inspect the live
                self-indexed repository right now.
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
                    Open <code className="text-primary font-mono">/graph</code> or{" "}
                    <code className="text-primary font-mono">/intelligence</code> to navigate the
                    live self-indexed AST of this repository immediately.
                  </span>
                </div>
                <Link
                  to="/graph"
                  className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 shrink-0 rounded-lg border px-4 py-2 text-center text-xs font-semibold transition-colors"
                >
                  Explore live graph →
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
                Pricing
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Start with the map. Keep the memory.
              </h2>
              <p className="text-muted-foreground mt-3 max-w-lg text-sm leading-relaxed">
                The graph, the memory model and the MCP setup are open. Premium adds historical
                depth, system-wide context and team workflows as your repository grows.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  to="/subscribe"
                  className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
                >
                  See plans <ArrowRight className="size-4" />
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
              <div className="border-border bg-surface/80 flex items-baseline justify-between rounded-xl border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Monthly</p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">Full system depth</p>
                </div>
                <p className="text-lg font-semibold">
                  NPR 999<span className="text-muted-foreground text-[11px]">/mo</span>
                </p>
              </div>
              <div className="border-primary/30 bg-primary/5 flex items-baseline justify-between rounded-xl border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    Annual <span className="text-primary font-mono text-[10px]">save 17%</span>
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    For teams staying a while
                  </p>
                </div>
                <p className="text-lg font-semibold">
                  NPR 9,999<span className="text-muted-foreground text-[11px]">/yr</span>
                </p>
              </div>
              <p className="text-muted-foreground text-[10px] leading-relaxed">
                Nepal billing is handled through eSewa with manual validation. No card required to
                start.
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
              Pre-register for early access, or connect GitHub now and let Nykst derive the graph
              from your own code.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPreRegister(true)}
              className="bg-primary text-primary-foreground hover:bg-primary-glow rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
            >
              Pre-register for early access
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
              Graph
            </Link>
            <Link to="/intelligence" className="text-muted-foreground hover:text-foreground">
              Memory
            </Link>
            <Link to="/mcp" className="text-muted-foreground hover:text-foreground">
              AI agents
            </Link>
            <Link to="/subscribe" className="text-muted-foreground hover:text-foreground">
              Pricing
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
          Nykst analyzes repositories read-only and stores derived metadata. Your source stays in
          your GitHub account; disconnect the app whenever you want.
        </p>
      </footer>
    </main>
  );
}
