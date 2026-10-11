import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CodeBlock, CopyButton } from "@/components/mcp/CodeBlock";
import { TokenPanel } from "@/components/mcp/TokenPanel";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import {
  AGENT_RULES,
  CAN_AND_CANNOT,
  EXAMPLE_PROMPTS,
  GUIDES,
  LIST_REPOSITORIES_NOTE,
  PRODUCTION_ORIGIN,
  RULE_FILES,
  TOKEN_PLACEHOLDER,
  TOOL_GROUPS,
} from "@/lib/mcp-guides";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mcp")({
  head: () => ({
    meta: [
      { title: "Connect Nykst to your AI coding agent — MCP guide" },
      {
        name: "description",
        content:
          "Setup guides for Claude Code, Cursor, VS Code, Codex, Gemini CLI, Windsurf, Cline, Zed and Claude Desktop. See what a change will break before you ship it, from inside your AI agent.",
      },
      { property: "og:title", content: "Connect Nykst to your AI coding agent" },
      {
        property: "og:description",
        content: "See what a change will break before you ship it, from inside your AI agent.",
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
      <span className="border-border bg-surface-2 text-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border font-mono text-sm font-semibold">
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {children && (
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{children}</p>
        )}
      </div>
    </div>
  );
}

const buttonSecondary =
  "border-border bg-surface hover:bg-surface-2 inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-semibold transition-colors";

const faq = [
  [
    "Error 401, or “token” in the message",
    "Nykst tells you what is wrong: no token sent, the token is still the placeholder YOUR_NYKST_TOKEN, it doesn't start with nyk_, or it was revoked. Create a new token in step 2 and paste it in place of the placeholder.",
  ],
  [
    "“command not found” or the command does nothing",
    "The tool itself isn't installed yet. Check with claude --version, codex --version or gemini --version. On Windows, open a new terminal after installing, and use PowerShell: the export command only exists on macOS and Linux, so use the Windows PowerShell snippet where there is one.",
  ],
  [
    "An error in VS Code",
    "Run MCP: List Servers from the command palette, choose nykst, and pick Show Output. It prints the exact reason. Send that text to us if it isn't clear.",
  ],
  [
    "“No repository has been analyzed yet”",
    "Map a repository first (step 1). If Nykst says the repository was mapped before code analysis existed, open the graph and press Re-analyze.",
  ],
  [
    "The answers look out of date",
    "Nykst answers from the last time you mapped the repository. Press Re-analyze in the graph after you push changes.",
  ],
  [
    "What can the token do?",
    "Read the analysis of repositories you mapped: file paths, names of functions and exports, import connections, commit and pull request titles, findings and team notes. It can add notes with remember. It cannot change anything on GitHub. Revoke it above whenever you want.",
  ],
];

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
    <div className="bg-background text-foreground min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pt-12 sm:px-6 sm:pt-16">
        <div className="max-w-3xl">
          <p className="text-primary text-sm font-semibold">Model Context Protocol</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            See what a change will break before you ship it — from inside your AI agent.
          </h1>
          <p className="text-muted-foreground mt-4 text-base leading-relaxed">
            Connect Nykst to any agent that supports MCP. Before it edits a file, your agent can ask
            what that change will break, read the team's notes and known problems, and check its
            edit against the repository. Setup takes a few minutes.
          </p>
        </div>

        <div className="mt-12 max-w-3xl space-y-14">
          <section className="space-y-4">
            <StepHeading n={1} title="Map a repository">
              Nykst can only answer about repositories you have mapped. Connect GitHub, choose a
              repository and press Start mapping. You choose which repositories Nykst can read, and
              it never writes to them.
            </StepHeading>
            <div className="sm:pl-10">
              <Link to="/" className={buttonSecondary}>
                Connect GitHub and map a repo
              </Link>
            </div>
          </section>

          <section className="space-y-4">
            <StepHeading n={2} title="Create an access token">
              The token lets your agent use Nykst's analysis of your repositories. Nykst stores only
              a hash of it. You can revoke it here at any time.
            </StepHeading>
            <div className="sm:pl-10">
              <TokenPanel token={token} onCreated={setToken} />
            </div>
          </section>

          <section className="space-y-4">
            <StepHeading n={3} title="Add Nykst to your agent">
              Pick your tool.
            </StepHeading>

            <div className="sm:pl-10">
              <div
                role="tablist"
                aria-label="AI coding agents"
                className="border-border flex flex-wrap gap-2 border-b pb-4"
              >
                {GUIDES.map((item) => (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={item.id === guide.id}
                    onClick={() => choose(item.id)}
                    className={cn(
                      "min-h-10 rounded-md border px-3 text-sm font-medium transition-colors",
                      item.id === guide.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-surface",
                    )}
                  >
                    {item.name}
                  </button>
                ))}
              </div>

              <div role="tabpanel" className="mt-6 space-y-5">
                <div>
                  <h3 className="text-lg font-semibold">{guide.name}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">{guide.summary}</p>
                </div>

                {!token && (
                  <p className="border-border bg-warn-soft text-warn rounded-lg border px-4 py-3 text-sm leading-relaxed">
                    The snippets below contain {TOKEN_PLACEHOLDER}. Create a token in step 2 and
                    they fill in automatically.
                  </p>
                )}

                <ol className="text-muted-foreground list-decimal space-y-2 pl-5 text-sm leading-relaxed">
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

                <p className="text-sm leading-relaxed">
                  <span className="text-foreground font-semibold">Check it worked: </span>
                  <span className="text-muted-foreground">{guide.verify}</span>
                </p>
                {guide.caveat && (
                  <p className="text-muted-foreground border-border rounded-lg border border-dashed px-4 py-3 text-sm leading-relaxed">
                    {guide.caveat}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        <section className="mt-14 space-y-6">
          <div className="max-w-3xl">
            <StepHeading n={4} title="What your agent can ask Nykst">
              Nine tools. Your agent decides when to call them, or you can name one in your prompt.
            </StepHeading>
          </div>
          <div className="grid gap-4 md:grid-cols-3 md:pl-0">
            {TOOL_GROUPS.map((group) => (
              <div key={group.title} className="border-border bg-surface rounded-lg border p-4">
                <h3 className="text-base font-semibold">{group.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{group.blurb}</p>
                <ul className="mt-4 space-y-4">
                  {group.tools.map((tool) => (
                    <li key={tool.name}>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-foreground font-mono text-sm font-semibold">
                          {tool.name}
                        </code>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-medium",
                            tool.writes
                              ? "bg-warn-soft text-warn"
                              : "bg-surface-2 text-muted-foreground",
                          )}
                        >
                          {tool.writes ? "Writes a note" : "Read-only"}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                        {tool.summary}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">
            <code className="text-foreground font-mono">list_repositories</code>:{" "}
            {LIST_REPOSITORIES_NOTE.replace("list_repositories also shows", "shows")}
          </p>
        </section>

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Example prompts</h2>
            <p className="text-muted-foreground text-sm">Copy one into your agent's chat.</p>
            <ul className="space-y-3">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <li
                  key={prompt}
                  className="border-border bg-card flex items-start justify-between gap-2 rounded-lg border py-1 pr-1 pl-4"
                >
                  <p className="py-2 text-sm leading-relaxed">“{prompt}”</p>
                  <CopyButton text={prompt} />
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">
              What your agent can and cannot do with Nykst
            </h2>
            <div className="border-border bg-surface space-y-5 rounded-lg border p-4">
              <ul className="space-y-2">
                {CAN_AND_CANNOT.can.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-relaxed">
                    <Check className="text-ok mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <ul className="border-border space-y-2 border-t pt-4">
                {CAN_AND_CANNOT.cannot.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-relaxed">
                    <X className="text-danger mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <section className="mt-14 max-w-3xl space-y-4">
          <StepHeading n={5} title="Make your agent check Nykst automatically">
            Agents call a tool when their instructions say to. Add this to your repository's
            instruction file so every change starts with an impact check and ends with a
            verification.
          </StepHeading>
          <div className="space-y-3 sm:pl-10">
            <CodeBlock
              title="Add to your agent's instruction file"
              language="markdown"
              code={AGENT_RULES}
            />
            <ul className="text-muted-foreground space-y-1 text-sm">
              {RULE_FILES.map((item) => (
                <li key={item.file}>
                  <span className="text-foreground font-mono">{item.file}</span> for {item.tool}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-border mt-14 max-w-3xl border-t pt-8">
          <h2 className="text-xl font-semibold tracking-tight">Troubleshooting and safety</h2>
          <dl className="mt-4 space-y-5 text-sm">
            {faq.map(([question, answer]) => (
              <div key={question}>
                <dt className="font-semibold">{question}</dt>
                <dd className="text-muted-foreground mt-1 leading-relaxed">{answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
