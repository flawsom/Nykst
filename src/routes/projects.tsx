import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { 
  GitBranch, 
  FolderGit2, 
  ShieldCheck, 
  Activity, 
  ArrowRight, 
  Search, 
  Layers, 
  Cpu,
  Lock,
  Star,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Your Repositories & Projects — Nykst Software Intelligence" },
      {
        name: "description",
        content:
          "Select a repository or software project to inspect its living graph and enterprise intelligence memory.",
      },
    ],
  }),
  component: ProjectsPage,
});

interface RepoProject {
  id: string;
  name: string;
  repo: string;
  description: string;
  domains: number;
  services: number;
  files: number;
  health: "Optimal" | "Good" | "Needs Review";
  language: string;
  updated: string;
}

const MOCK_PROJECTS: RepoProject[] = [
  {
    id: "netflix-streaming",
    name: "Netflix Streaming Engine",
    repo: "netflix/streaming-engine",
    description: "Core video encoding, edge CDN routing, bandwidth optimization, and low-latency playback delivery.",
    domains: 6,
    services: 24,
    files: 4210,
    health: "Optimal",
    language: "TypeScript / Go",
    updated: "2 mins ago",
  },
  {
    id: "stripe-payments",
    name: "Stripe Payments API Gateway",
    repo: "stripe/payments-api",
    description: "Distributed payment processing, idempotent ledger transactions, and webhook event routers.",
    domains: 5,
    services: 18,
    files: 3180,
    health: "Optimal",
    language: "TypeScript / Rust",
    updated: "14 mins ago",
  },
  {
    id: "acme-auth",
    name: "Enterprise Auth & OIDC Provider",
    repo: "acme/auth-enterprise",
    description: "SAML/OIDC identity federation, session store clustering, and JWT rate-limited middleware.",
    domains: 3,
    services: 12,
    files: 1450,
    health: "Good",
    language: "TypeScript",
    updated: "1 hour ago",
  },
  {
    id: "netflix-recommendations",
    name: "AI Recommendation & Ranking Pipeline",
    repo: "netflix/recommendations",
    description: "Real-time collaborative filtering, neural ranking embeddings, and telemetry feedback streams.",
    domains: 4,
    services: 16,
    files: 2890,
    health: "Optimal",
    language: "Python / TypeScript",
    updated: "3 hours ago",
  },
  {
    id: "stripe-radar",
    name: "Radar Fraud Detection Engine",
    repo: "stripe/radar-fraud",
    description: "Machine learning fraud scoring, anomalous IP tracking, and instant dispute mitigation rules.",
    domains: 3,
    services: 9,
    files: 1920,
    health: "Needs Review",
    language: "Python / Go",
    updated: "5 hours ago",
  },
  {
    id: "acme-billing",
    name: "Global Subscription & Invoicing",
    repo: "acme/billing-engine",
    description: "Multi-currency recurring billing, automated tax calculation, and payment gateway failover.",
    domains: 4,
    services: 14,
    files: 2150,
    health: "Optimal",
    language: "TypeScript",
    updated: "Yesterday",
  },
];

function ProjectsPage() {
  const navigate = useNavigate();
  const [orgSlug, setOrgSlug] = useState("acme");
  const [provider, setProvider] = useState("github");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("nykst.org");
    const p = localStorage.getItem("nykst.provider");
    if (stored) setOrgSlug(stored);
    if (p) setProvider(p);
  }, []);

  const filteredProjects = MOCK_PROJECTS.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.repo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectProject = (proj: RepoProject) => {
    localStorage.setItem("nykst.selectedProject", proj.id);
    localStorage.setItem("nykst.selectedRepo", proj.repo);
    navigate({ to: `/project/${proj.id}` });
  };

  return (
    <main className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />

      {/* Header */}
      <header className="border-border relative z-10 mx-auto flex max-w-7xl items-center justify-between border-b px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary block size-2.5 rounded-full" />
          <span className="text-[15px] font-semibold tracking-[0.24em] uppercase">Nykst</span>
          <span className="border-border bg-surface ml-2 rounded-full border px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {provider} / {orgSlug}
          </span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/graph" className="text-muted-foreground hover:text-foreground transition-colors">
            Global Graph View →
          </Link>
          <span className="text-muted-foreground font-mono text-xs">Connected & Synced</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <span className="text-primary font-mono text-xs tracking-widest uppercase">
              Connected Organization Repositories
            </span>
            <h1 className="text-gradient mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Select a Project or Repository
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
              Nykst has automatically scanned your organization's connected GitHub repositories. Choose any software project below to open its living graph overview and enterprise intelligence memory dashboard.
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-3 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search repos or services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-border bg-card w-full rounded-xl border py-2.5 pl-10 pr-4 text-xs text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        {/* Repositories Grid */}
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => selectProject(proj)}
              className="border-border bg-card/80 hover:bg-card/100 hover:border-primary/50 group relative flex flex-col justify-between rounded-2xl border p-6 backdrop-blur transition-all cursor-pointer lift"
              style={{ boxShadow: "var(--shadow-panel)" }}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-primary flex items-center gap-1.5">
                    <FolderGit2 className="size-4 text-primary" />
                    {proj.repo}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-mono text-[10px]",
                      proj.health === "Optimal"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : proj.health === "Good"
                        ? "bg-sky-500/10 text-sky-400 border border-sky-500/30"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    )}
                  >
                    {proj.health}
                  </span>
                </div>

                <h3 className="mt-3 text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                  {proj.name}
                </h3>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed line-clamp-2">
                  {proj.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <div className="grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
                  <div className="bg-surface rounded-lg p-1.5 border border-border">
                    <span className="text-muted-foreground block">Domains</span>
                    <span className="font-semibold text-foreground">{proj.domains}</span>
                  </div>
                  <div className="bg-surface rounded-lg p-1.5 border border-border">
                    <span className="text-muted-foreground block">Services</span>
                    <span className="font-semibold text-foreground">{proj.services}</span>
                  </div>
                  <div className="bg-surface rounded-lg p-1.5 border border-border">
                    <span className="text-muted-foreground block">Files</span>
                    <span className="font-semibold text-foreground">{proj.files}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-mono text-[11px]">{proj.language}</span>
                  <span className="text-primary font-medium flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Open Intelligence & Graph <ArrowRight className="size-3.5" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
