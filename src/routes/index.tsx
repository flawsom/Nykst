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
      { title: "Nykst — System Navigator for Software Organizations" },
      {
        name: "description",
        content:
          "Nykst is the definitive system navigator for software organizations. Experience living software graphs, persistent memory, and autonomous reasoning.",
      },
      { property: "og:title", content: "Nykst — System Navigator for Software Organizations" },
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
  reasoning: string;
  example: string;
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
    reasoning: "Software acts as a single organic ecosystem, yet organizations treat it as isolated silos of files. True system understanding dissolves repository boundaries, fusing disparate microservices into a unified neurological map.",
    example: "A developer modifies a field in a shared utility library inside Repo A. Nykst instantly calculates and visualizes how this change silently alters a data transformation pipeline in Repo B's billing service and impacts a legacy reporting tool in Repo C that hasn't been touched in three years.",
    what: "A continuous AST synthesis engine that ingests every repository, cross-repo API contract, and shared dependency simultaneously.",
    how: "Nykst crawls your git infrastructure in read-only mode, constructing a multi-layered topological ontology from core domains down to atomic functions.",
    why: "Engineers never operate in blind isolation, eliminating accidental cascading failures across service boundaries."
  },
  {
    id: "persistent-memory",
    title: "Persistent System Memory",
    tagline: "An infallible institutional immune system",
    icon: Database,
    reasoning: "In engineering, institutional knowledge is the only asset that depreciates when employees leave. Persistent memory captures every architectural evolution, ensuring that the wisdom of past engineers remains permanently embedded in the system.",
    example: "A critical production race condition occurs at 3 AM. Instead of paging a retired founder or searching through fragmented Slack threads, Nykst instantly recalls a nearly identical incident from 2021, displays the exact human patch that resolved it, and warns why the current PR re-introduces that exact vulnerability.",
    what: "The permanent cognitive core storing structural baselines, API contracts, historical regressions, and multi-repo linkages over time.",
    how: "Maintains a 24/7 background memory index recording every architectural shift, dependency modification, and verified human patch.",
    why: "Institutional brain drain is neutralized; your team retains an infallible, permanent memory of how your software evolved."
  },
  {
    id: "change-intelligence",
    title: "Change Intelligence",
    tagline: "Prophetic blast radius calculation before code touches main",
    icon: GitBranch,
    reasoning: "Most catastrophic outages stem from 'safe' changes. Change Intelligence replaces subjective code reviews with deterministic impact calculations before a single line is merged.",
    example: "You propose renaming an internal API endpoint. Nykst flags that a partner's webhook—managed in a completely external repository—relies on that exact signature, preemptively averting a million-dollar integration failure.",
    what: "Real-time analysis of pull requests and commits against the living organizational graph to calculate exact blast radius.",
    how: "Interception of PR diffs to instantly evaluate incoming dependency changes, affected downstream services, and public API contracts.",
    why: "Slashing code review friction while eliminating silent regressions and production incidents."
  },
  {
    id: "consequences-simulation",
    title: "Consequences Simulation",
    tagline: "Deterministic reality-testing powered by your enterprise data",
    icon: Cpu,
    reasoning: "Refactoring legacy code is paralyzed by the fear of unknown side-effects. Consequences simulation acts as a time machine, allowing teams to test monumental architectural shifts in a risk-free virtual sandbox.",
    example: "You want to migrate a core service from REST to gRPC. Nykst simulates the migration against your actual production traffic logs and dependency models, predicting that while latency drops by 40%, memory pressure on your load balancer will spike by 15% during peak hours.",
    what: "A virtual sandbox environment that simulates code modifications and refactorings against real traffic and dependency patterns.",
    how: "Leveraging repository AST models and historical failure vaults to run high-fidelity simulations of system concurrency and load.",
    why: "Unlocks fearless engineering velocity, enabling massive architectural overhauls with 100% predictability."
  },
  {
    id: "company-aware-dev",
    title: "Company-Aware Development",
    tagline: "AI that thinks like your most elite staff engineers",
    icon: Sparkles,
    reasoning: "Generic LLMs are trained on average internet code, generating generic technical debt. Company-aware development binds AI generation strictly to your organization's unique design philosophy and architectural standards.",
    example: "You prompt the AI for a database connection handler. Instead of returning generic boilerplate, Nykst generates a wrapper that automatically implements your company's custom retry logic, circuit breakers, and telemetry decorators—exactly as your principal engineers mandate.",
    what: "AI-assisted generation and refactoring governed strictly by your custom coding standards, monad patterns, and ADRs.",
    how: "Nykst indexes team behavioral preferences and coding styles, aligning every generated patch with enterprise conventions.",
    why: "Ensures AI output is production-ready and native to your codebase from the first commit."
  },
  {
    id: "reality-checking",
    title: "Continuously Reality Checking",
    tagline: "Absolute synchronization between documentation and reality",
    icon: CheckCircle2,
    reasoning: "The biggest lie in software engineering is the static architecture diagram. Continuous reality checking enforces automated synchronization, ensuring that reality and documentation never drift apart.",
    example: "Your official documentation states that 'Service A never communicates directly with Service B.' Nykst detects a PR introducing a direct database query across those boundaries and blocks the merge for policy violation before human review even begins.",
    what: "Automated, real-time auditing detecting architectural drift between documentation, PRs, and deployed code.",
    how: "Continuous background reconciliation between live AST nodes and architectural runbooks, flagging orphaned endpoints instantly.",
    why: "Eradicates stale documentation and maintains a 100% truthful, verifiable enterprise blueprint."
  },
  {
    id: "organizational-learning",
    title: "Organizational Learning",
    tagline: "A self-improving cognitive engine that compounds daily",
    icon: BookOpen,
    reasoning: "Mistakes are expensive; repeating them is inexcusable. Organizational learning turns historical bugs and successful patches into compounding automated guardrails.",
    example: "A developer attempts a workaround that mirrors an anti-pattern causing a 2-hour outage last year. Nykst instantly intercepts the commit, flags the historical incident, and suggests the approved 'Gold Standard' pattern established by the architecture board.",
    what: "A self-improving active learning pipeline separating clean production code from quarantined workarounds.",
    how: "Using tree-split reinforcement to reward elite patterns while weaponizing past regressions as negative reinforcement vectors.",
    why: "Puts your engineering organization on an exponential compounding curve of resilience and velocity."
  },
  {
    id: "autonomous-reasoning",
    title: "Autonomous System Reasoning",
    tagline: "An elite principal architect available 24/7",
    icon: ShieldAlert,
    reasoning: "The ultimate bottleneck in software engineering is human context-switching across millions of lines of code. Autonomous reasoning removes this bottleneck entirely.",
    example: "You ask Nykst: 'Why is our checkout flow failing intermittently for users in São Paulo?' Nykst reasons across four repositories, identifies a timezone-sensitive date parser in a shared library, and points to the exact commit where the logic diverged from global standards.",
    what: "A sovereign AI architectural intelligence capable of reasoning across multi-repo ecosystems to solve complex design challenges.",
    how: "Combining global graph context with instruction-tuning memory and historical runbooks to answer deep architectural queries.",
    why: "Compresses months of onboarding into minutes and resolves complex roadblocks in seconds."
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
          System Intelligence & Organizational Navigation
        </p>
        <h1
          className="animate-rise text-gradient mt-6 max-w-4xl text-5xl leading-[1.05] font-semibold tracking-tight md:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          The system navigator for your software organization.
        </h1>
        <p
          className="animate-rise text-muted-foreground mt-6 max-w-2xl text-base leading-relaxed"
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
            className="bg-primary text-primary-foreground hover:bg-primary-glow lift hover:lift-hover rounded-xl px-6 py-3.5 text-sm font-semibold shadow-lg shadow-primary/20"
          >
            Pre-register for early access
          </button>
          <span className="text-muted-foreground text-xs font-mono">
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
            className="bg-primary text-primary-foreground hover:bg-primary-glow mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors shadow-md shadow-primary/20"
          >
            Install Nykst & analyze codebase
          </button>
        </div>

        {/* 8 PILLARS SECTION WITH DEEP REASONING & MIND-BLOWING EXAMPLES */}
        <div className="mt-28">
          <div className="max-w-2xl">
            <span className="text-primary text-xs tracking-[0.3em] uppercase font-mono">
              Core Capabilities
            </span>
            <h2 className="text-3xl font-semibold tracking-tight mt-2 text-foreground">
              The 8 Pillars of Nykst
            </h2>
            <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
              Select any pillar below to explore the deep architectural reasoning, real-world examples, and technical derivation behind how Nykst powers your engineering organization.
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

            {/* Interactive Pillar Detailed Display Card */}
            <div className="lg:col-span-7 border-border bg-card/95 rounded-2xl border p-8 backdrop-blur shadow-2xl space-y-6">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="p-3 rounded-xl bg-primary/25 border border-primary/50 text-primary shadow-inner">
                  <IconComponent className="size-6" />
                </div>
                <div>
                  <span className="text-xs font-mono text-primary uppercase tracking-widest font-semibold">Architectural Pillar</span>
                  <h3 className="text-2xl font-semibold text-foreground tracking-tight">{currentPillar.title}</h3>
                </div>
              </div>

              <div className="space-y-6 text-sm leading-relaxed">
                {/* Deep Reasoning */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary font-mono flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary" /> Deep Reasoning
                  </h4>
                  <p className="text-foreground/90 pl-3 border-l-2 border-primary/40 font-normal leading-relaxed">
                    {currentPillar.reasoning}
                  </p>
                </div>

                {/* Perfect Mind-blowing Example */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary font-mono flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary" /> Real-World Impact & Example
                  </h4>
                  <div className="bg-surface/85 border border-border rounded-xl p-4 text-foreground/90 font-mono text-xs leading-relaxed">
                    {currentPillar.example}
                  </div>
                </div>

                {/* Brief Derivation (What, How, Why) */}
                <div className="border-t border-border pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="font-semibold text-primary block mb-1 font-mono uppercase tracking-wider">What it is</span>
                    <p className="text-muted-foreground leading-relaxed">{currentPillar.what}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-primary block mb-1 font-mono uppercase tracking-wider">How it works</span>
                    <p className="text-muted-foreground leading-relaxed">{currentPillar.how}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-primary block mb-1 font-mono uppercase tracking-wider">Why it matters</span>
                    <p className="text-muted-foreground leading-relaxed">{currentPillar.why}</p>
                  </div>
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
