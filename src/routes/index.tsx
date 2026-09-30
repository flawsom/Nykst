import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GithubConnectPanel } from "@/components/graph/GithubConnectPanel";
import { PreRegisterForm } from "@/components/graph/PreRegisterForm";
import { AdvantagesForm } from "@/components/graph/AdvantagesForm";
import { ApiSettingsButton } from "@/components/graph/ApiSettings";
import { cn } from "@/lib/utils";
import { Mail, X } from "lucide-react";

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
          "Connect GitHub and let Nykst derive your engineering system from the code and collaboration history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [preRegister, setPreRegister] = useState(false);
  const [advantages, setAdvantages] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubNotice, setGithubNotice] = useState<string | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);

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
    if (githubResult === "failed")
      setGithubNotice(
        `GitHub sign-in failed: ${params.get("reason") ?? "unknown error"}. Please try again.`,
      );
    // Drop the result from the address bar so a refresh does not replay it.
    if (githubResult) window.history.replaceState(null, "", window.location.pathname);
    void fetch("/api/integrations/github/organizations")
      .then((response) => {
        if (active && response.ok) setGithubConnected(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const connect = () => {
    window.location.assign("/api/integrations/github/start");
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      {preRegister && <PreRegisterForm onClose={() => setPreRegister(false)} />}
      {advantages && <AdvantagesForm onClose={() => setAdvantages(false)} />}
      {subscriptionOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSubscriptionOpen(false)}
        >
          <div
            className="border-border bg-card relative w-full max-w-md rounded-2xl border p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => setSubscriptionOpen(false)}
              aria-label="Close subscription contact panel"
              className="text-muted-foreground hover:text-foreground absolute top-4 right-4"
            >
              <X className="size-4" />
            </button>
            <p className="text-primary text-[10px] font-mono tracking-[0.24em] uppercase">
              Nykst subscriptions
            </p>
            <h2 className="mt-2 text-xl font-semibold">Talk with us about access</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Nykst subscriptions are arranged personally. Tell us about your team, repository
              needs, and the level of system intelligence you want to use.
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
              Click the email address to open your mail app. We will reply personally with plan
              details, pricing, and setup options.
            </p>
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

      <header className="relative mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary block size-2.5 rounded-full" />
          <span className="text-[15px] font-semibold tracking-[0.24em] uppercase">Nykst</span>
        </div>
        <nav className="flex w-full items-center gap-2 overflow-x-auto pb-0.5 text-xs sm:w-auto sm:gap-4 sm:text-sm">
          <ApiSettingsButton />
          <Link
            to="/mcp"
            className="text-muted-foreground hover:text-foreground shrink-0 whitespace-nowrap rounded-lg px-2 py-2 font-medium transition-colors"
          >
            AI agents (MCP)
          </Link>
          <button
            onClick={() => setSubscriptionOpen(true)}
            className="text-muted-foreground hover:text-foreground shrink-0 whitespace-nowrap rounded-lg px-2 py-2 transition-colors font-medium"
          >
            Pricing · NPR 999
          </button>
          <button
            onClick={() => setSubscriptionOpen(true)}
            className="border-border bg-surface hover:bg-surface-2 shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
          >
            Subscription
          </button>
          <button
            onClick={() => setPreRegister(true)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow glow-ring shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
          >
            Pre-register
          </button>
        </nav>
      </header>

      <section className="relative mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
        <p className="animate-rise text-primary text-xs tracking-[0.3em] uppercase font-mono">
          System Intelligence & Organizational Navigation
        </p>
        <h1
          className="animate-rise text-gradient mt-5 max-w-4xl text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl md:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          The system navigator for your software organization.
        </h1>
        <p
          className="animate-rise text-muted-foreground mt-5 max-w-2xl text-sm leading-relaxed sm:mt-6 sm:text-base"
          style={{ animationDelay: "160ms" }}
        >
          Connect your organization once. Nykst analyzes the codebase itself and renders it as a
          living graph — core domains, capabilities, services, modules, down to a single file. No
          folder browsing. No guesswork.
        </p>

        {/* Pre-register & Distinct Green Advantages Section */}
        <div
          className="animate-rise mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
          style={{ animationDelay: "200ms" }}
        >
          <button
            onClick={() => setPreRegister(true)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow lift hover:lift-hover w-full rounded-xl px-6 py-3.5 text-sm font-semibold shadow-lg shadow-primary/20 sm:w-auto"
          >
            Pre-register for early access
          </button>

          <button
            onClick={() => setAdvantages(true)}
            className="bg-emerald-600 hover:bg-emerald-500 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition-colors sm:w-auto"
          >
            Advantages of using Nykst
          </button>
        </div>

        <div
          className="animate-rise border-border bg-card/70 mt-10 max-w-3xl rounded-2xl border p-4 backdrop-blur sm:mt-14 sm:p-6"
          style={{ animationDelay: "240ms", boxShadow: "var(--shadow-panel)" }}
        >
          <h2 className="text-sm font-medium">Connect your organization</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Nykst installs read-only and derives the graph itself — we never ask you to describe
            your architecture.
          </p>

          <div className="border-primary/30 bg-secondary/40 mt-5 rounded-xl border px-4 py-3">
            <span className="block text-sm font-medium">GitHub</span>
            <span className="text-muted-foreground block text-[11px]">
              Connect securely to choose an organization and repository.
            </span>
          </div>

          {githubNotice && (
            <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
              {githubNotice}
            </p>
          )}

          <GithubConnectPanel connected={githubConnected} onConnect={connect} />

          <div className="border-border bg-surface/70 mt-3 rounded-xl border px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="block text-sm font-medium">Demo account</span>
                <span className="text-muted-foreground block text-[11px]">
                  Explore a realistic Nykst thesis graph without connecting GitHub.
                </span>
              </div>
              <button
                onClick={() => window.location.assign("/graph?demo=1")}
                className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 shrink-0 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors"
              >
                Explore demo graph →
              </button>
            </div>
          </div>
        </div>

        <div
          id="ai-agents"
          className="border-border bg-card/70 mt-24 flex flex-wrap items-center justify-between gap-5 rounded-2xl border p-6 backdrop-blur"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          <div className="max-w-lg">
            <h2 className="text-sm font-medium">Nykst inside your AI coding agent</h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              Connect Claude Code, Cursor, VS Code, Codex and more over MCP. Your agent asks Nykst
              what a change will break before it writes code.
            </p>
          </div>
          <Link
            to="/mcp"
            className="border-border bg-surface hover:bg-surface-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Setup guide for every agent →
          </Link>
        </div>
      </section>
    </main>
  );
}
