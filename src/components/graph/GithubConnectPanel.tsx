import { useEffect, useState } from "react";

type Organization = { id: number; login: string; avatar_url?: string };
type Repository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  description?: string | null;
  owner: { login: string };
};

type Props = { connected: boolean; onConnect: () => void };
const PERSONAL = "__personal__";

export function GithubConnectPanel({ connected, onConnect }: Props) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [repository, setRepository] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!connected) return;
    setLoading(true);
    setWorkspace(PERSONAL);
    setRepository("");
    Promise.allSettled([
      fetch("/api/integrations/github/organizations").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load organizations.");
        return data.organizations as Organization[];
      }),
      fetch("/api/integrations/github/personal-repositories").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load personal repositories.");
        return data.repositories as Repository[];
      }),
    ]).then(([organizationsResult, repositoriesResult]) => {
      if (organizationsResult.status === "fulfilled") setOrganizations(organizationsResult.value);
      if (repositoriesResult.status === "fulfilled") {
        setRepositories(repositoriesResult.value);
        if (!repositoriesResult.value.length) {
          setMessage(
            "No personal repositories were returned. Reconnect GitHub and approve repository access, then try again.",
          );
        }
      } else {
        setMessage(
          repositoriesResult.reason instanceof Error
            ? repositoriesResult.reason.message
            : "Could not load personal repositories.",
        );
      }
      setLoading(false);
    });
  }, [connected]);

  async function chooseWorkspace(value: string) {
    setWorkspace(value);
    setRepository("");
    setRepositories([]);
    setMessage("");
    if (!value) return;
    setLoading(true);
    try {
      const endpoint =
        value === PERSONAL
          ? "/api/integrations/github/personal-repositories"
          : `/api/integrations/github/repositories?org=${encodeURIComponent(value)}`;
      const response = await fetch(endpoint);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRepositories(data.repositories);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load repositories.");
    } finally {
      setLoading(false);
    }
  }

  async function ingest() {
    const selected = repositories.find((item) => item.full_name === repository);
    if (!selected) return;
    setLoading(true);
    setMessage("Reading repository structure, code history, and collaboration signals…");
    try {
      const response = await fetch("/api/integrations/github/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: selected.owner.login, repo: selected.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      localStorage.setItem("nykst.org", workspace === PERSONAL ? selected.owner.login : workspace);
      localStorage.setItem("nykst.provider", "github");
      localStorage.setItem("nykst.repository", selected.full_name);
      setMessage(
        `System map foundation ready: ${data.summary.file_count} files, ${data.summary.commit_count} commits, ${data.summary.pull_request_count} pull requests, ${data.summary.issue_count} issues, and ${data.summary.contributor_count} contributors indexed.`,
      );
      window.setTimeout(() => window.location.assign("/graph"), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Repository ingestion failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!connected)
    return (
      <button
        onClick={onConnect}
        className="bg-primary text-primary-foreground hover:bg-primary-glow mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors shadow-md shadow-primary/20"
      >
        Connect GitHub securely
      </button>
    );

  return (
    <div className="mt-6 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-medium text-primary">GitHub connected</p>
      <p className="text-muted-foreground text-xs">
        Choose your personal account or any organization you can access. Private repositories are
        supported.
      </p>
      <select
        value={workspace}
        onChange={(event) => void chooseWorkspace(event.target.value)}
        className="border-border bg-surface w-full rounded-lg border px-3 py-2 text-sm"
      >
        <option value="">Select account or organization</option>
        <option value={PERSONAL}>My personal repositories</option>
        {organizations.map((item) => (
          <option key={item.id} value={item.login}>
            Organization: {item.login}
          </option>
        ))}
      </select>
      <select
        value={repository}
        onChange={(event) => setRepository(event.target.value)}
        disabled={!workspace || loading}
        className="border-border bg-surface w-full rounded-lg border px-3 py-2 text-sm"
      >
        <option value="">
          {loading
            ? "Loading repositories…"
            : repositories.length
              ? "Select repository"
              : "No repositories found"}
        </option>
        {repositories.map((item) => (
          <option key={item.id} value={item.full_name}>
            {item.full_name}
            {item.private ? " (private)" : ""}
          </option>
        ))}
      </select>
      <button
        onClick={() => void ingest()}
        disabled={!repository || loading}
        className="bg-primary text-primary-foreground disabled:opacity-50 w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
      >
        {loading ? "Building system map…" : "Ingest repository & build system map"}
      </button>
      {message && <p className="text-muted-foreground text-xs leading-relaxed">{message}</p>}
    </div>
  );
}
