import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CodeBlock } from "@/components/mcp/CodeBlock";
import { TokenPanel } from "@/components/mcp/TokenPanel";
import {
  AGENT_RULES,
  GUIDES,
  PRODUCTION_ORIGIN,
  RULE_FILES,
  TOKEN_PLACEHOLDER,
  TOOLS,
} from "@/lib/mcp-guides";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mcp")({
  head: () => ({
    meta: [
      { title: "Connect Nykst to your AI coding agent — MCP guide" },
      {
        name: "description",
        content:
          "Setup guides for Claude Code, Cursor, VS Code, Codex, Gemini CLI, Windsurf, Cline, Zed and Claude Desktop. Let your AI agent ask Nykst what a change will break before it writes code.",
      },
      { property: "og:title", content: "Connect Nykst to your AI coding agent" },
      {
        property: "og:description",
        content: "Your agent asks Nykst what a change will break before it writes code.",
      },
    ],
  }),
  component: McpGuidePage,
});

function StepHeading({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="border-primary/40 bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold">
        {n}
      </span>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {children && (
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{children}</p>
        )}
      </div>
    </div>
  );
}

function McpGuidePage() {
  const [origin, setOrigin] = useState(PRODUCTION_ORIGIN);
  const [token, setToken] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(GUIDES[0]!.id);

  useEffect(() => {
    setOrigin(window.location.origin);
    // Links like /mcp#cursor pick the tab, on first load and when the hash changes later.
    const syncFromHash = () => {
      const fromHash = window.location.hash.replace(/^#/, "");
      if (GUIDES.some((guide) => guide.id === fromHash)) setActiveId(fromHash);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const guide = GUIDES.find((item) => item.id === activeId) ?? GUIDES[0]!;
  const ctx = useMemo(
    () => ({ url: `${origin}/api/mcp`, token: token ?? TOKEN_PLACEHOLDER }),
    [origin, token],
  );

  const choose = (id: string) => {
    setActiveId(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary size-2 rounded-full" />
          <span className="text-[13px] font-semibold tracking-[0.24em] uppercase">Nykst</span>
        </Link>
        <nav className="flex items-center gap-4 text-xs">
          <Link to="/graph" className="text-muted-foreground hover:text-foreground">
            Graph
          </Link>
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Home
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
          Model Context Protocol
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Use Nykst inside your AI coding agent
        </h1>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">
          Before your agent edits a file, it can ask Nykst what that change will break: which files
          import it, which pages and API routes it reaches, which tests cover it, and which database
          tables and services it touches. It takes a few minutes to set up and works with any agent
          that supports MCP.
        </p>

        <section className="mt-12 space-y-4">
          <StepHeading n={1} title="Map a repository">
            Nykst can only answer about repositories you have mapped. Connect GitHub, choose a
            repository and press Start mapping. You choose which repositories Nykst can read, and it
            never writes to them.
          </StepHeading>
          <div className="pl-9">
            <Link
              to="/"
              className="border-border bg-surface hover:bg-surface-2 inline-block rounded-lg border px-4 py-2 text-xs font-semibold transition-colors"
            >
              Connect GitHub and map a repo →
            </Link>
          </div>
        </section>

        <section className="mt-12 space-y-4">
          <StepHeading n={2} title="Create an access token">
            The token lets your agent read the analysis of your repositories, and nothing else.
            Nykst stores only a hash of it. You can revoke it here at any time.
          </StepHeading>
          <div className="pl-9">
            <TokenPanel token={token} onCreated={setToken} />
          </div>
        </section>

        <section className="mt-12 space-y-4">
          <StepHeading n={3} title="Add Nykst to your agent">
            Pick your tool.
          </StepHeading>

          <div className="pl-0 sm:pl-9">
            <div
              role="tablist"
              aria-label="AI coding agents"
              className="border-border flex flex-wrap gap-1.5 border-b pb-3"
            >
              {GUIDES.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={item.id === guide.id}
                  onClick={() => choose(item.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    item.id === guide.id
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-surface",
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>

            <div role="tabpanel" className="mt-5 space-y-5">
              <div>
                <h3 className="text-base font-semibold">{guide.name}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{guide.summary}</p>
              </div>

              {!token && (
                <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-300">
                  The snippets below contain {TOKEN_PLACEHOLDER}. Create a token in step 2 and they
                  fill in automatically.
                </p>
              )}

              <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              {guide.snippets.map((snippet) => (
                <CodeBlock
                  key={snippet.title}
                  title={snippet.title}
                  language={snippet.language}
                  code={snippet.code(ctx)}
                  note={snippet.note}
                />
              ))}

              <p className="text-sm">
                <span className="text-primary font-semibold">Check it worked: </span>
                <span className="text-muted-foreground">{guide.verify}</span>
              </p>
              {guide.caveat && (
                <p className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed">
                  {guide.caveat}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-12 space-y-4">
          <StepHeading n={4} title="Try it">
            Ask your agent something like this. It decides when to call Nykst, or you can name the
            tool.
          </StepHeading>
          <div className="space-y-3 pl-0 sm:pl-9">
            <ul className="space-y-2">
              {TOOLS.map((tool) => (
                <li
                  key={tool.name}
                  className="border-border bg-surface rounded-xl border px-4 py-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <code className="text-primary font-mono text-[13px]">{tool.name}</code>
                    <span className="text-muted-foreground text-[11px]">“{tool.example}”</span>
                  </div>
                  <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                    {tool.summary}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-12 space-y-4">
          <StepHeading n={5} title="Make your agent check Nykst automatically">
            Agents call a tool when their instructions say to. Add this to your repository's
            instruction file so every change starts with an impact check.
          </StepHeading>
          <div className="space-y-3 pl-0 sm:pl-9">
            <CodeBlock
              title="Add to your agent's instruction file"
              language="markdown"
              code={AGENT_RULES}
            />
            <ul className="text-muted-foreground space-y-1 text-xs">
              {RULE_FILES.map((item) => (
                <li key={item.file}>
                  <span className="text-foreground font-mono">{item.file}</span> for {item.tool}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-border mt-14 border-t pt-8">
          <h2 className="text-base font-semibold">Troubleshooting and safety</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-medium">Error 401, or “token” in the message</dt>
              <dd className="text-muted-foreground mt-1 leading-relaxed">
                Nykst tells you what is wrong: no token sent, the token is still the placeholder
                YOUR_NYKST_TOKEN, it doesn't start with nyk_, or it was revoked. Create a new token
                in step 2 and paste it in place of the placeholder.
              </dd>
            </div>
            <div>
              <dt className="font-medium">“command not found” or the command does nothing</dt>
              <dd className="text-muted-foreground mt-1 leading-relaxed">
                The tool itself isn't installed yet. Check with claude --version, codex --version or
                gemini --version. On Windows, open a new terminal after installing, and use
                PowerShell: the export command only exists on macOS and Linux, so use the Windows
                PowerShell snippet where there is one.
              </dd>
            </div>
            <div>
              <dt className="font-medium">An error in VS Code</dt>
              <dd className="text-muted-foreground mt-1 leading-relaxed">
                Run MCP: List Servers from the command palette, choose nykst, and pick Show Output.
                It prints the exact reason. Send that text to us if it isn't clear.
              </dd>
            </div>
            <div>
              <dt className="font-medium">“No repository has been analyzed yet”</dt>
              <dd className="text-muted-foreground mt-1 leading-relaxed">
                Map a repository first (step 1). If Nykst says the repository was mapped before code
                analysis existed, open the graph and press Re-analyze.
              </dd>
            </div>
            <div>
              <dt className="font-medium">The answers look out of date</dt>
              <dd className="text-muted-foreground mt-1 leading-relaxed">
                Nykst answers from the last time you mapped the repository. Press Re-analyze in the
                graph after you push changes.
              </dd>
            </div>
            <div>
              <dt className="font-medium">What can the token do?</dt>
              <dd className="text-muted-foreground mt-1 leading-relaxed">
                Read the analysis of repositories you mapped: file paths, names of functions and
                exports, import connections, commit and pull request titles. It cannot read file
                contents or change anything on GitHub. Revoke it above whenever you want.
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
