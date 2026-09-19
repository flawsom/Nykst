import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { GraphNode } from "@/lib/graph-data";
import type { RepositorySnapshot } from "@/lib/repository-graph";
import { cn } from "@/lib/utils";
import { askNykstAi, openApiSettings } from "@/lib/ai-client";
import { Code, Layers, Cpu, GitCommit, Activity, AlertTriangle, Sparkles, GitPullRequest } from "lucide-react";

type TabId = "code" | "architecture" | "dependencies" | "changes" | "runtime" | "incidents" | "coding" | "ask";

type Props = { node: GraphNode | null; open: boolean; onClose: () => void; repositorySnapshot?: RepositorySnapshot };

function value(record: Record<string, unknown>, key: string) {
  const item = record[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : "";
}

function LiveUnavailable({ children }: { children: string }) {
  return <p className="text-muted-foreground rounded-lg border border-dashed border-border p-4 text-xs leading-relaxed">{children}</p>;
}

function LiveRepositoryTab({ tab, node, snapshot }: { tab: TabId; node: GraphNode; snapshot: RepositorySnapshot }) {
  const files = snapshot.files ?? [];
  const commits = snapshot.commits ?? [];
  const prs = snapshot.pull_requests ?? [];
  const issues = snapshot.issues ?? [];
  const selectedPath = node.detail?.path;
  const selectedFile = files.find((file) => file.path === selectedPath);
  const externalEdges = snapshot.dependency_graph?.edges?.filter((edge) => edge.kind === "external") ?? [];
  const closedIssues = issues.filter((issue) => value(issue, "state").toLowerCase() === "closed");

  if (tab === "code") return (
    <div className="space-y-4">
      <section className="border border-border bg-surface rounded-xl p-4 space-y-2">
        <span className="text-[11px] font-mono uppercase text-primary font-semibold">GitHub repository</span>
        <p className="text-sm font-medium font-mono">{snapshot.repository?.full_name ?? "Repository name unavailable"}</p>
        <p className="text-xs text-muted-foreground">Default branch: <span className="text-foreground font-mono">{snapshot.repository?.default_branch ?? "Unavailable"}</span></p>
        <p className="text-xs text-muted-foreground">No release or tag data was included in this ingestion.</p>
      </section>
      <section className="border border-border bg-surface rounded-xl p-4 space-y-3">
        <span className="text-[11px] font-mono uppercase text-primary font-semibold">Indexed file evidence</span>
        <p className="text-xs text-muted-foreground">{selectedPath ? `Selected path: ${selectedPath}` : `${files.length} files indexed in the current GitHub snapshot.`}</p>
        {selectedFile ? <pre className="text-xs font-mono whitespace-pre-wrap">{JSON.stringify(selectedFile, null, 2)}</pre> : <LiveUnavailable>Functions, classes, exports, and file contents are not present in the current GitHub tree snapshot. Nykst will not invent them.</LiveUnavailable>}
      </section>
    </div>
  );

  if (tab === "architecture") return (
    <div className="space-y-4">
      <section className="border border-border bg-surface rounded-xl p-4 space-y-3">
        <span className="text-[11px] font-mono uppercase text-primary font-semibold">Repository-derived architecture</span>
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div>Domains / roots <strong>{new Set(files.map((file) => file.path?.split("/")[0]).filter(Boolean)).size}</strong></div>
          <div>Files <strong>{files.length}</strong></div>
          <div>Dependency edges <strong>{snapshot.dependency_graph?.edges?.length ?? 0}</strong></div>
          <div>Scanned source files <strong>{snapshot.dependency_graph?.scanned_files ?? 0}</strong></div>
        </div>
      </section>
      <LiveUnavailable>Frontend, backend, database, queues, caches, authentication, and infrastructure cannot be asserted from a GitHub file tree alone. Connect runtime or deployment integrations to populate those layers.</LiveUnavailable>
    </div>
  );

  if (tab === "dependencies") return (
    <div className="space-y-4">
      <section className="border border-border bg-surface rounded-xl p-4 space-y-3">
        <span className="text-[11px] font-mono uppercase text-primary font-semibold">Observed dependency edges</span>
        <div className="space-y-1.5 text-xs font-mono max-h-72 overflow-y-auto">
          {(snapshot.dependency_graph?.edges ?? []).slice(0, 120).map((edge, index) => <div key={`${edge.from}-${edge.to}-${index}`} className="border-b border-border/60 pb-1">{edge.from} → {edge.to} <span className="text-muted-foreground">({edge.kind})</span></div>)}
          {(snapshot.dependency_graph?.edges ?? []).length === 0 && <LiveUnavailable>No dependency edges were captured in this ingestion.</LiveUnavailable>}
        </div>
      </section>
      <section className="border border-border bg-surface rounded-xl p-4 space-y-2 text-xs">
        <p>External references observed: <strong>{externalEdges.length}</strong></p>
        <p>Validation source: <strong>{snapshot.validation_profile?.source ?? "Unavailable"}</strong></p>
        <p>Package manager: <strong>{snapshot.validation_profile?.package_manager ?? "Unavailable"}</strong></p>
        <p>Commands: <strong>{snapshot.validation_profile?.commands?.join(", ") || "Unavailable"}</strong></p>
      </section>
    </div>
  );

  if (tab === "changes") return (
    <div className="space-y-4">
      <section className="border border-border bg-surface rounded-xl p-4 space-y-3">
        <span className="text-[11px] font-mono uppercase text-primary font-semibold">GitHub changes</span>
        <p className="text-xs text-muted-foreground">{commits.length} commits and {prs.length} pull requests in the current snapshot.</p>
        <div className="space-y-2 text-xs">{commits.slice(0, 12).map((commit, index) => <div key={`${value(commit, "sha")}-${index}`} className="border-b border-border/60 pb-2"><span className="font-mono">{value(commit, "sha").slice(0, 8) || "sha unavailable"}</span> · {value(commit, "message") || "Commit message unavailable"}</div>)}</div>
      </section>
      <LiveUnavailable>Deployments, configuration changes, feature flags, AI prompts, approvals, and rollbacks are not GitHub facts in this snapshot.</LiveUnavailable>
    </div>
  );

  if (tab === "runtime") return <LiveUnavailable>Runtime metrics are not available from GitHub. Errors, logs, traces, requests, latency, throughput, CPU, memory, queues, retries, and database performance require a connected observability or deployment integration.</LiveUnavailable>;

  if (tab === "incidents") return (
    <section className="border border-border bg-surface rounded-xl p-4 space-y-3">
      <span className="text-[11px] font-mono uppercase text-primary font-semibold">GitHub issue history</span>
      <p className="text-xs text-muted-foreground">{closedIssues.length} closed issues in the current snapshot. These are repository records, not runtime incidents.</p>
      <div className="space-y-2 text-xs">{closedIssues.slice(0, 20).map((issue, index) => <div key={`${value(issue, "number")}-${index}`} className="border-b border-border/60 pb-2">#{value(issue, "number") || "?"} · {value(issue, "title") || "Untitled issue"} · closed {value(issue, "closed_at") || "date unavailable"}</div>)}</div>
    </section>
  );

  return null;
}

export function NodeInspector({ node, open, onClose, repositorySnapshot }: Props) {
  const [tab, setTab] = useState<TabId>("code");
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatLog, setChatLog] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [changePrompt, setChangePrompt] = useState("");
  const [codingMessage, setCodingMessage] = useState("");
  const [codingBusy, setCodingBusy] = useState(false);
  const [change, setChange] = useState<Record<string, unknown> | null>(null);
  const repoName = node?.repo ?? repositorySnapshot?.repository?.full_name ?? "connected repository";
  const repoParts = repoName.split("/");
  const filePath = node?.detail?.path ?? "";
  const live = Boolean(repositorySnapshot);

  const tabs = useMemo(() => [
    { id: "code" as const, label: "1. Code Analysis", icon: Code },
    { id: "architecture" as const, label: "2. Architecture", icon: Layers },
    { id: "dependencies" as const, label: "3. Dependencies", icon: Cpu },
    { id: "changes" as const, label: "4. Changes & Evolution", icon: GitCommit },
    { id: "runtime" as const, label: "5. Runtime Metrics", icon: Activity },
    { id: "incidents" as const, label: "6. Data Incidents & Learning", icon: AlertTriangle },
    { id: "coding" as const, label: "7. Code Change & PR", icon: GitPullRequest },
    { id: "ask" as const, label: "8. Ask Nykst Memory", icon: Sparkles },
  ], []);

  if (!node) return null;

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = chatPrompt.trim();
    if (!query) return;
    setChatPrompt("");
    setChatLog((previous) => [...previous, { role: "user", text: query }, { role: "ai", text: "Checking live repository evidence…" }]);
    const context = repositorySnapshot ? JSON.stringify({ repository: repositorySnapshot.repository, files: repositorySnapshot.files, commits: repositorySnapshot.commits, branches: repositorySnapshot.branches, pull_requests: repositorySnapshot.pull_requests, issues: repositorySnapshot.issues, contributors: repositorySnapshot.contributors, dependency_graph: repositorySnapshot.dependency_graph, selected_node: node }) : `No GitHub snapshot is connected. Selected node: ${node.label}`;
    const result = await askNykstAi(`${query}\n\nUse only direct evidence in this repository context. Cite paths, SHAs, PRs, and issue numbers. Say when evidence is missing; never invent runtime or architecture facts.`, context);
    setChatLog((previous) => [...previous.slice(0, -1), { role: "ai", text: result.ok ? result.answer : result.error }]);
    if (!result.ok && result.needsKey) openApiSettings();
  };

  const handlePrepareChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!filePath || !changePrompt.trim() || repoParts.length !== 2) return;
    setCodingBusy(true);
    setCodingMessage("Reading the live file and preparing a reviewable change…");
    try {
      const response = await fetch("/api/integrations/github/coding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "prepare", owner: repoParts[0], repo: repoParts[1], path: filePath, base: repositorySnapshot?.repository?.default_branch ?? "main", prompt: changePrompt }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not prepare the change.");
      setChange(data);
      setCodingMessage("Preview ready. Review the exact diff before creating anything on GitHub.");
    } catch (error) { setCodingMessage(error instanceof Error ? error.message : "Could not prepare the change."); } finally { setCodingBusy(false); }
  };

  const handleCreatePr = async () => {
    if (!change) return;
    setCodingBusy(true);
    try {
      const branch = `nykst/${filePath.split("/").pop()?.replace(/[^a-zA-Z0-9_-]/g, "-") ?? "change"}-${Date.now().toString(36)}`;
      const response = await fetch("/api/integrations/github/coding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create-pr", ...change, branch, title: `Nykst: ${changePrompt.slice(0, 100)}`, commitMessage: `Nykst: ${changePrompt.slice(0, 100)}`, description: `Requested change: ${changePrompt}` }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the pull request.");
      setCodingMessage(`Pull request #${data.pullRequest.number} created. GitHub CI is authoritative.`);
      window.open(data.pullRequest.html_url, "_blank", "noopener,noreferrer");
    } catch (error) { setCodingMessage(error instanceof Error ? error.message : "Could not create the pull request."); } finally { setCodingBusy(false); }
  };

  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
    <DialogContent className="bg-card border-border h-[92vh] max-w-[min(1150px,96vw)] gap-0 overflow-hidden p-0 sm:max-w-[min(1150px,96vw)]">
      <div className="flex h-full min-h-0 flex-col sm:flex-row">
        <aside className="border-border bg-surface w-full shrink-0 border-b p-3 sm:w-72 sm:border-r sm:border-b-0 sm:p-4">
          <div className="border-b border-border pb-4"><span className="text-[10px] font-mono text-primary uppercase tracking-widest">System Dossier</span><h3 className="text-sm font-semibold truncate mt-1">{node.label}</h3><p className="text-[10px] text-muted-foreground mt-1">{live ? "GitHub-grounded view" : "Demo view — not repository evidence"}</p></div>
          <nav className="flex flex-1 gap-1 overflow-x-auto pt-3 sm:block sm:space-y-1 sm:overflow-y-auto">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={cn("w-auto shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-left sm:w-full", tab === id ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-surface-2")}><Icon className="size-4" />{label}</button>)}</nav>
        </aside>
        <main className="flex-1 flex flex-col min-h-0 bg-background/50 overflow-y-auto p-4 sm:p-6 space-y-5">
          <div className="border-b border-border pb-4"><h2 className="text-xl font-semibold tracking-tight">{tabs.find((item) => item.id === tab)?.label.replace(/^\d\. /, "")}</h2><p className="text-muted-foreground text-xs mt-1">{repoName} · {node.kind} · {node.detail?.path ?? "path unavailable"}</p></div>
          {tab !== "ask" && tab !== "coding" && repositorySnapshot && <LiveRepositoryTab tab={tab} node={node} snapshot={repositorySnapshot} />}
          {tab !== "ask" && tab !== "coding" && !repositorySnapshot && <LiveUnavailable>This view is using demo graph data. Connect GitHub to replace it with authenticated repository evidence.</LiveUnavailable>}
          {tab === "ask" && <div className="space-y-4">{chatLog.map((message, index) => <div key={index} className={message.role === "user" ? "bg-secondary rounded-lg p-3 text-sm ml-6" : "text-sm leading-relaxed"}>{message.text}</div>)}{chatLog.length === 0 && <LiveUnavailable>Ask about this node. When GitHub is connected, answers are grounded in the repository snapshot.</LiveUnavailable>}<form onSubmit={handleSend} className="flex gap-2 mt-auto"><input value={chatPrompt} onChange={(event) => setChatPrompt(event.target.value)} placeholder="Ask about this repository node…" className="border-border bg-surface min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" /><button className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-xs">Ask</button></form></div>}
          {tab === "coding" && <div className="space-y-4"><LiveUnavailable>{filePath ? "Prepare a change from the live GitHub file, then review the exact diff before opening a pull request." : "Select a file node to prepare a GitHub change."}</LiveUnavailable><form onSubmit={handlePrepareChange} className="space-y-3"><textarea value={changePrompt} onChange={(event) => setChangePrompt(event.target.value)} placeholder="Describe the change…" className="border-border bg-surface w-full rounded-lg border p-3 text-sm" rows={4} /><button disabled={codingBusy || !filePath} className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-xs disabled:opacity-50">{codingBusy ? "Preparing…" : "Prepare reviewable change"}</button></form>{codingMessage && <p className="text-xs text-muted-foreground">{codingMessage}</p>}{change && <><pre className="bg-surface rounded-lg p-3 text-xs overflow-auto">{String(change["diff"] ?? change["after"] ?? "No diff returned")}</pre><button onClick={handleCreatePr} disabled={codingBusy} className="border-border rounded-lg border px-4 py-2 text-xs">Create GitHub pull request</button></>}</div>}
        </main>
      </div>
    </DialogContent>
  </Dialog>;
}
