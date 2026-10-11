import { useEffect, useId, useState } from "react";
import { IngestProgress } from "@/components/workspace/IngestProgress";
import { buttonClass } from "@/components/workspace/ui";
import { runIngest, type IngestStageId } from "@/lib/workspace/ingest-client";

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
  const [stage, setStage] = useState<IngestStageId | null>(null);
  const [detail, setDetail] = useState<string | undefined>(undefined);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const workspaceId = useId();
  const repositoryId = useId();
  const dialogTitleId = useId();
  const [message, setMessage] = useState("");
  // Set when access is granted per repository (GitHub App); links to GitHub's picker.
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  const [perRepository, setPerRepository] = useState(false);

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
          perRepository: data.perRepository === true,
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
      const perRepo =
        repositoriesResult.status === "fulfilled" && repositoriesResult.value.perRepository;
      setPerRepository(perRepo);
      const personal = personalResult.status === "fulfilled" ? personalResult.value : [];
      const merged = [
        ...new Map([...accessible, ...personal].map((item) => [item.id, item])).values(),
      ];

      setAllRepositories(merged);
      setRepositories(merged);
      if (!merged.length && perRepo) {
        setMessage(
          grantUrl
            ? "Nykst can't see any repositories yet. Choose which ones it may read on GitHub."
            : "Nykst can't see any repositories yet. Install the Nykst GitHub App on the repositories you want to map, then reload.",
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
    setIngestError(null);
    setStage(null);
    setDetail(undefined);
    setMessage("");
    try {
      await runIngest(selected.owner.login, selected.name, (update) => {
        setStage(update.stage);
        setDetail(update.detail);
      });
      localStorage.setItem("nykst.org", workspace === PERSONAL ? selected.owner.login : workspace);
      localStorage.setItem("nykst.provider", "github");
      localStorage.setItem("nykst.repository", selected.full_name);
      setMappingComplete(true);
      window.setTimeout(() => window.location.assign("/graph"), 700);
    } catch (error) {
      setIngestError(error instanceof Error ? error.message : "Repository analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function closeOverlay() {
    setMapping(false);
    setIngestError(null);
    setStage(null);
    setDetail(undefined);
  }

  useEffect(() => {
    if (!mapping || !ingestError) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapping, ingestError]);

  if (!connected)
    return (
      <button onClick={onConnect} className={`${buttonClass.primary} mt-6 w-full`}>
        Connect GitHub securely
      </button>
    );

  const selectClass =
    "border-input bg-surface text-foreground focus-visible:border-primary min-h-10 w-full rounded-lg border px-3 text-sm disabled:opacity-60";

  return (
    <>
      {mapping && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
        >
          <div className="flex w-full max-w-md flex-col items-stretch gap-3">
            <h2 id={dialogTitleId} className="sr-only">
              Mapping {repository}
            </h2>
            <IngestProgress
              repository={repository}
              stage={stage}
              detail={detail}
              complete={mappingComplete}
              error={ingestError}
            />
            {ingestError && (
              <button onClick={closeOverlay} className={`${buttonClass.secondary} w-full`}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
      <div className="border-border bg-surface mt-6 space-y-4 rounded-xl border p-4">
        <div>
          <p className="text-ok text-sm font-semibold">GitHub connected</p>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            {perRepository
              ? "Nykst reads only the repositories you grant it, and never writes to them."
              : "Choose your personal account or any organization you can access. Private repositories are supported."}
          </p>
        </div>
        <div>
          <label htmlFor={workspaceId} className="mb-1.5 block text-sm font-medium">
            Account or organization
          </label>
          <select
            id={workspaceId}
            value={workspace}
            onChange={(event) => void chooseWorkspace(event.target.value)}
            className={selectClass}
          >
            <option value="">Select account or organization</option>
            <option value={PERSONAL}>My repositories & accessible repositories</option>
            {organizations.map((item) => (
              <option key={item.id} value={item.login}>
                Organization: {item.login}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={repositoryId} className="mb-1.5 block text-sm font-medium">
            Repository
          </label>
          <select
            id={repositoryId}
            value={repository}
            onChange={(event) => setRepository(event.target.value)}
            disabled={!workspace || loading}
            className={selectClass}
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
        </div>
        <button
          onClick={() => void ingest()}
          disabled={!repository || loading}
          className={`${buttonClass.primary} w-full`}
        >
          {loading ? "Mapping your system…" : "Start mapping my system"}
        </button>
        {message && (
          <p role="alert" className="text-muted-foreground text-sm leading-relaxed">
            {message}
          </p>
        )}
        {manageUrl && (
          <a href={manageUrl} className={`${buttonClass.secondary} w-full text-center`}>
            {allRepositories.length
              ? "Add or remove repositories on GitHub"
              : "Choose repositories on GitHub"}
          </a>
        )}
      </div>
    </>
  );
}
