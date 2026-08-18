import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ConnectionProgress } from "@/components/graph/ConnectionProgress";
import { PreRegisterForm } from "@/components/graph/PreRegisterForm";
import { ROLES, getRoleId, setRoleId, type RoleId } from "@/lib/access";
import { cn } from "@/lib/utils";
import { Network, Database, Cpu, GitBranch, BookOpen, ShieldAlert, Sparkles, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nykst — The Holy Grail of Software Intelligence" },
      {
        name: "description",
        content:
          "Nykst is the definitive system navigator for software organizations. Experience living software graphs, persistent memory, and autonomous reasoning.",
      },
      { property: "og:title", content: "Nykst — The Holy Grail of Software Intelligence" },
      {
        property: "og:description",
        content:
          "Connect GitHub, GitLab, Bitbucket or Azure DevOps and operate your entire engineering enterprise through autonomous intelligence.",
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
    tagline: "Total enterprise omniscience across millions of lines",
    icon: Network,
    what: "A transcendent AST synthesis engine that dissolves repository boundaries, ingesting hundreds of disparate microservices, cross-repo API contracts, and hidden dependencies into a singular, living organizational ontology.",
    how: "Nykst connects read-only to your git infrastructure, performing deep topological parsing to map the exact neurological network of your enterprise from high-level domains down to individual atomic functions in real time.",
    why: "Monolithic complexity destroys human intuition. Nykst restores absolute clarity, ensuring that no engineer ever operates in blind isolation again."
  },
  {
    id: "persistent-memory",
    title: "Persistent System Memory",
    tagline: "An infallible institutional immune system",
    icon: Database,
    what: "The permanent cognitive core of your engineering organization. It captures structural baselines, API contracts, historical regressions, and multi-repo linkages into an immutable memory vault that never forgets.",
    how: "Operating 24/7 as a background cognitive layer, Nykst records every architectural evolution, dependency shift, and verified human patch, indexing them against your exact enterprise telemetry.",
    why: "Institutional brain drain is the silent killer of hyper-growth startups. When key engineers leave, their wisdom remains permanently locked inside Nykst's memory vault."
  },
  {
    id: "change-intelligence",
    title: "Change Intelligence",
    tagline: "Prophetic blast radius calculation before code touches main",
    icon: GitBranch,
    what: "An omniscient preview engine that intercepts pull requests and computes the exact ripple effects of any proposed code modification across downstream services, API consumers, and team boundaries before a single line is merged.",
    how: "By instantly cross-referencing incoming AST diffs with live dependency graphs, Nykst simulates downstream repercussions with mathematical certainty.",
    why: "Eliminates catastrophic production outages and silent regressions, turning chaotic code reviews into friction-free, deterministic governance."
  },
  {
    id: "consequences-simulation",
    title: "Consequences Simulation",
    tagline: "Deterministic reality-testing powered by your enterprise data",
    icon: Cpu,
    what: "A quantum-grade virtual sandbox that simulates complex architectural refactors, database migrations, and concurrency locks against your company's actual traffic patterns and data models.",
    how: "Nykst constructs isolated execution models using your repository's exact AST structure and historical failure vault, running high-fidelity simulations of system stress.",
    why: "Fear of legacy code paralyzes engineering velocity. With Nykst, your teams test monumental system overhauls with 100% predictability before touching production."
  },
  {
    id: "company-aware-dev",
    title: "Company-Aware Development",
    tagline: "AI that thinks like your most elite staff engineers",
    icon: Sparkles,
    what: "Autonomous code generation and refactoring governed strictly by your organization's unique ethos, custom design patterns, error monads, and architectural decision records (ADRs).",
    how: "Nykst continuously absorbs your team's behavioral preferences and coding philosophy, ensuring that every AI-generated intervention aligns flawlessly with your internal standards.",
    why: "Generic AI produces generic tech debt. Nykst generates bespoke, immaculate code that respects your enterprise DNA from day one."
  },
  {
    id: "reality-checking",
    title: "Continuously Reality Checking",
    tagline: "Absolute synchronization between documentation and reality",
    icon: CheckCircle2,
    what: "An automated cognitive watchdog that eradicates architectural drift by continuously auditing live codebases against documentation, API contracts, and team declarations in real time.",
    how: "Nykst performs continuous background reconciliation between actual AST nodes and architectural runbooks, instantly flagging orphaned endpoints or undocumented dependencies.",
    why: "Documentation is universally dead on arrival. Nykst ensures your enterprise blueprint is eternally alive, truthful, and self-auditing."
  },
  {
    id: "organizational-learning",
    title: "Organizational Learning",
    tagline: "A self-improving cognitive engine that compounds daily",
    icon: BookOpen,
    what: "A self-optimizing learning pipeline that autonomously separates pristine production-grade code from quarantined anti-patterns, compounding your organization's engineering intelligence every single day.",
    how: "Using advanced tree-split reinforcement, Nykst rewards elite architectural patterns while weaponizing past historical bugs as negative reinforcement vectors for future generation.",
    why: "Your competitors are trapped in linear progress. Nykst puts your engineering organization on an exponential compounding curve of velocity and resilience."
  },
  {
    id: "autonomous-reasoning",
    title: "Autonomous System Reasoning",
    tagline: "An elite principal architect available 24/7",
    icon: ShieldAlert,
    what: "A sovereign AI architectural intelligence capable of reasoning across your entire multi-repo ecosystem to answer profound design questions, diagnose complex deadlocks, and architect solutions instantly.",
    how: "Powered by unified graph context, instruction-tuning memory, and historical failure vaults, Nykst reasons through complex engineering dilemmas with visionary clarity.",
    why: "Onboarding months of tribal knowledge is compressed into minutes. Complex architectural roadblocks vanish the moment they are encountered."
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
        <p className="animate-rise text-primary text-xs tracking-[0.3em] uppercase font-mono">
          The Holy Grail of Software Intelligence
        </p>
        <h1
          className="animate-rise text-gradient mt-6 max-w-4xl text-5xl leading-[1.05] font-semibold tracking-tight md:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          Operating software enterprises through absolute intelligence.
        </h1>
        <p
          className="animate-rise text-muted-foreground mt-6 max-w-2xl text-base leading-relaxed"
          style={{ animationDelay: "160ms" }}
        >
          Connect your organization once. Nykst dissolves repository boundaries, fusing your entire enterprise into an omniscient living graph backed by persistent memory, predictive simulation, and sovereign AI reasoning.
        </p>

        <div
          className="animate-rise mt-8 flex flex-wrap items-center gap-3"
          style={{ animationDelay: "200ms" }}
        >
          <button
            onClick={() => setPreRegister(true)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow lift hover:lift-hover rounded-xl px-6 py-3.5 text-sm font-semibold shadow-lg shadow-primary/20"
          >
            Pre-register for early access
          </button>
          <span className="text-muted-foreground text-xs font-mono">
            Two minutes. Nine questions. Shaping the future of software.
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
            Nykst installs read-only and derives the enterprise graph autonomously — zero manual configuration required.
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
              Nykst reads every repository in this organization and builds the sovereign intelligence graph from the code itself.
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
            className="bg-primary text-primary-foreground hover:bg-primary-glow mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors shadow-md shadow-primary/20"
          >
            Install Nykst & analyze codebase
          </button>
        </div>

        {/* 8 PILLARS SECTION WITH HOLY GRAIL INTERACTIVE Q&A */}
        <div className="mt-28">
          <div className="max-w-2xl">
            <span className="text-primary text-xs tracking-[0.3em] uppercase font-mono">
              The 8 Pillars of Nykst
            </span>
            <h2 className="text-3xl font-semibold tracking-tight mt-2 text-foreground">
              The Architecture of Software Omniscience
            </h2>
            <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
              Click on any foundational pillar below to discover how Nykst redefines software engineering from the ground up.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
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
                        ? "bg-primary/20 border-primary shadow-lg text-foreground font-semibold"
                        : "border-border bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg border", isSelected ? "bg-primary/30 border-primary text-primary" : "bg-surface border-border text-muted-foreground")}>
                        <Icon className="size-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium leading-tight">{p.title}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[240px] font-mono">{p.tagline}</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-primary font-bold">→</span>
                  </button>
                );
              })}
            </div>

            {/* Interactive Pillar Q&A Display Card */}
            <div className="lg:col-span-7 border-border bg-card/95 rounded-2xl border p-8 backdrop-blur shadow-2xl space-y-6">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="p-3 rounded-xl bg-primary/25 border border-primary/50 text-primary shadow-inner">
                  <IconComponent className="size-6" />
                </div>
                <div>
                  <span className="text-xs font-mono text-primary uppercase tracking-widest font-semibold">Holy Grail Pillar</span>
                  <h3 className="text-2xl font-semibold text-foreground tracking-tight">{currentPillar.title}</h3>
                </div>
              </div>

              <div className="space-y-6 text-sm leading-relaxed">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary font-mono flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary animate-pulse" /> What is this?
                  </h4>
                  <p className="text-foreground/90 pl-3 border-l-2 border-primary/40 font-normal">
                    {currentPillar.what}
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary font-mono flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary animate-pulse" /> How does it work with your organization?
                  </h4>
                  <p className="text-foreground/90 pl-3 border-l-2 border-primary/40 font-normal">
                    {currentPillar.how}
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary font-mono flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary animate-pulse" /> Why does it matter?
                  </h4>
                  <p className="text-foreground/90 pl-3 border-l-2 border-primary/40 font-normal">
                    {currentPillar.why}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          id="extension"
          className="border-border bg-card/70 mt-24 flex flex-wrap items-center justify-between gap-5 rounded-2xl border p-6 backdrop-blur"
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
