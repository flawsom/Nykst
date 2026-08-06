import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ConnectionProgress } from "@/components/graph/ConnectionProgress";
import { PreRegisterForm } from "@/components/graph/PreRegisterForm";
import { ROLES, getRoleId, setRoleId, type RoleId } from "@/lib/access";
import { cn } from "@/lib/utils";



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

const features = [
  ["System navigator", "Move through your organization the way you move through a map — never folders."],
  ["Derived, not declared", "We read code, commits and ownership to infer domains and capabilities."],
  ["Drill to a single file", "Domain → capability → service → module → file, each re-centering the graph."],
  ["Dossier on every node", "Health, risk, blast radius, classes, functions, lines, issues, incidents."],
  ["Impact before change", "See dependencies, dependents and predicted blast radius up front."],
  ["Ask AI in context", "Question any node about ownership, risk and impact without leaving the graph."],
];

function Landing() {
  const navigate = useNavigate();
  const [provider, setProvider] = useState("github");
  const [org, setOrg] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<RoleId>("engineer");
  const [connecting, setConnecting] = useState(false);
  const [preRegister, setPreRegister] = useState(false);


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
          <a
            href="#extension"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Editor extension
          </a>
          <Link
            to="/graph"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Open graph →
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
              className="bg-primary text-primary-foreground hover:bg-primary-glow rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              Log in
            </button>
          )}
        </nav>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-24">
        <p className="animate-rise text-primary text-xs tracking-[0.3em] uppercase">
          Software infrastructure for software
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
                className="placeholder:text-muted-foreground/60 min-w-0 flex-1 bg-transparent text-sm outline-none"
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
                    <span className="text-muted-foreground text-[10px] tracking-widest uppercase">
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

        <div className="mt-20">
          <h2 className="text-muted-foreground text-[11px] tracking-[0.3em] uppercase">
            What Nykst does
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {features.map(([title, body], i) => (
              <div
                key={title}
                className="animate-rise border-border bg-card/50 rounded-xl border p-5"
                style={{ animationDelay: `${320 + i * 60}ms` }}
              >
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          id="extension"
          className="border-border bg-card/70 mt-16 flex flex-wrap items-center justify-between gap-5 rounded-2xl border p-6 backdrop-blur"
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
