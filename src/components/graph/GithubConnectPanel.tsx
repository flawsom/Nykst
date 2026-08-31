import { useEffect, useState } from "react";

type Organization = { id: number; login: string; avatar_url?: string };
type Repository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  description?: string | null;
};

type Props = { connected: boolean; onConnect: () => void };

export function GithubConnectPanel({ connected, onConnect }: Props) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [organization, setOrganization] = useState("");
  const [repository, setRepository] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!connected) return;
    fetch("/api/integrations/github/organizations")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => setOrganizations(data.organizations))
      .catch((error: Error) => setMessage(error.message));
  }, [connected]);

  async function chooseOrganization(value: string) {
    setOrganization(value);
    setRepository("");
    setRepositories([]);
    setMessage("");
    if (!value) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/integrations/github/repositories?org=${encodeURIComponent(value)}`,
      );
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
        body: JSON.stringify({ owner: organization, repo: selected.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      localStorage.setItem("nykst.org", organization);
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
        Choose the organization and repository Nykst should analyze.
      </p>
      <select
        value={organization}
        onChange={(event) => void chooseOrganization(event.target.value)}
        className="border-border bg-surface w-full rounded-lg border px-3 py-2 text-sm"
      >
        <option value="">Select organization</option>
        {organizations.map((item) => (
          <option key={item.id} value={item.login}>
            {item.login}
          </option>
        ))}
      </select>
      <select
        value={repository}
        onChange={(event) => setRepository(event.target.value)}
        disabled={!organization || loading}
        className="border-border bg-surface w-full rounded-lg border px-3 py-2 text-sm"
      >
        <option value="">{loading ? "Loading repositories…" : "Select repository"}</option>
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
