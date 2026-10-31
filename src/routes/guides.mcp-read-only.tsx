import { createFileRoute, Link } from "@tanstack/react-router";
import { GuideShell, Evidence } from "@/components/docs/GuideShell";
import { articleLd, canonicalUrl, shareMeta } from "@/lib/seo";

const TITLE = "How to use the read-only MCP tools safely";
const DESCRIPTION =
  "A short operating guide for connecting a coding assistant to Nykst: what the token can read, what every tool is allowed to do, and how to revoke access.";
const PATH = "/guides/mcp-read-only";
const PUBLISHED = "2026-10-31";

export const Route = createFileRoute("/guides/mcp-read-only")({
  head: () => ({
    meta: [
      { title: `${TITLE} · Nykst` },
      { name: "description", content: DESCRIPTION },
      ...shareMeta({ title: TITLE, description: DESCRIPTION, path: PATH }),
      {
        "script:ld+json": articleLd({
          title: TITLE,
          description: DESCRIPTION,
          path: PATH,
          published: PUBLISHED,
        }),
      },
    ],
    links: [{ rel: "canonical", href: canonicalUrl(PATH) }],
  }),
  component: GuidePage,
});

function GuidePage() {
  return (
    <GuideShell eyebrow="MCP" title={TITLE} description={DESCRIPTION} reviewed="31 October 2026">
      <section>
        <h2 className="text-xl text-foreground">A token is a read key, not a deploy key</h2>
        <p className="text-muted-foreground mt-3">
          The MCP endpoint accepts a bearer token created on the{" "}
          <Link to="/mcp" className="text-primary underline underline-offset-4">
            MCP page
          </Link>
          . The raw token is returned once at creation. The server stores a SHA-256 hash and a short
          prefix, not the token itself. The hashing function is at{" "}
          <code>src/lib/mcp.server.ts:20</code>, token creation starts at line 24, and the record
          stores only <code>token_hash</code> and <code>token_prefix</code> at lines 33 and 34.
        </p>
        <p className="text-muted-foreground mt-3">
          Each request resolves the token by hash and rejects it when it is missing or revoked. The
          lookup is at <code>src/lib/mcp.server.ts:63</code> and filters on <code>revoked_at</code>{" "}
          at line 71. There is no fixed expiry column in this tree. Treat a token as valid until you
          revoke it, and revoke it when the assistant no longer needs access. The revoke function is
          at line 54 and only matches a token owned by the signed-in user.
        </p>
      </section>

      <section>
        <h2 className="text-xl text-foreground">Every tool is marked read-only</h2>
        <p className="text-muted-foreground mt-3">
          The tool layer is documented as read-only at <code>src/lib/analysis/tools.ts:7</code>. The
          test at <code>tests/analysis-tools.test.ts:90</code> walks the full published tool list
          and asserts <code>readOnlyHint: true</code> for every tool on line 98. That test covers
          all 11 tools, including the three that produce a simulated result:{" "}
          <code>simulate_change</code>, <code>generate_fix_patch</code> and{" "}
          <code>run_safe_code_loop</code>. None of them writes to your repository. They return a
          patch or a simulated graph for you to inspect.
        </p>
        <p className="text-muted-foreground mt-3">
          Read-only does not mean risk-free. A read tool can still expose source paths, file names
          and code windows to the assistant you connected. Only connect repositories you are willing
          to show that assistant, and read the tool output before you paste it into another service.
        </p>
      </section>

      <section>
        <h2 className="text-xl text-foreground">Start with three tools</h2>
        <p className="text-muted-foreground mt-3">
          The full profile contains 11 tools. For a first session, three are enough to answer the
          question most changes start with:
        </p>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5">
          <li>
            <code>get_impact</code> returns the files, importers, runtime dependents and entrypoints
            for one path or symbol.
          </li>
          <li>
            <code>find_usages</code> finds a named symbol, table, endpoint or environment variable
            across the analyzed repository.
          </li>
          <li>
            <code>search_files</code> finds a path or text window when you need to locate the file
            before you know its name.
          </li>
        </ol>
        <p className="text-muted-foreground mt-3">
          Add <code>simulate_change</code> only when you have a concrete diff to test. It returns a
          simulated impact result; it does not apply the diff. Add the patch tools only after you
          have a reviewed target file and are prepared to read the returned diff. A complete list is
          published at{" "}
          <Link to="/mcp" className="text-primary underline underline-offset-4">
            /mcp
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-xl text-foreground">A request you can inspect</h2>
        <p className="text-muted-foreground mt-3">
          The endpoint speaks MCP over HTTP. The token belongs in the <code>Authorization</code>{" "}
          header, never in a URL, a screenshot or a chat message. This is the shape of a tools call,
          with the value replaced by an environment variable:
        </p>
        <pre className="border-border bg-surface mt-4 overflow-x-auto rounded-lg border p-4 text-xs leading-relaxed">
          <code>{`curl -s https://nykst.unifies.codes/api/mcp \\
  -H "Authorization: Bearer $NYKST_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</code>
        </pre>
        <p className="text-muted-foreground mt-3">
          Run <code>tools/list</code> first and compare the names and annotations with the test
          above. If a tool is missing, or a tool reports a write capability, stop and report it
          rather than guessing.
        </p>
      </section>

      <section>
        <h2 className="text-xl text-foreground">What access is scoped to</h2>
        <p className="text-muted-foreground mt-3">
          A token is tied to the GitHub account that created it. Snapshot loading filters on the
          provider user id at <code>src/lib/mcp.server.ts:82</code> and later, so one token cannot
          read another account's connected repositories by naming them. The token summary shows a
          prefix and a label, not the secret. Revoking it sets <code>revoked_at</code>; the next
          request fails authentication.
        </p>
        <Evidence title="Safety checklist">
          <p>Create a separate token for each assistant and label it with the assistant name.</p>
          <p>Keep the token in the assistant's environment or secret store, never in a prompt.</p>
          <p>Revoke the token when the assistant is removed, and rotate it after any exposure.</p>
          <p>
            Confirm the tool list still reports read-only annotations before you trust a new
            release.
          </p>
        </Evidence>
      </section>

      <section>
        <h2 className="text-xl text-foreground">What this does not cover</h2>
        <p className="text-muted-foreground mt-3">
          This guide does not claim that the MCP endpoint is a sandbox for untrusted code. It reads
          an analysis snapshot produced by the ingestion pipeline. Connect only repositories you
          control, and treat the assistant's output as a suggestion that still needs a human review.
          The three-tool starting set above is a recommendation, not a server-enforced default in
          this tree. The full 11-tool profile remains available.
        </p>
      </section>
    </GuideShell>
  );
}
