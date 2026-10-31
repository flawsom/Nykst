import { createFileRoute, Link } from "@tanstack/react-router";
import { GuideShell, Evidence } from "@/components/docs/GuideShell";
import { articleLd, canonicalUrl, shareMeta } from "@/lib/seo";

const TITLE = "How SQL column and migration impact works";
const DESCRIPTION =
  "What Nykst can prove about a database change from migration files and literal client calls, what it cannot prove, and how to review the result before running it.";
const PATH = "/guides/sql-migration-impact";
const PUBLISHED = "2026-10-31";

export const Route = createFileRoute("/guides/sql-migration-impact")({
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
      eyebrow="SQL and migrations"
      title={TITLE}
      description={DESCRIPTION}
      reviewed="31 October 2026"
    >
      <section>
        <h2 className="text-xl text-foreground">Nykst reads code, not your database</h2>
        <p className="text-muted-foreground mt-3">
          The SQL view is a static reading of two things: the DDL in migration files, and the
          literal query calls in application code. It never connects to a database, never reads live
          rows, and never runs a migration. That limit is the point. An impact proof should be
          inspectable before anyone touches production, and it should fail closed when a query is
          built from a runtime string.
        </p>
        <p className="text-muted-foreground mt-3">
          The parser collects column references in <code>src/lib/analysis/parse.server.ts:284</code>{" "}
          and appends them to the file result at line 644. It caps the stored list at 500 entries on
          line 714. The stated limitation is in <code>src/lib/analysis/engine.server.ts:540</code>:
          drift is computed from literal calls and DDL, and dynamic table or column names are not
          guessed. A missing result is not proof that the column is unused. It is proof that the
          scanner did not see a literal use.
        </p>
      </section>

      <section>
        <h2 className="text-xl text-foreground">A real migration in the example repository</h2>
        <p className="text-muted-foreground mt-3">
          The public Nykst repository contains{" "}
          <code>supabase/migrations/20261030130000_razorpay_subscriptions.sql</code>. Line 6 starts
          an <code>alter table</code> that adds seven columns without dropping or rewriting existing
          ones. The additions include <code>provider</code>, <code>trial_ends_at</code>,{" "}
          <code>checkout_started_at</code> and <code>cancel_at_period_end</code>. Line 17 creates a
          unique index on one of the new identifiers, guarded by a partial predicate so existing
          rows with a null value remain valid.
        </p>
        <p className="text-muted-foreground mt-3">
          The consolidated <code>supabase/schema.sql</code> repeats the same columns at lines 186 to
          189 and the same index at lines 193 to 195. That duplication is deliberate: a fresh
          database can be built from one idempotent file, while an existing database applies the
          timestamped migrations in order. The header at <code>supabase/schema.sql:3</code> states
          that it is every migration merged in order. If you review a column change, review both
          paths. A migration that is correct in isolation can still be missing from the consolidated
          schema.
        </p>
        <Evidence title="The four places to check">
          <p>
            <code>supabase/migrations/20261030130000_razorpay_subscriptions.sql:6</code> is the
            change to the existing table.
          </p>
          <p>
            <code>supabase/schema.sql:186</code> is the fresh-install path that must stay in sync.
          </p>
          <p>
            <code>src/lib/analysis/parse.server.ts:284</code> is how literal column references are
            collected from server code.
          </p>
          <p>
            <code>src/lib/analysis/engine.server.ts:540</code> is the limitation that prevents a
            false claim of completeness.
          </p>
        </Evidence>
      </section>

      <section>
        <h2 className="text-xl text-foreground">Add, rename, drop: three different proofs</h2>
        <p className="text-muted-foreground mt-3">
          An additive column is the safest case. Nykst can list the writers and readers that already
          name the table, but it cannot tell you that an old application version will ignore the new
          column. Check the deploy order and the rollback path yourself.
        </p>
        <p className="text-muted-foreground mt-3">
          A rename is a sequence, not a single edit. Add the new column, write to both columns,
          backfill, move readers, then remove the old column in a later migration. Nykst can show
          the files that mention the old column and the files that mention the new one. It cannot
          run the backfill or tell you whether every writer was deployed. The proof gives you the
          call sites to inspect; the deployment plan is still yours.
        </p>
        <p className="text-muted-foreground mt-3">
          A drop is the case where a missing reader matters most. If the caller is assembled from a
          variable, the static graph will not show it. Treat an empty dependent list as a prompt to
          search the runtime path, not as permission to delete. This is why the guide recommends a
          two-step removal even when the map looks clean.
        </p>
      </section>

      <section>
        <h2 className="text-xl text-foreground">Migration order is part of the proof</h2>
        <p className="text-muted-foreground mt-3">
          Migration files are applied by their timestamp prefix. The consolidated schema is built
          from the same order, so a column added in a later file cannot be used by an earlier one.
          When you read a SQL impact result, write down the file order and the first file that
          introduces the column. If a query in an earlier migration needs the column, the migration
          itself is wrong, regardless of what the graph says.
        </p>
        <p className="text-muted-foreground mt-3">
          The example migration also calls <code>notify pgrst, &apos;reload schema&apos;</code> at
          line 22. That is a real operational step: PostgREST caches the schema, so a column can
          exist in the database and still be invisible to the API until the cache reloads. A static
          map cannot observe that delay. It is a reminder that "the migration ran" and "the API
          serves the new column" are two different checks.
        </p>
      </section>

      <section>
        <h2 className="text-xl text-foreground">What not to claim</h2>
        <ul className="text-muted-foreground mt-3 list-disc space-y-2 pl-5">
          <li>Do not claim a change is safe because Nykst found no callers.</li>
          <li>
            Do not claim the production database matches the migrations. Nykst did not connect to
            it.
          </li>
          <li>
            Do not claim row level security, grants or policies were verified. Read them in the
            migration and test them with the real role.
          </li>
          <li>
            Do not claim a backfill is complete. The proof can name the writers, not the rows.
          </li>
        </ul>
        <p className="text-muted-foreground mt-4">
          Open the{" "}
          <Link to="/graph" className="text-primary underline underline-offset-4">
            system map
          </Link>{" "}
          and use the data section on a file to see the columns it reads. If a result is empty, read
          the limitation above before you treat it as a clean bill of health.
        </p>
      </section>
    </GuideShell>
  );
}
