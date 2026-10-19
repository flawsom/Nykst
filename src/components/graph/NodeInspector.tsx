import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { GraphNode } from "@/lib/graph-data";
import type { RepositorySnapshot } from "@/lib/repository-graph";
import { cn } from "@/lib/utils";
import { askNykstAi, openApiSettings } from "@/lib/ai-client";
import { Code, Layers, GitBranch, History, Brain, Send } from "lucide-react";
import { ArchitecturePanel, ImpactPanel } from "./AnalysisPanels";

type TabId = "code" | "architecture" | "dependencies" | "history" | "memory";
type Props = {
  node: GraphNode | null;
  open: boolean;
  onClose: () => void;
  repositorySnapshot?: RepositorySnapshot;
};
type Evidence = {
  path: string;
  content?: string;
  sha?: string;
  imports: Array<{ target: string; line: number; resolved: boolean }>;
  dependents: Array<{ path: string; line: number; commitSha: string }>;
  commits: Array<Record<string, unknown>>;
  pullRequests: Array<Record<string, unknown>>;
  coChange: Array<{ path: string; count: number }>;
  blindSpots: string[];
};

function text(record: Record<string, unknown>, key: string) {
  const item = record[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : "";
}
function unavailable(message: string) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-xs leading-relaxed text-muted-foreground">
      {message}
    </p>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-primary">
        {title}
      </span>
      {children}
    </section>
  );
}
function lines(content: string, pattern: RegExp) {
  return content
    .split("\n")
    .map((line, index) => (pattern.test(line) ? `${index + 1}: ${line.trim()}` : ""))
    .filter(Boolean)
    .slice(0, 30);
}
function dependencyHops(snapshot: RepositorySnapshot, target: string) {
  const reverse = new Map<string, string[]>();
  for (const edge of snapshot.dependency_graph?.edges ?? []) {
    if (edge.kind !== "internal" || !edge.from || !edge.to) continue;
    reverse.set(edge.to, [...(reverse.get(edge.to) ?? []), edge.from]);
  }
  const seen = new Set([target]);
  const grouped: Array<{ hop: number; path: string; label: "EXTRACTED" | "INFERRED" }> = [];
  let frontier = [target];
  for (let hop = 1; hop <= 3; hop += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const dependent of reverse.get(current) ?? []) {
        if (seen.has(dependent)) continue;
        seen.add(dependent);
        next.push(dependent);
        grouped.push({ hop, path: dependent, label: hop === 1 ? "EXTRACTED" : "INFERRED" });
      }
    }
    frontier = next;
  }
  return grouped;
}

export function NodeInspector({ node, open, onClose, repositorySnapshot }: Props) {
  const [tab, setTab] = useState<TabId>("code");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [chainTarget, setChainTarget] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const filePath = selectedPath ?? node?.detail?.path ?? "";
  const repoName = node?.repo ?? repositorySnapshot?.repository?.full_name ?? "";
  const [owner, repo] = repoName.split("/");
  const live = Boolean(repositorySnapshot && owner && repo);

  useEffect(() => {
    if (!open || !live || !filePath) return;
    setLoadingEvidence(true);
    setEvidence(null);
    fetch(
      `/api/integrations/github/file-evidence?owner=${encodeURIComponent(owner!)}&repo=${encodeURIComponent(repo!)}&path=${encodeURIComponent(filePath)}&branch=${encodeURIComponent(repositorySnapshot?.repository?.default_branch ?? "main")}`,
    )
      .then(async (response) => {
        const payload = (await response.json()) as { evidence?: Evidence; error?: string };
        if (!response.ok || !payload.evidence)
          throw new Error(payload.error ?? "Could not load GitHub file evidence.");
        setEvidence(payload.evidence);
      })
      .catch(() => setEvidence(null))
      .finally(() => setLoadingEvidence(false));
  }, [open, live, filePath, owner, repo, repositorySnapshot?.repository?.default_branch]);

  // With a compiler-based analysis the impact view is the most useful place to land.
  useEffect(() => {
    if (open && repositorySnapshot?.analysis?.files) setTab("dependencies");
  }, [open, node?.id, repositorySnapshot?.analysis?.files]);

  const tabs = useMemo(
    () => [
      { id: "code" as const, label: "1. Code Analysis", icon: Code },
      { id: "architecture" as const, label: "2. Architecture", icon: Layers },
      { id: "dependencies" as const, label: "3. Impact", icon: GitBranch },
      { id: "history" as const, label: "4. History", icon: History },
      { id: "memory" as const, label: "5. Memory", icon: Brain },
    ],
    [],
  );

  if (!node) return null;

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = query.trim();
    if (!question || asking) return;
    setAsking(true);
    setAnswer("Retrieving evidence from GitHub…");
    const context = JSON.stringify({
      repository: repositorySnapshot?.repository,
      selectedNode: node,
      fileEvidence: evidence,
      snapshot: repositorySnapshot,
    });
    const result = await askNykstAi(
      `${question}\n\nAnswer only from retrieved evidence. Cite a file path, commit SHA, or PR number for every material claim. If the evidence is missing, say so plainly. Do not infer runtime facts.`,
      context,
    );
    setAnswer(result.ok ? result.answer : result.error);
    if (!result.ok && result.needsKey) openApiSettings();
    setAsking(false);
  };

  const renderCode = () => {
    if (!repositorySnapshot)
      return unavailable(
        "Connect GitHub to replace this dossier with authenticated repository evidence.",
      );
    const content = evidence?.content ?? "";
    const packageFiles = (repositorySnapshot.files ?? []).filter((file) =>
      /(^|\/)(package\.json|vite\.config\.|tsconfig\.json|\.env|Dockerfile|Makefile)/i.test(
        file.path ?? "",
      ),
    );
    return (
      <div className="space-y-4">
        <Card title="Preview">
          <p className="text-xs text-muted-foreground">
            {filePath || "Select a file node to preview its GitHub content."}
          </p>
          {loadingEvidence ? (
            unavailable("Loading the selected file from GitHub…")
          ) : content ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-card p-3 text-[11px] font-mono">
              {content}
            </pre>
          ) : (
            unavailable("No file content was returned by GitHub.")
          )}
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Export">
            <p className="text-xs text-muted-foreground">
              SHA:{" "}
              <span className="font-mono text-foreground">{evidence?.sha ?? "Unavailable"}</span>
            </p>
            <a
              href={
                repositorySnapshot.repository?.html_url
                  ? `${repositorySnapshot.repository.html_url}/blob/${repositorySnapshot.repository.default_branch ?? "main"}/${filePath}`
                  : undefined
              }
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline"
            >
              Open exact file on GitHub
            </a>
          </Card>
          <Card title="Import">
            <div className="space-y-1 text-xs font-mono">
              {(evidence?.imports ?? []).slice(0, 20).map((item, index) => (
                <div key={`${item.target}-${index}`}>
                  L{item.line} · {item.target}{" "}
                  <span className={item.resolved ? "text-emerald-400" : "text-primary"}>
                    {item.resolved ? "RESOLVED" : "UNRESOLVED"}
                  </span>
                </div>
              ))}
              {!evidence?.imports.length && (
                <span className="text-muted-foreground">No imports extracted.</span>
              )}
            </div>
          </Card>
        </div>
        <Card title="Environment and services">
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {packageFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedPath(file.path ?? null)}
                className="rounded border border-border px-2 py-1 hover:border-primary"
              >
                {file.path}
              </button>
            ))}
          </div>
          {!packageFiles.length &&
            unavailable("No package or configuration files were included in the current tree.")}
        </Card>
        <Card title="Risk">
          <p className="text-xs leading-relaxed">
            Observed risk is limited to the retrieved evidence:{" "}
            {evidence?.blindSpots.length
              ? `${evidence.blindSpots.length} blind spot(s) were detected.`
              : "no blind spot was detected by the bounded parser."}{" "}
            This is not a runtime risk score.
          </p>
        </Card>
      </div>
    );
  };

  const analyzed = Boolean(repositorySnapshot?.analysis?.files);

  const renderArchitecture = () => {
    if (!repositorySnapshot)
      return unavailable("Architecture is unavailable until GitHub is connected.");
    if (analyzed) return <ArchitecturePanel snapshot={repositorySnapshot} />;
    const files = repositorySnapshot.files ?? [];
    const folders = [
      ...new Set(files.map((file) => file.path?.split("/").slice(0, -1).join("/")).filter(Boolean)),
    ].slice(0, 80) as string[];
    const entries = files.filter((file) =>
      /(^|\/)(main|index|server|app)\.(tsx?|jsx?|py|go)$/.test(file.path ?? ""),
    );
    return (
      <div className="space-y-4">
        <Card title="Stack">
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              Language signals{" "}
              <strong>
                {[
                  ...new Set(files.map((file) => file.path?.split(".").pop()).filter(Boolean)),
                ].join(", ") || "Unavailable"}
              </strong>
            </div>
            <div>
              Build / validation{" "}
              <strong>
                {repositorySnapshot.validation_profile?.commands?.join(", ") || "Unavailable"}
              </strong>
            </div>
            <div>
              Package manager{" "}
              <strong>
                {repositorySnapshot.validation_profile?.package_manager ?? "Unavailable"}
              </strong>
            </div>
            <div>
              Key libraries{" "}
              <strong>
                {repositorySnapshot.validation_profile?.key_libraries?.join(", ") || "Unavailable"}
              </strong>
            </div>
            <div>
              Config files{" "}
              <strong>
                {
                  files.filter((file) => /config|\.env|Dockerfile|Makefile/i.test(file.path ?? ""))
                    .length
                }
              </strong>
            </div>
          </div>
        </Card>
        <Card title="Module map">
          <div className="space-y-1 text-xs">
            {folders.map((folder) => (
              <button
                key={folder}
                onClick={() => setSelectedPath(folder)}
                className="block w-full rounded px-2 py-1 text-left hover:bg-secondary"
              >
                <span className="font-mono">{folder}</span>{" "}
                <span className="text-muted-foreground">
                  · {files.filter((file) => file.path?.startsWith(`${folder}/`)).length} files ·
                  responsibility inferred from folder name
                </span>
              </button>
            ))}
            {!folders.length && unavailable("No folder map available.")}
          </div>
        </Card>
        <Card title="Entry points">
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {entries.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedPath(file.path ?? null)}
                className="rounded border border-border px-2 py-1 hover:border-primary"
              >
                {file.path}
              </button>
            ))}
            {!entries.length && (
              <span className="text-muted-foreground">
                No conventional entry point was identified.
              </span>
            )}
          </div>
        </Card>
        <Card title="Dependency direction">
          <div className="space-y-1 text-xs font-mono">
            {(repositorySnapshot.dependency_graph?.edges ?? [])
              .filter((edge) => edge.kind === "internal")
              .slice(0, 80)
              .map((edge, index) => (
                <div key={`${edge.from}-${edge.to}-${index}`}>
                  {edge.from} → {edge.to}
                </div>
              ))}
            {!(repositorySnapshot.dependency_graph?.edges ?? []).some(
              (edge) => edge.kind === "internal",
            ) && (
              <span className="text-muted-foreground">
                No internal dependency direction was captured.
              </span>
            )}
          </div>
        </Card>
      </div>
    );
  };

  const renderDependencies = () => {
    if (!repositorySnapshot)
      return unavailable("Dependencies are unavailable until GitHub is connected.");
    if (analyzed && node.analysisRef)
      return <ImpactPanel snapshot={repositorySnapshot} node={node} />;
    if (analyzed) return unavailable("This node is not part of the analyzed source tree.");
    const hops = dependencyHops(repositorySnapshot, filePath);
    const directLines = new Map((evidence?.dependents ?? []).map((item) => [item.path, item.line]));
    return (
      <div className="space-y-4">
        <Card title="Imports">
          <div className="space-y-1 text-xs font-mono">
            {(evidence?.imports ?? []).map((item, index) => (
              <div key={`${item.target}-${index}`}>
                L{item.line} · {item.target} ·{" "}
                {item.resolved ? "EXTRACTED / RESOLVED" : "EXTRACTED / UNRESOLVED"}
              </div>
            ))}
            {!evidence?.imports.length && (
              <span className="text-muted-foreground">No imports extracted.</span>
            )}
          </div>
        </Card>
        <Card title="Dependents">
          <div className="space-y-1 text-xs font-mono">
            {(evidence?.dependents ?? []).slice(0, 60).map((item, index) => (
              <button
                key={`${item.path}-${index}`}
                onClick={() => setChainTarget(item.path)}
                className="block w-full text-left hover:text-primary"
              >
                L{item.line} · {item.path} · EXTRACTED
              </button>
            ))}
            {!evidence?.dependents.length && (
              <span className="text-muted-foreground">No direct importers were proven.</span>
            )}
          </div>
        </Card>
        <Card title="Blast radius">
          <div className="space-y-1 text-xs font-mono">
            {hops.map((item) => (
              <button
                key={`${item.hop}-${item.path}`}
                onClick={() => setChainTarget(item.path)}
                className="block w-full text-left hover:text-primary"
              >
                Hop {item.hop} · {item.path} · line {directLines.get(item.path) ?? "unavailable"} ·{" "}
                {item.label}
              </button>
            ))}
            {!hops.length && (
              <span className="text-muted-foreground">
                No transitive dependents were extracted from the bounded graph.
              </span>
            )}
          </div>
          {chainTarget && <p className="mt-2 text-xs font-mono">Chain target: {chainTarget}</p>}
        </Card>
        <Card title="Blind spots">
          <div className="space-y-1 text-xs">
            {(evidence?.blindSpots ?? []).map((item) => (
              <p key={item}>• {item}</p>
            ))}
            {!evidence?.blindSpots.length && (
              <p>No blind spots reported by the bounded extractor.</p>
            )}
          </div>
        </Card>
      </div>
    );
  };

  const renderHistory = () => {
    if (!evidence) return unavailable("Load a file-level GitHub history by selecting a file node.");
    const reverts = evidence.commits.filter((commit) =>
      /revert/i.test(text(commit, "message") || text(commit, "commit")),
    );
    const outcomes = {
      held: evidence.commits.length - reverts.length,
      reverted: reverts.length,
      fixes: evidence.commits.filter((commit) => /fix|bug|patch/i.test(text(commit, "message")))
        .length,
    };
    return (
      <div className="space-y-4">
        <Card title="Commits touching the file">
          <div className="space-y-2 text-xs">
            {evidence.commits.map((commit, index) => (
              <div key={`${text(commit, "sha")}-${index}`}>
                <span className="font-mono">
                  {text(commit, "sha").slice(0, 8) || "sha unavailable"}
                </span>{" "}
                · {text(commit, "message") || "message unavailable"}
                <div className="text-muted-foreground">
                  {text(commit, "author") || "author unavailable"} ·{" "}
                  {text(commit, "date") || text(commit, "commit") || "date unavailable"}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="PRs that touched it">
          <div className="space-y-1 text-xs">
            {evidence.pullRequests.map((pr, index) => (
              <a
                key={`${text(pr, "number")}-${index}`}
                href={text(pr, "html_url") || undefined}
                target="_blank"
                rel="noreferrer"
                className="block text-primary underline"
              >
                #{text(pr, "number")} · {text(pr, "title")} · {text(pr, "state")}
              </a>
            ))}
            {!evidence.pullRequests.length && (
              <span className="text-muted-foreground">
                No matching PR was found in the bounded scan.
              </span>
            )}
          </div>
        </Card>
        <Card title="Reverts and outcomes">
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div>
              Held <strong>{outcomes.held}</strong>
            </div>
            <div>
              Reverted <strong>{outcomes.reverted}</strong>
            </div>
            <div>
              Fix-like <strong>{outcomes.fixes}</strong>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Computed from GitHub commit messages; not a claim about production outcome.
          </p>
        </Card>
        <Card title="Co-change">
          <div className="space-y-1 text-xs font-mono">
            {evidence.coChange.map((item) => (
              <div key={item.path}>
                {item.path} · {item.count} shared commit(s)
              </div>
            ))}
            {!evidence.coChange.length && (
              <span className="text-muted-foreground">No co-change evidence returned.</span>
            )}
          </div>
        </Card>
      </div>
    );
  };

  const renderMemory = () => (
    <div className="space-y-4">
      <Card title="Ask Nykst">
        <form onSubmit={ask} className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask from retrieved evidence…"
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
          <button
            disabled={asking}
            className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
          >
            <Send className="size-4" />
          </button>
        </form>
        {answer && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>}
      </Card>
      <Card title="Decisions found">
        <p className="text-xs text-muted-foreground">
          Decision extraction from README, AGENTS.md, commit messages, and PR descriptions requires
          those file contents and sources in the current evidence response. Nykst will not invent
          decisions.
        </p>
      </Card>
      <Card title="Outcomes">
        <p className="text-xs text-muted-foreground">
          History-derived counts are shown in the History tab. Runtime outcomes such as “held in
          production” require deployment or observability evidence.
        </p>
      </Card>
      <Card title="Failure patterns">
        <p className="text-xs text-muted-foreground">
          Repeated reverts and fix-like commits are visible from the selected file’s GitHub history.
          No evidence means no failure pattern is asserted.
        </p>
      </Card>
    </div>
  );

  const content =
    tab === "code"
      ? renderCode()
      : tab === "architecture"
        ? renderArchitecture()
        : tab === "dependencies"
          ? renderDependencies()
          : tab === "history"
            ? renderHistory()
            : renderMemory();
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="h-[92vh] max-w-[min(1150px,96vw)] gap-0 overflow-hidden border-border bg-card p-0">
        <div className="flex h-full min-h-0 flex-col sm:flex-row">
          <aside className="w-full shrink-0 border-b border-border bg-surface p-3 sm:w-72 sm:border-b-0 sm:border-r sm:p-4">
            <div className="border-b border-border pb-4">
              <span className="text-[10px] font-mono uppercase tracking-widest text-primary">
                System dossier
              </span>
              <h3 className="mt-1 truncate text-sm font-semibold">{node.label}</h3>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {live ? "GitHub-grounded" : "No connected evidence"}
              </p>
            </div>
            <nav className="flex gap-1 overflow-x-auto pt-3 sm:block sm:space-y-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-medium sm:w-full",
                    tab === id
                      ? "border border-primary/30 bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </nav>
          </aside>
          <main className="min-h-0 flex-1 overflow-y-auto bg-background/50 p-4 sm:p-6">
            <div className="mb-5 border-b border-border pb-4">
              <h2 className="text-xl font-semibold">
                {tabs.find((item) => item.id === tab)?.label.replace(/^\d\. /, "")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {repoName || "Repository unavailable"} ·{" "}
                {node.detail?.path ?? "select a file for file-level evidence"}
              </p>
            </div>
            {loadingEvidence && (
              <p className="mb-4 text-xs text-muted-foreground">
                Fetching exact GitHub file evidence…
              </p>
            )}
            {content}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
