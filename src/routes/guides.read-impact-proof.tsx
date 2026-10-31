import { createFileRoute, Link } from "@tanstack/react-router";
import { GuideShell, Evidence } from "@/components/docs/GuideShell";
import { articleLd, canonicalUrl, shareMeta } from "@/lib/seo";

const TITLE = "How to read a change impact proof";
const DESCRIPTION =
  "A practical guide to reading what Nykst says a change will touch: the item, its importers, its runtime dependents, the entrypoints it reaches, and the checks that cover it.";
const PATH = "/guides/read-impact-proof";
const PUBLISHED = "2026-10-31";

export const Route = createFileRoute("/guides/read-impact-proof")({
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
    <GuideShell
      eyebrow="Impact proof"
      title={TITLE}
      description={DESCRIPTION}
      reviewed="31 October 2026"
    >
      <section>
        <h2 className="text-xl text-foreground">
          An impact proof is a reading list, not a verdict
        </h2>
        <p className="text-muted-foreground mt-3">
          Nykst answers one narrow question: based on the static structure of this repository, what
          code mentions the item you are about to change? It does not run your tests, deploy your
          branch, or decide whether the change is safe. The proof gives you the files and lines to
          inspect, in an order that follows how the dependency actually flows.
        </p>
        <p className="text-muted-foreground mt-3">
          Read the proof as four layers. The item is the file, export or symbol you selected. Direct
          importers are the files that name it. Runtime dependents are files that reach it through
          other imports. Entrypoints are the routes, servers or commands where that chain becomes
          something a user can trigger. A file can have many importers and still be harmless, and a
          file can have one importer that is a production entrypoint. The count is a hint about
          where to look, not a risk score.
        </p>
      </section>

      <section>
        <h2 className="text-xl text-foreground">A real example: the Nykst brand component</h2>
        <p className="text-muted-foreground mt-3">
          In the public Nykst repository, <code>NykstBrand</code> is defined in{" "}
          <code>src/components/brand/NykstLogo.tsx:76</code>. It accepts a subtitle, a size and an
          optional class name, and it renders the wordmark used across the product. The live map
          classifies a change to it as high impact because the component reaches public entrypoints,
          not because it is large. The file is 100 lines.
        </p>
        <p className="text-muted-foreground mt-3">
          The direct importers are enough to see the shape of the risk. The landing page imports it
          at <code>src/routes/index.tsx:4</code>, the graph at <code>src/routes/graph.tsx:28</code>,
          the plans page at <code>src/routes/subscribe.tsx:4</code>, and the shared header at{" "}
          <code>src/components/site/LandingHeader.tsx:4</code>. The same component is also imported
          by the privacy, status, limits, changelog, partnerships, memory, docs and MCP routes. A
          signature change would therefore touch every one of those pages at compile time, and a
          styling change would alter every one of them visually.
        </p>
        <Evidence title="Files to open, in this order">
          <p>
            <code>src/components/brand/NykstLogo.tsx:76</code> defines the public surface. Read the
            props before you read the callers.
          </p>
          <p>
            <code>src/routes/index.tsx:745</code> and{" "}
            <code>src/components/site/LandingHeader.tsx:30</code> show the two most visible call
            sites. They pass different subtitles and sizes, which is why the props exist.
          </p>
          <p>
            <code>src/routes/graph.tsx:708</code> is the working surface. A layout change that looks
            fine on the landing page can still collide with the graph header.
          </p>
        </Evidence>
        <p className="text-muted-foreground mt-3">
          That is the whole proof. It is checkable in the repository today, and it does not require
          trusting a summary written by a model. If a line number moves, the file path still gives
          you the same evidence.
        </p>
      </section>

      <section>
        <h2 className="text-xl text-foreground">How a connection is traced</h2>
        <p className="text-muted-foreground mt-3">
          Import edges have a direction, but a person asking how two files are connected usually
          does not know which side imports the other. The tracer walks both outgoing dependency
          edges and incoming dependent edges, then records the direction of every hop. The
          implementation starts at <code>src/lib/analysis/trace.ts:40</code>; the direction is
          written into each step at lines 72 to 83. The result is a shortest path, capped at 16 hops
          by default, with the exact import line for every hop.
        </p>
        <p className="text-muted-foreground mt-3">
          The behaviour is pinned by tests in <code>tests/trace-path.test.ts</code>. The reverse
          chain case begins at line 44, the mixed-direction case at line 58, and the type-only case
          at line 73. If you are reviewing a claim about a chain, open the test that covers the
          shape of that chain. A direct import and a reverse dependency are not the same statement,
          and the proof should never blur them.
        </p>
      </section>

      <section>
        <h2 className="text-xl text-foreground">What the proof does not say</h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5">
          <li>
            It does not prove the database state, the runtime configuration or the data inside a
            production environment. It reads code, not live rows.
          </li>
          <li>
            It does not see imports built from runtime strings, and it does not guess a framework
            convention that is not written as an import. The analysis limitations say this on the
            page rather than filling the gap with a plausible edge.
          </li>
          <li>
            It does not turn a green type check into a guarantee. A visual regression, a broken
            migration or a missing environment variable can pass the compiler and still fail in
            production.
          </li>
          <li>
            A missing test is not evidence of safety. Nykst lists coverage only when it can point to
            a test file that imports the item. Review the test, do not count it.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl text-foreground">A short review routine</h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5">
          <li>Open the definition and read the actual exported surface.</li>
          <li>Open two direct importers with different jobs, not the two closest names.</li>
          <li>Follow one chain to an entrypoint and confirm the entrypoint still exists.</li>
          <li>Find the test that covers the changed behaviour, if there is one, and read it.</li>
          <li>Write down the check you will run. If the proof cannot name a check, say so.</li>
        </ol>
        <p className="text-muted-foreground mt-4">
          The live map is at{" "}
          <Link to="/graph" className="text-primary underline underline-offset-4">
            /graph
          </Link>
          . Open the Nykst example, search for <code>NykstBrand</code>, and compare the dossier with
          the files above.
        </p>
      </section>
    </GuideShell>
  );
}
