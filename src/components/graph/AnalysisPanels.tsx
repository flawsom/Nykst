import { useMemo, useState } from "react";
import type { GraphNode } from "@/lib/graph-data";
import type { RepositorySnapshot } from "@/lib/repository-graph";
import {
  chainFor,
  historyFor,
  impactOf,
  indexAnalysis,
  type ImpactLevel,
} from "@/lib/analysis/impact";
import type { RepoAnalysis } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

const LEVEL_TONE: Record<ImpactLevel, string> = {
  Low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  Moderate: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  High: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  Critical: "border-red-500/40 bg-red-500/10 text-red-400",
};

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-surface space-y-3 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-primary font-mono text-[11px] font-semibold tracking-wider uppercase">
          {title}
        </span>
        {hint && <span className="text-muted-foreground text-[10px]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-xs">{children}</p>;
}

function useLinks(snapshot: RepositorySnapshot) {
  const base = snapshot.repository?.html_url;
  const ref = snapshot.analysis?.ref ?? snapshot.repository?.default_branch ?? "main";
  return (path: string, line?: number) =>
    base ? `${base}/blob/${ref}/${path}${line ? `#L${line}` : ""}` : undefined;
}

function FileLink({
  href,
  path,
  line,
  tag,
}: {
  href: string | undefined;
  path: string;
  line?: number;
  tag?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="hover:text-primary min-w-0 truncate"
        title={path}
      >
        {path}
        {line ? <span className="text-muted-foreground">:{line}</span> : null}
      </a>
      {tag && <span className="text-muted-foreground shrink-0 text-[10px] uppercase">{tag}</span>}
    </div>
  );
}

function ShowMore<T>({
  items,
  limit = 12,
  render,
}: {
  items: T[];
  limit?: number;
  render: (item: T, index: number) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const visible = open ? items : items.slice(0, limit);
  return (
    <div className="space-y-1">
      {visible.map(render)}
      {items.length > limit && (
        <button onClick={() => setOpen((value) => !value)} className="text-primary text-[11px]">
          {open ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

/** What breaks if this node changes, computed from the compiler-based import graph. */
export function ImpactPanel({ snapshot, node }: { snapshot: RepositorySnapshot; node: GraphNode }) {
  const analysis = snapshot.analysis!;
  const link = useLinks(snapshot);
  const seeds = useMemo(() => node.analysisRef?.paths ?? [], [node.analysisRef]);
  const index = indexAnalysis(analysis);
  const report = useMemo(() => impactOf(index, seeds), [index, seeds]);
  const history = useMemo(() => historyFor(snapshot.history, seeds), [snapshot.history, seeds]);
  const seedSet = new Set(seeds);
  const single = seeds.length === 1 ? index.files.get(seeds[0]!) : undefined;
  const cycles = analysis.cycles.filter((cycle) => cycle.some((path) => seedSet.has(path)));
  const runtimeNonTest = report.impacted.filter(
    (item) => !item.typeOnly && item.role !== "test",
  ).length;

  if (!seeds.length)
    return (
      <Empty>No analyzed source files belong to this node, so there is nothing to trace.</Empty>
    );

  const outgoing = seeds.flatMap((path) =>
    (index.dependencies.get(path) ?? [])
      .filter((edge) => !seedSet.has(edge.path))
      .map((edge) => ({ ...edge, from: path })),
  );
  const packages = [
    ...new Set(
      seeds.flatMap(
        (path) =>
          index.files
            .get(path)
            ?.imports.filter((i) => i.kind === "external")
            .map((i) => i.target!) ?? [],
      ),
    ),
  ].sort();
  const unresolved = seeds.flatMap((path) =>
    (index.files.get(path)?.imports ?? [])
      .filter((i) => i.kind === "unresolved")
      .map((i) => ({ path, ...i })),
  );
  const resources = seeds.flatMap((path) =>
    (index.files.get(path)?.resources ?? []).map((use) => ({ path, ...use })),
  );
  const services = [...new Set(seeds.flatMap((path) => index.files.get(path)?.services ?? []))];

  return (
    <div className="space-y-4">
      <section className={cn("rounded-xl border p-4", LEVEL_TONE[report.level])}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold tracking-wider uppercase">
            {report.level} impact
          </span>
          <span className="text-[10px] opacity-80">
            {seeds.length === 1 ? seeds[0] : `${seeds.length} files`}
          </span>
        </div>
        <p className="text-foreground mt-2 text-sm leading-relaxed">
          Changing {node.label} reaches <strong>{runtimeNonTest}</strong> file
          {runtimeNonTest === 1 ? "" : "s"} through runtime imports
          {report.entrypoints.length ? (
            <>
              , including <strong>{report.entrypoints.length}</strong> page/API entry point
              {report.entrypoints.length === 1 ? "" : "s"}
            </>
          ) : null}
          {report.impacted.length > report.runtimeCount
            ? `, plus ${report.impacted.length - report.runtimeCount} through type-only imports`
            : ""}
          .{" "}
          {report.tests.length
            ? `${report.tests.length} test file${report.tests.length === 1 ? "" : "s"} import it directly or indirectly.`
            : "No test file imports it, directly or indirectly."}
        </p>
      </section>

      {node.analysisRef?.type === "resource" && index.resources.get(node.analysisRef.key) && (
        <Card title="Where it is used" hint="reads, writes and definitions">
          <ShowMore
            items={[
              ...index.resources
                .get(node.analysisRef.key)!
                .definedIn.map((path) => ({ path, line: 0, tag: "defined" })),
              ...index.resources
                .get(node.analysisRef.key)!
                .uses.map((use) => ({ ...use, tag: "used" })),
            ]}
            render={(use, i) => (
              <FileLink
                key={`${use.path}-${use.line}-${i}`}
                href={link(use.path, use.line || undefined)}
                path={use.path}
                {...(use.line ? { line: use.line } : {})}
                tag={use.tag}
              />
            )}
          />
        </Card>
      )}

      {node.analysisRef?.type === "service" && index.services.get(node.analysisRef.key) && (
        <Card title="Evidence" hint="why Nykst believes this service is used">
          <ShowMore
            items={index.services.get(node.analysisRef.key)!.evidence}
            render={(item, i) => (
              <FileLink
                key={`${item.path}-${i}`}
                href={link(item.path, item.line)}
                path={item.path}
                {...(item.line ? { line: item.line } : {})}
                tag={item.reason}
              />
            )}
          />
        </Card>
      )}

      <Card title="Directly imported by" hint="file:line of the import">
        {report.direct.length ? (
          <ShowMore
            items={report.direct}
            render={(item) => (
              <FileLink
                key={item.path}
                href={link(item.path, item.line)}
                path={item.path}
                line={item.line}
                tag={item.typeOnly ? "type only" : item.role}
              />
            )}
          />
        ) : (
          <Empty>
            Nothing in the repository imports this. It is either an entry point, loaded by framework
            convention, or unused.
          </Empty>
        )}
      </Card>

      <Card title="Entry points affected" hint="shortest import chain">
        {report.entrypoints.length ? (
          <ShowMore
            items={report.entrypoints}
            limit={8}
            render={(item) => (
              <div key={item.path} className="space-y-0.5">
                <FileLink href={link(item.path)} path={item.path} tag={item.role} />
                <p
                  className="text-muted-foreground truncate font-mono text-[10px]"
                  title={chainFor(report, item.path).join(" → ")}
                >
                  {chainFor(report, item.path)
                    .map((path) => path.split("/").pop())
                    .join(" → ")}
                </p>
              </div>
            )}
          />
        ) : (
          <Empty>No page or API route depends on this through runtime imports.</Empty>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Tests to run">
          {report.tests.length ? (
            <ShowMore
              items={report.tests}
              limit={8}
              render={(item) => (
                <FileLink key={item.path} href={link(item.path)} path={item.path} />
              )}
            />
          ) : (
            <Empty>No tests reach this code. Verify changes manually.</Empty>
          )}
        </Card>
        <Card title="Areas affected">
          {report.areas.length ? (
            <div className="flex flex-wrap gap-1.5">
              {report.areas.slice(0, 16).map((area) => (
                <span
                  key={area.area}
                  className="border-border rounded border px-2 py-0.5 font-mono text-[10px]"
                >
                  {area.area} · {area.files}
                </span>
              ))}
            </div>
          ) : (
            <Empty>Contained to this node.</Empty>
          )}
        </Card>
      </div>

      <Card
        title="Depends on"
        hint={`${outgoing.length} internal imports · ${packages.length} packages`}
      >
        {outgoing.length ? (
          <ShowMore
            items={outgoing}
            limit={10}
            render={(edge, i) => (
              <FileLink
                key={`${edge.from}-${edge.path}-${i}`}
                href={link(edge.from, edge.line)}
                path={edge.path}
                tag={edge.typeOnly ? "type only" : `from :${edge.line}`}
              />
            )}
          />
        ) : (
          <Empty>No internal imports outside this node.</Empty>
        )}
        {packages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {packages.slice(0, 40).map((pkg) => (
              <span key={pkg} className="bg-card rounded px-1.5 py-0.5 font-mono text-[10px]">
                {pkg}
              </span>
            ))}
          </div>
        )}
      </Card>

      {(services.length > 0 || resources.length > 0) && (
        <Card title="External systems touched">
          {services.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {services.map((id) => (
                <span
                  key={id}
                  className="border-primary/30 text-primary rounded border px-2 py-0.5 text-[11px]"
                >
                  {index.services.get(id)?.name ?? id}
                </span>
              ))}
            </div>
          )}
          {resources.length > 0 && (
            <ShowMore
              items={resources}
              limit={10}
              render={(use, i) => (
                <FileLink
                  key={`${use.id}-${use.path}-${i}`}
                  href={link(use.path, use.line)}
                  path={`${use.id}`}
                  tag={use.path.split("/").pop() ?? ""}
                />
              )}
            />
          )}
        </Card>
      )}

      <Card
        title="Change history"
        hint={
          snapshot.history
            ? `last ${snapshot.history.commits.length} commits, ${snapshot.history.pullRequests.length} PRs`
            : "re-ingest to load"
        }
      >
        {history.coChange.length > 0 && (
          <div className="space-y-1">
            <p className="text-muted-foreground text-[11px]">
              Usually changed together (not visible as imports):
            </p>
            {history.coChange.slice(0, 8).map((item) => (
              <FileLink
                key={item.path}
                href={link(item.path)}
                path={item.path}
                tag={`${item.count}×`}
              />
            ))}
          </div>
        )}
        {history.commits.length ? (
          <ShowMore
            items={history.commits}
            limit={6}
            render={(commit) => (
              <a
                key={commit.sha}
                href={commit.url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-primary block truncate text-[11px]"
              >
                <span className="text-muted-foreground font-mono">
                  {commit.sha.slice(0, 7)} · {commit.date.slice(0, 10)} · {commit.author}
                </span>{" "}
                {commit.message}
              </a>
            )}
          />
        ) : (
          <Empty>No recent commit touched these files.</Empty>
        )}
        {history.pullRequests.length > 0 && (
          <div className="space-y-1 pt-1">
            {history.pullRequests.slice(0, 6).map((pull) => (
              <a
                key={pull.number}
                href={pull.url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-primary block truncate text-[11px]"
              >
                <span className="text-muted-foreground font-mono">
                  #{pull.number} · {pull.mergedAt ? "merged" : pull.state}
                </span>{" "}
                {pull.title}
                {pull.closes.length ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · closes {pull.closes.map((n) => `#${n}`).join(", ")}
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        )}
      </Card>

      {(cycles.length > 0 || unresolved.length > 0) && (
        <Card title="Structural warnings">
          {cycles.map((cycle, i) => (
            <p key={i} className="text-xs">
              Circular import between {cycle.length} files:{" "}
              <span className="text-muted-foreground font-mono text-[10px]">
                {cycle
                  .slice(0, 6)
                  .map((p) => p.split("/").pop())
                  .join(" ↔ ")}
                {cycle.length > 6 ? " …" : ""}
              </span>
            </p>
          ))}
          {unresolved.map((item, i) => (
            <FileLink
              key={`${item.path}-${i}`}
              href={link(item.path, item.line)}
              path={`${item.specifier}`}
              tag="unresolved import"
            />
          ))}
        </Card>
      )}

      {single && (
        <Card title="Symbols">
          <p className="text-xs">
            <span className="text-muted-foreground">Exports:</span>{" "}
            <span className="font-mono">{single.exports.join(", ") || "none"}</span>
          </p>
          {single.functions.length > 0 && (
            <p className="text-xs">
              <span className="text-muted-foreground">Functions:</span>{" "}
              <span className="font-mono">{single.functions.join(", ")}</span>
            </p>
          )}
          {single.classes.length > 0 && (
            <p className="text-xs">
              <span className="text-muted-foreground">Classes:</span>{" "}
              <span className="font-mono">{single.classes.join(", ")}</span>
            </p>
          )}
          {single.envVars.length > 0 && (
            <p className="text-xs">
              <span className="text-muted-foreground">Environment:</span>{" "}
              <span className="font-mono">{single.envVars.join(", ")}</span>
            </p>
          )}
        </Card>
      )}

      <Limitations analysis={analysis} extra={snapshot.history?.limitations ?? []} />
    </div>
  );
}

function Limitations({ analysis, extra }: { analysis: RepoAnalysis; extra: string[] }) {
  return (
    <details className="border-border rounded-xl border border-dashed p-3 text-[11px]">
      <summary className="text-muted-foreground cursor-pointer">
        What this analysis cannot see
      </summary>
      <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-4">
        {[...analysis.limitations, ...extra].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

/** Repository-wide architecture facts: services, data, environment, hotspots. */
export function ArchitecturePanel({ snapshot }: { snapshot: RepositorySnapshot }) {
  const analysis = snapshot.analysis!;
  const link = useLinks(snapshot);
  const index = indexAnalysis(analysis);
  const hotspots = useMemo(
    () =>
      [...index.dependents.entries()]
        .map(([path, edges]) => ({ path, count: new Set(edges.map((edge) => edge.path)).size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
    [index],
  );
  const entrypoints = analysis.files.filter((file) => file.role === "route" || file.role === "api");
  const stats = analysis.stats;

  return (
    <div className="space-y-4">
      <Card title="Analysis" hint={`${analysis.method} · ${analysis.ref.slice(0, 8)}`}>
        <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
          <div>
            Source files{" "}
            <strong className="block">{stats.analyzedFiles.toLocaleString("en-US")}</strong>
          </div>
          <div>
            Import edges{" "}
            <strong className="block">{stats.internalEdges.toLocaleString("en-US")}</strong>
          </div>
          <div>
            Packages <strong className="block">{stats.externalPackages}</strong>
          </div>
          <div>
            Entry points <strong className="block">{entrypoints.length}</strong>
          </div>
          <div>
            LOC <strong className="block">{stats.loc.toLocaleString("en-US")}</strong>
          </div>
          <div>
            Unresolved <strong className="block">{stats.unresolvedImports}</strong>
          </div>
          <div>
            Cycles <strong className="block">{analysis.cycles.length}</strong>
          </div>
          <div>
            Workspaces <strong className="block">{analysis.packages.length}</strong>
          </div>
        </div>
      </Card>

      <Card title="External services" hint="with the evidence that proves each one">
        {analysis.services.length ? (
          analysis.services.map((service) => (
            <details key={service.id} className="text-xs">
              <summary className="cursor-pointer">
                <strong>{service.name}</strong>{" "}
                <span className="text-muted-foreground">
                  · {service.category} · {service.files.length} file
                  {service.files.length === 1 ? "" : "s"}
                  {service.envVars.length ? ` · ${service.envVars.join(", ")}` : ""}
                </span>
              </summary>
              <div className="mt-1.5 space-y-1 pl-3">
                {service.evidence.slice(0, 12).map((item, i) => (
                  <FileLink
                    key={i}
                    href={link(item.path, item.line)}
                    path={item.path}
                    {...(item.line ? { line: item.line } : {})}
                    tag={item.reason}
                  />
                ))}
              </div>
            </details>
          ))
        ) : (
          <Empty>No external services were detected.</Empty>
        )}
      </Card>

      <Card title="Data" hint="tables, functions and models">
        {analysis.resources.length ? (
          <ShowMore
            items={analysis.resources}
            limit={12}
            render={(resource) => (
              <div key={resource.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono">
                  {resource.kind} {resource.name}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {resource.uses.length
                    ? `${new Set(resource.uses.map((use) => use.path)).size} files`
                    : "unused in code"}
                  {resource.definedIn.length ? "" : " · no definition found"}
                </span>
              </div>
            )}
          />
        ) : (
          <Empty>No database tables, RPC functions or ORM models were found.</Empty>
        )}
      </Card>

      <Card title="Most depended-on files" hint="changes here ripple the furthest">
        {hotspots.map((item) => (
          <FileLink
            key={item.path}
            href={link(item.path)}
            path={item.path}
            tag={`${item.count} importers`}
          />
        ))}
      </Card>

      <Card title="Environment variables">
        {analysis.envVars.length ? (
          <ShowMore
            items={analysis.envVars}
            limit={12}
            render={(env) => (
              <div key={env.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono">{env.name}</span>
                <span
                  className="text-muted-foreground truncate text-[10px]"
                  title={env.files.join("\n")}
                >
                  {env.files.length} file{env.files.length === 1 ? "" : "s"}
                </span>
              </div>
            )}
          />
        ) : (
          <Empty>No environment variable reads were found.</Empty>
        )}
      </Card>

      {analysis.cycles.length > 0 && (
        <Card title="Circular imports">
          {analysis.cycles.slice(0, 8).map((cycle, i) => (
            <p key={i} className="text-muted-foreground font-mono text-[10px]">
              {cycle.slice(0, 8).join(" ↔ ")}
              {cycle.length > 8 ? ` … (${cycle.length})` : ""}
            </p>
          ))}
        </Card>
      )}

      <Limitations analysis={analysis} extra={snapshot.history?.limitations ?? []} />
    </div>
  );
}
