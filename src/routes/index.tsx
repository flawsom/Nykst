import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  Brain,
  GitBranch,
  GitPullRequest,
  Mail,
  Network,
  ShieldCheck,
  X,
} from "lucide-react";
import { GithubConnectPanel } from "@/components/graph/GithubConnectPanel";
import { PreRegisterForm } from "@/components/graph/PreRegisterForm";
import { ApiSettingsButton } from "@/components/graph/ApiSettings";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nykst — See what a change will break before you ship it" },
      {
        name: "description",
        content:
          "Nykst reads your repository's real import graph, history and call sites, shows the blast radius of a change, remembers why code is the way it is, and checks generated code against it.",
      },
      { property: "og:title", content: "Nykst — See what a change will break before you ship it" },
      {
        property: "og:description",
        content:
          "Blast radius, repository memory and verified changes for your team and your AI coding agent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const pillars = [
  {
    icon: Network,
    title: "Know the blast radius",
    body: "Every file's real importers, call sites, entry points and tests, resolved from your code with the TypeScript parser. Pick a file and see exactly what depends on it.",
  },
  {
    icon: Brain,
    title: "Remember why it is this way",
    body: "Commit and pull request history, files that change together, reverts and fixes, plus notes your team pins to a file. Context that normally lives in someone's head.",
  },
  {
    icon: ShieldCheck,
    title: "Check changes before they land",
    body: "Hand Nykst a diff or let it draft one. It re-reads the graph and reports removed exports, broken call signatures, new cycles and missing dependencies, and says what it could not check.",
  },
];

const steps = [
  ["Connect", "Install the read-only GitHub App on the repositories you choose."],
  ["Analyze", "Nykst parses the code and history. Nothing is written to your repository."],
  ["Ask", "Use the workspace, or let Claude Code, Cursor and others query it over MCP."],
];

const limits = [
  "TypeScript and JavaScript only for now. Other languages are listed but not analyzed.",
  "Static analysis. It does not run your code, so runtime-only breakage is out of reach.",
  "Every verification report lists what was checked and what was not.",
];

function Landing() {
  const [preRegister, setPreRegister] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubNotice, setGithubNotice] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);

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

  return (
    <div className="min-h-screen">
      {preRegister && <PreRegisterForm onClose={() => setPreRegister(false)} />}
      {contactOpen && <ContactDialog onClose={() => setContactOpen(false)} />}

      <SiteHeader>
        <ApiSettingsButton />
        <button
          onClick={() => setPreRegister(true)}
          className="bg-primary text-primary-foreground hover:bg-primary-glow ml-1 inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold transition-colors"
        >
          Get early access
        </button>
      </SiteHeader>

      <main>
        <section className="relative mx-auto grid max-w-6xl gap-10 px-4 pt-14 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div>
            <p className="text-primary font-mono text-xs tracking-[0.2em] uppercase">
              Impact analysis for code changes
            </p>
            <h1 className="mt-4 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
              See what a change will break before you ship it.
            </h1>
            <p className="text-muted-foreground mt-5 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
              Nykst reads your repository's real import graph and history, shows the blast radius of
              any file, and checks code, yours or your AI agent's, against it before it lands.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => window.location.assign("/graph?demo=1")}
                className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold transition-colors"
              >
                Explore a live example <ArrowRight className="size-4" aria-hidden />
              </button>
              <Link
                to="/mcp"
                className="border-border bg-surface hover:bg-surface-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-6 text-sm font-medium transition-colors"
              >
                <Bot className="size-4" aria-hidden /> Use it in your AI agent
              </Link>
            </div>
          </div>

          <div
            className="border-border bg-card self-start rounded-2xl border p-5 sm:p-6"
            style={{ boxShadow: "var(--shadow-panel)" }}
          >
            <h2 className="text-base font-semibold">Connect a repository</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Read-only, per repository. You choose which ones Nykst can see.
            </p>
            {githubNotice && (
              <p
                role="status"
                className="border-warn/30 bg-warn-soft text-warn mt-4 rounded-lg border px-3 py-2 text-sm"
              >
                {githubNotice}
              </p>
            )}
            <div className="mt-4">
              <GithubConnectPanel
                connected={githubConnected}
                onConnect={() => window.location.assign("/api/integrations/github/start")}
              />
            </div>
            <div className="border-border mt-4 flex items-center justify-between gap-3 border-t pt-4">
              <p className="text-muted-foreground text-sm">No repository handy?</p>
              <a
                href="/graph?demo=1"
                className="text-primary inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
              >
                Open the example →
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 sm:px-6" aria-labelledby="what">
          <h2 id="what" className="sr-only">
            What Nykst does
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {pillars.map(({ icon: Icon, title, body }) => (
              <article key={title} className="border-border bg-card rounded-xl border p-6">
                <span className="bg-primary/10 text-primary inline-flex size-10 items-center justify-center rounded-lg">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6" aria-labelledby="how">
          <h2 id="how" className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {steps.map(([title, body], index) => (
              <li key={title} className="border-border rounded-xl border p-5">
                <span className="text-primary tabular font-mono text-sm">0{index + 1}</span>
                <h3 className="mt-2 font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="mx-auto mt-20 grid max-w-6xl gap-4 px-4 sm:px-6 lg:grid-cols-2"
          aria-label="Limits and agents"
        >
          <div className="border-border bg-card rounded-xl border p-6">
            <div className="flex items-center gap-2">
              <GitBranch className="text-warn size-5" aria-hidden />
              <h2 className="text-lg font-semibold">What it does not do</h2>
            </div>
            <ul className="text-muted-foreground mt-4 space-y-2.5 text-sm leading-relaxed">
              {limits.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span className="bg-warn mt-2 size-1.5 shrink-0 rounded-full" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-border bg-card rounded-xl border p-6">
            <div className="flex items-center gap-2">
              <GitPullRequest className="text-primary size-5" aria-hidden />
              <h2 className="text-lg font-semibold">Inside your coding agent</h2>
            </div>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
              Connect Claude Code, Cursor, VS Code, Codex and others over MCP. Your agent asks Nykst
              what a change will break, and what the team already knows about those files, before it
              writes code.
            </p>
            <Link
              to="/mcp"
              className="text-primary mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold hover:underline"
            >
              Setup guide for every agent <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
          <div className="border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-6 sm:p-8">
            <div>
              <h2 className="text-xl font-semibold">Want it for your team?</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Subscriptions are arranged personally. Tell us about your repositories.
              </p>
            </div>
            <button
              onClick={() => setContactOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex min-h-12 items-center rounded-lg px-6 text-sm font-semibold transition-colors"
            >
              Talk to us
            </button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function ContactDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-title"
        className="border-border bg-card relative w-full max-w-md rounded-2xl border p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground absolute top-2 right-2 inline-flex size-11 items-center justify-center"
        >
          <X className="size-4" aria-hidden />
        </button>
        <h2 id="contact-title" className="text-xl font-semibold">
          Talk with us about access
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Tell us about your team, your repositories and what you want to check before shipping. We
          reply personally with plan details and setup options.
        </p>
        <a
          href="https://mail.google.com/mail/?view=cm&fs=1&to=nykstsoftint%40gmail.com&su=Nykst%20subscription%20enquiry"
          target="_blank"
          rel="noreferrer"
          className="border-primary/30 bg-primary/5 text-primary mt-5 flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:underline"
        >
          <Mail className="size-4" aria-hidden /> nykstsoftint@gmail.com
        </a>
      </div>
    </div>
  );
}
