import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ConnectionProgress } from "@/components/graph/ConnectionProgress";
import { PreRegisterForm } from "@/components/graph/PreRegisterForm";
import { ROLES, getRoleId, setRoleId, type RoleId } from "@/lib/access";
import { cn } from "@/lib/utils";
import { Network, Database, Cpu, GitBranch, BookOpen, ShieldAlert, Sparkles, CheckCircle2, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nykst — System Navigator for Software Organizations" },
      {
        name: "description",
        content:
          "Nykst is a system navigator: connect your org and explore domains, capabilities, services, modules and files as one living software graph.",
      },
      { property: "og:title", content: "Nykst — System Navigator for Software Organizations" },
      {
        property: "og:description",
        content:
          "Connect GitHub, GitLab, Bitbucket or Azure DevOps and navigate your entire system as a graph.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const providers = [
  { id: "github", name: "GitHub", hint: "Cloud & Enterprise Server" },
  { id: "gitlab", name: "GitLab", hint: "SaaS & Self-managed" },
  { id: "bitbucket", name: "Bitbucket", hint: "Cloud & Data Center" },
  { id: "azure", name: "Azure DevOps", hint: "Repos & Pipelines" },
];

interface Pillar {
  id: string;
  title: string;
  tagline: string;
  icon: any;
  what: string;
  how: string;
  why: string;
}

const PILLARS: Pillar[] = [
  {
    id: "system-understanding",
    title: "System Understanding",
    tagline: "Not just one file, but the whole system",
    icon: Network,
    what: "A continuous AST-to-graph synthesis engine that parses every repository, cross-repo API contract, and shared dependency in your enterprise simultaneously, moving past isolated file buffers into a unified organizational ontology.",
    how: "Nykst crawls your connected GitHub/GitLab repositories, building a living, multi-layered topology from Domains and Capabilities down to Services, Modules, and Symbols without requiring manual documentation.",
    why: "Engineers never suffer from local tunnel vision. Decisions are made with total system awareness, eliminating accidental cascading failures across microservice boundaries."
  },
  {
    id: "persistent-memory",
    title: "Persistent System Memory",
    tagline: "Institutional knowledge that never fades",
    icon: Database,
    what: "The immutable historical data vault storing structural baselines, API contracts, incident resolutions, and multi-repo linkages over time.",
    how: "Nykst maintains a 24/7 memory index that records every architectural shift, structural dependency change, and verified human patch across your entire engineering organization.",
    why: "Institutional knowledge is never lost when engineers leave. The AI and your team retain a permanent, infallible institutional memory of how the codebase evolved and why decisions were made."
  },
  {
    id: "change-intelligence",
    title: "Change Intelligence",
    tagline: "Predictive impact analysis before commit",
    icon: GitBranch,
    what: "Real-time analysis of pull requests, commits, and proposed patches against the living organizational graph to calculate exact blast radius before merge.",
    how: "Every time code is modified, Nykst instantly evaluates incoming dependency changes, dependent services, affected teams, and downstream API contracts.",
    why: "Prevents silent breaking changes and regression bugs before they hit staging or production, slashing code review cycles and production incidents."
  },
  {
    id: "consequences-simulation",
    title: "Consequences Simulation",
    tagline: "Simulate side-effects according to company data",
    icon: Cpu,
    what: "A virtual sandbox environment that simulates code modifications, schema migrations, and refactorings against your organization's real dependency and traffic patterns.",
    how: "By leveraging your repository's actual AST models and historical failure logs, Nykst runs deterministic virtual simulations to predict runtime side-effects and concurrency bottlenecks.",
    why: "Eliminates the fear of touching legacy code. Teams can test monumental refactors and architectural shifts in seconds with guaranteed predictability."
  },
  {
    id: "company-aware-dev",
    title: "Company-Aware Development",
    tagline: "AI aligned with your custom engineering standards",
    icon: Sparkles,
    what: "AI-assisted generation and refactoring governed strictly by your team's custom coding standards, monad patterns, and architectural decision records (ADRs).",
    how: "Nykst indexes your team's behavioral preferences and coding styles, aligning every generated patch or recommendation with your enterprise conventions.",
    why: "Generates clean, production-ready code that feels like it was written by your most senior staff engineers, eliminating generic or non-compliant AI boilerplate."
  },
  {
    id: "reality-checking",
    title: "Continuously Reality Checking",
    tagline: "Zero architectural drift between docs and code",
    icon: CheckCircle2,
    what: "Automated, real-time auditing that detects architectural drift between your documentation, PRs, and actual deployed code structure.",
    how: "Nykst continuously compares live AST references with your repository linkage maps, flagging orphaned endpoints, undocumented dependencies, and policy violations instantly.",
    why: "Documentation never goes stale. Your system architecture remains 100% truthful, verifiable, and transparent 24/7."
  },
  {
    id: "organizational-learning",
    title: "Organizational Learning",
    tagline: "Self-improving active learning pipelines",
    icon: BookOpen,
    what: "A self-improving active learning pipeline that separates clean, production-grade code from quarantined workarounds to continuously train organizational models.",
    how: "Through tree-split active learning, Nykst rewards high-performance coding patterns while using historical bug fixes and quarantined anti-patterns for negative reinforcement.",
    why: "Your internal intelligence engine gets smarter every week, adapting precisely to your engineering velocity and architectural maturity."
  },
  {
    id: "autonomous-reasoning",
    title: "Autonomous System Reasoning",
    tagline: "Expert senior architectural guidance on demand",
    icon: ShieldAlert,
    what: "An expert senior architectural assistant capable of reasoning across your entire enterprise codebase to answer deep dependency, ownership, and design questions.",
    how: "Combining global graph context with instruction-tuning memory and historical runbooks, Nykst reasons through complex architectural queries with absolute precision.",
    why: "Onboarding new engineers takes days instead of months, and complex architectural investigations are resolved in seconds through natural language conversation."
  }
];

function Landing() {
  const navigate = useNavigate();
  const [provider, setProvider] = useState("github");
  const [org, setOrg] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<RoleId>("engineer");
  const [connecting, setConnecting] = useState(false);
  const [preRegister, setPreRegister] = useState(false);
  const [activePillar, setActivePillar] = useState<string>(PILLARS[0]!.id);

  useEffect(() => {
    setUser(localStorage.getItem("nykst.user"));
    setRole(getRoleId());
  }, []);

  const login = () => {
    const name = "engineer@nykst.dev";
    localStorage.setItem("nykst.user", name);
    setUser(name);
  };

  const logout = () => {
    localStorage.removeItem("nykst.user");
    setUser(null);
  };

  const chooseRole = (id: RoleId) => {
    setRole(id);
    setRoleId(id);
  };

  const connect = () => {
    const slug = org.trim() || "acme";
    if (typeof window !== "undefined") {
      localStorage.setItem("nykst.org", slug);
      localStorage.setItem("nykst.provider", provider);
    }
    setConnecting(true);
  };

  const currentPillar = PILLARS.find((p) => p.id === activePillar) || PILLARS[0]!;
  const IconComponent = currentPillar.icon;

  return (
    <main className="relative min-h-screen overflow-hidden">
      {connecting && (
        <ConnectionProgress
          provider={providers.find((p) => p.id === provider)?.name ?? provider}
          org={org.trim() || "acme"}
          onDone={() => navigate({ to: "/graph" })}
        />
      )}

      {preRegister && <PreRegisterForm onClose={() => setPreRegister(false)} />}

      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span
          className="aurora size-[520px]"
          style={{ background: "var(--primary)", opacity: 0.18, top: "-14%", left: "-8%" }}
        />
        <span
          className="aurora size-[420px]"
          style={{
            background: "var(--node-capability)",
            opacity: 0.14,
            top: "22%",
            right: "-10%",
            animationDelay: "-6s",
          }}
        />
        <span
          className="aurora size-[380px]"
          style={{
            background: "var(--node-service)",
            opacity: 0.12,
            bottom: "-12%",
            left: "34%",
            animationDelay: "-11s",
          }}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-grid" />

      <header className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary block size-2.5 rounded-full" />
          <span className="text-[15px] font-semibold tracking-[0.24em] uppercase">Nykst</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            to="/graph"
            className="text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Open graph →
          </Link>
          <Link
            to="/intelligence"
            className="text-primary hover:underline transition-colors font-medium flex items-center gap-1"
          >
            <Sparkles className="size-3.5" /> Intelligence Core →
          </Link>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground hidden font-mono text-xs sm:inline">
                {user}
              </span>
              <button
                onClick={logout}
                className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              >
                Log out
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Log in
            </button>
          )}
          <button
            onClick={() => setPreRegister(true)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow glow-ring rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Pre-register
          </button>
        </nav>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-24">
        <p className="animate-rise text-primary text-xs tracking-[0.3em] uppercase">
          Software intelligence & system navigation
        </p>
        <h1
          className="animate-rise text-gradient mt-6 max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight md:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          The system navigator for your software organization.
        </h1>
        <p
          className="animate-rise text-muted-foreground mt-6 max-w-xl text-base leading-relaxed"
          style={{ animationDelay: "160ms" }}
        >
          Connect your organization once. Nykst analyzes the codebase itself and renders it as a
          living graph — core domains, capabilities, services, modules, down to a single file. No
          folder browsing. No guesswork.
        </p>

        <div
          className="animate-rise mt-8 flex flex-wrap items-center gap-3"
          style={{ animationDelay: "200ms" }}
        >
          <button
            onClick={() => setPreRegister(true)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow lift hover:lift-hover rounded-xl px-5 py-3 text-sm font-semibold"
          >
            Pre-register for early access
          </button>
          <span className="text-muted-foreground text-xs">
            Two minutes. Nine questions. We read every answer.
          </span>
        </div>

        <div
          className="animate-rise text-muted-foreground mt-10 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11px]"
          style={{ animationDelay: "220ms" }}
        >
          <span>14 core domains derived</span>
          <span>128 repositories parsed</span>
          <span>214 services mapped</span>
          <span>299,600 files indexed</span>
        </div>

        <div
          className="animate-rise border-border bg-card/70 mt-14 max-w-3xl rounded-2xl border p-6 backdrop-blur"
          style={{ animationDelay: "240ms", boxShadow: "var(--shadow-panel)" }}
        >
          <h2 className="text-sm font-medium">Connect your organization</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Nykst installs read-only and derives the graph itself — we never ask you to describe your
            architecture.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left transition-all",
                  provider === p.id
                    ? "border-primary bg-secondary"
                    : "border-border bg-surface hover:bg-surface-2",
                )}
              >
                <span className="block text-sm font-medium">{p.name}</span>
                <span className="text-muted-foreground block text-[11px]">{p.hint}</span>
              </button>
            ))}
          </div>

          <div className="mt-5">
            <label
              htmlFor="org"
              className="text-muted-foreground text-[11px] tracking-widest uppercase"
            >
              Your organization
            </label>
            <div className="border-border bg-surface mt-2 flex items-center gap-2 rounded-xl border px-3 py-2.5">
              <span className="text-muted-foreground font-mono text-xs">
                {provider === "azure" ? "dev.azure.com/" : `${provider}.com/`}
              </span>
              <input
                id="org"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder="your-org"
                className="placeholder:text-muted-foreground/60 min-w-0 flex-1 bg-transparent text-sm outline-none font-mono"
              />
            </div>
            <p className="text-muted-foreground mt-2 text-[11px]">
              Nykst reads every repository in this organization and builds the graph from the code
              itself.
            </p>
          </div>

          <div className="mt-5">
            <span className="text-muted-foreground text-[11px] tracking-widest uppercase">
              Your role in this organization
            </span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => chooseRole(r.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition-all",
                    role === r.id
                      ? "border-primary bg-secondary"
                      : "border-border bg-surface hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-center justify-between text-sm font-medium">
                    {r.name}
                    <span className="text-muted-foreground text-[10px] tracking-widest uppercase font-mono">
                      {r.can.viewAllDomains ? "All domains" : `${r.domains.length} domains`}
                    </span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[11px] leading-relaxed">
                    {r.blurb}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={connect}
            className="bg-primary text-primary-foreground hover:bg-primary-glow mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors"
          >
            Install Nykst & analyze codebase
          </button>
        </div>

        {/* 8 PILLARS SECTION WITH INTERACTIVE Q&A */}
        <div className="mt-24">
          <div className="max-w-xl">
            <span className="text-primary text-xs tracking-[0.3em] uppercase font-mono">
              The 8 Pillars of Nykst
            </span>
            <h2 className="text-2xl font-semibold tracking-tight mt-2">
              Capabilities & Architectural Foundations
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Click on any pillar below to explore what it is, how it works with your organization, and why it matters.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Pillar Selector Buttons */}
            <div className="lg:col-span-5 grid grid-cols-1 gap-2.5">
              {PILLARS.map((p) => {
                const Icon = p.icon;
                const isSelected = activePillar === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePillar(p.id)}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between",
                      isSelected
                        ? "bg-primary/15 border-primary shadow-md text-foreground font-semibold"
                        : "border-border bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg border", isSelected ? "bg-primary/20 border-primary/40 text-primary" : "bg-surface border-border text-muted-foreground")}>
                        <Icon className="size-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium leading-tight">{p.title}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[240px] font-mono">{p.tagline}</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-primary">→</span>
                  </button>
                );
              })}
            </div>

            {/* Interactive Pillar Q&A Display Card */}
            <div className="lg:col-span-7 border-border bg-card/90 rounded-2xl border p-8 backdrop-blur shadow-xl space-y-6">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="p-3 rounded-xl bg-primary/20 border border-primary/40 text-primary">
                  <IconComponent className="size-6" />
                </div>
                <div>
                  <span className="text-xs font-mono text-primary uppercase tracking-wider">Nykst Pillar</span>
                  <h3 className="text-xl font-semibold text-foreground">{currentPillar.title}</h3>
                </div>
              </div>

              <div className="space-y-5 text-sm leading-relaxed">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary font-mono flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" /> What is this?
                  </h4>
                  <p className="text-muted-foreground pl-3 border-l-2 border-primary/30">
                    {currentPillar.what}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary font-mono flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" /> How does it work with your organization?
                  </h4>
                  <p className="text-muted-foreground pl-3 border-l-2 border-primary/30">
                    {currentPillar.how}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary font-mono flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" /> Why does it matter?
                  </h4>
                  <p className="text-muted-foreground pl-3 border-l-2 border-primary/30">
                    {currentPillar.why}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          id="extension"
          className="border-border bg-card/70 mt-20 flex flex-wrap items-center justify-between gap-5 rounded-2xl border p-6 backdrop-blur"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          <div className="max-w-lg">
            <h2 className="text-sm font-medium">Nykst inside your editor</h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              Install the extension to open any file's node, dependencies and blast radius from VS
              Code or JetBrains — the same graph, without switching context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="#extension"
              className="border-border bg-surface hover:bg-surface-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Download for VS Code
            </a>
            <a
              href="#extension"
              className="border-border bg-surface hover:bg-surface-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Download for JetBrains
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
