import { useEffect, useState } from "react";
import { ConnectionProgress } from "@/components/graph/ConnectionProgress";

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
  const [allRepositories, setAllRepositories] = useState<Repository[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [repository, setRepository] = useState("");
  const [loading, setLoading] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [mappingComplete, setMappingComplete] = useState(false);
  const [message, setMessage] = useState("");
  // Set when access is granted per repository (GitHub App); links to GitHub's picker.
  const [manageUrl, setManageUrl] = useState<string | null>(null);

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
      fetch("/api/integrations/github/all-repositories").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load accessible repositories.");
        return {
          repositories: data.repositories as Repository[],
          manageUrl: typeof data.manageUrl === "string" ? (data.manageUrl as string) : null,
        };
      }),
      fetch("/api/integrations/github/personal-repositories").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load personal repositories.");
        return data.repositories as Repository[];
      }),
    ]).then(([organizationsResult, repositoriesResult, personalResult]) => {
      if (organizationsResult.status === "fulfilled") setOrganizations(organizationsResult.value);

      const accessible =
        repositoriesResult.status === "fulfilled" ? repositoriesResult.value.repositories : [];
      const grantUrl =
        repositoriesResult.status === "fulfilled" ? repositoriesResult.value.manageUrl : null;
      setManageUrl(grantUrl);
      const personal = personalResult.status === "fulfilled" ? personalResult.value : [];
      const merged = [
        ...new Map([...accessible, ...personal].map((item) => [item.id, item])).values(),
      ];

      setAllRepositories(merged);
      setRepositories(merged);
      if (!merged.length && grantUrl) {
        setMessage(
          "Nykst can't see any repositories yet. Choose which ones it may read on GitHub.",
        );
      } else if (!merged.length) {
        const reason =
          personalResult.status === "rejected" && personalResult.reason instanceof Error
            ? personalResult.reason.message
            : repositoriesResult.status === "rejected" && repositoriesResult.reason instanceof Error
              ? repositoriesResult.reason.message
              : "No accessible repositories were returned.";
        setMessage(`${reason} Reconnect GitHub and approve repository access, then try again.`);
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
    if (value === PERSONAL) {
      setRepositories(allRepositories);
      return;
    }
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
    setMapping(true);
    setMappingComplete(false);
    setMessage("");
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
      setMappingComplete(true);
      setMessage(
        `System map foundation ready: ${data.summary.file_count} files, ${data.summary.commit_count} commits, ${data.summary.pull_request_count} pull requests, ${data.summary.issue_count} issues, and ${data.summary.contributor_count} contributors indexed.`,
      );
    } catch (error) {
      setMapping(false);
      setMessage(error instanceof Error ? error.message : "Repository ingestion failed.");
    } finally {
      setLoading(false);
    }
  }

  function finishMapping() {
    window.location.assign("/graph");
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
    <>
      {mapping && (
        <ConnectionProgress
          provider="GitHub"
          org={repository || workspace || "your repository"}
          complete={mappingComplete}
          onDone={finishMapping}
        />
      )}
      <div className="mt-6 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm font-medium text-primary">GitHub connected</p>
        <p className="text-muted-foreground text-xs">
          {manageUrl
            ? "Nykst reads only the repositories you grant it, and never writes to them."
            : "Choose your personal account or any organization you can access. Private repositories are supported."}
        </p>
        <select
          value={workspace}
          onChange={(event) => void chooseWorkspace(event.target.value)}
          className="border-border bg-surface w-full rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Select account or organization</option>
          <option value={PERSONAL}>My repositories & accessible repositories</option>
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
          {loading ? "Mapping your system…" : "Start mapping my system"}
        </button>
        {message && <p className="text-muted-foreground text-xs leading-relaxed">{message}</p>}
        {manageUrl && (
          <a
            href={manageUrl}
            className="border-primary/30 text-primary hover:bg-primary/10 block rounded-lg border px-4 py-2 text-center text-xs font-semibold"
          >
            {allRepositories.length
              ? "Add or remove repositories on GitHub"
              : "Choose repositories on GitHub"}
          </a>
        )}
      </div>
    </>
  );
}
