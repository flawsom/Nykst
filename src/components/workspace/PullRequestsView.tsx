import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, ShieldCheck } from "lucide-react";
import { timeAgo } from "@/lib/workspace/model";
import type { PullCheck, PullSummary } from "@/lib/pulls.server";
import { useWorkspace } from "./WorkspaceContext";
import { Badge, EmptyState, ErrorNote, Spinner, buttonClass, type Tone } from "./ui";
import { ImpactStrip, IssueList, Transparency, VerdictBanner } from "./ReportBlocks";

type RowState =
  | { status: "checking" }
  | { status: "error"; message: string }
  | { status: "done"; result: PullCheck };

const VERDICT_TONE: Record<PullCheck["report"]["verdict"], Tone> = {
  blocked: "danger",
  review: "warn",
  clear: "ok",
};

const MAX_PARALLEL = 2;

function storageKey(repository: string) {
  return `nykst.pulls.${repository}`;
}

function loadSaved(repository: string): Record<number, PullCheck> {
  try {
    const raw = sessionStorage.getItem(storageKey(repository));
    return raw ? (JSON.parse(raw) as Record<number, PullCheck>) : {};
  } catch {
    return {};
  }
}

function save(repository: string, results: Record<number, PullCheck>) {
  try {
    sessionStorage.setItem(storageKey(repository), JSON.stringify(results));
  } catch {
    /* storage unavailable: results just live in memory */
  }
}

export function PullRequestsView() {
  const { data, canWrite } = useWorkspace();
  const repository = data.repository;
  const [pulls, setPulls] = useState<PullSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [running, setRunning] = useState(false);
  const saved = useRef<Record<number, PullCheck>>({});

  useEffect(() => {
    if (!canWrite) return;
    let cancelled = false;
    saved.current = loadSaved(repository);
    const restored: Record<number, RowState> = {};
    for (const [n, result] of Object.entries(saved.current))
      restored[Number(n)] = { status: "done", result };
    setRows(restored);
    setPulls(null);
    setLoadError(null);
    fetch(`/api/pulls?repository=${encodeURIComponent(repository)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          pulls?: PullSummary[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || "Could not load pull requests.");
        if (!cancelled) setPulls(body.pulls ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : "Could not load pull requests.");
      });
    return () => {
      cancelled = true;
    };
  }, [repository, canWrite]);

  const check = useCallback(
    async (number: number) => {
      setRows((r) => ({ ...r, [number]: { status: "checking" } }));
      try {
        const response = await fetch("/api/pulls", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repository, number }),
        });
        const body = (await response.json().catch(() => ({}))) as PullCheck & { error?: string };
        if (!response.ok) throw new Error(body.error || "The check failed.");
        saved.current = { ...saved.current, [number]: body };
        save(repository, saved.current);
        setRows((r) => ({ ...r, [number]: { status: "done", result: body } }));
      } catch (error) {
        setRows((r) => ({
          ...r,
          [number]: {
            status: "error",
            message: error instanceof Error ? error.message : "The check failed.",
          },
        }));
      }
    },
    [repository],
  );

  async function checkAll() {
    if (!pulls?.length || running) return;
    setRunning(true);
    const queue = pulls.map((p) => p.number);
    const worker = async () => {
      for (let n = queue.shift(); n !== undefined; n = queue.shift()) await check(n);
    };
    await Promise.all(Array.from({ length: MAX_PARALLEL }, worker));
    setRunning(false);
  }

  if (!canWrite)
    return (
      <EmptyState title="Pull request checks need a connected repository">
        Nykst checks each open pull request against the repository graph and tells you what it
        breaks, so you do not have to paste files.
      </EmptyState>
    );

  const commit = data.analysis.ref.slice(0, 7);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold">Pull requests</h2>
        <p className="text-muted-foreground text-sm">
          Checks each pull request&apos;s changed JavaScript/TypeScript files against the analysis
          of <span className="font-mono">{commit}</span>. Files in other languages and runtime
          behaviour are not checked.
        </p>
        <button
          type="button"
          className={buttonClass.primary}
          onClick={checkAll}
          disabled={running || !pulls?.length}
        >
          <ShieldCheck className="size-4" aria-hidden />
          {running ? "Checking…" : "Check all open pull requests"}
        </button>
      </header>

      {loadError && <ErrorNote>{loadError}</ErrorNote>}
      {!pulls && !loadError && <Spinner label="Loading open pull requests" />}
      {pulls && pulls.length === 0 && (
        <EmptyState title="No open pull requests">
          When someone opens a pull request on {repository}, it will show up here.
        </EmptyState>
      )}

      <ul className="space-y-3">
        {pulls?.map((pull) => {
          const state = rows[pull.number];
          const expanded = Boolean(open[pull.number]);
          const done = state?.status === "done" ? state.result : null;
          const Chevron = expanded ? ChevronDown : ChevronRight;
          return (
            <li key={pull.number} className="border-border bg-card rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground tabular text-sm">#{pull.number}</span>
                <span className="min-w-0 flex-1 text-sm font-medium break-words">{pull.title}</span>
                {pull.draft && <Badge>draft</Badge>}
                <a
                  href={pull.url}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass.ghost}
                  aria-label={`Open pull request ${pull.number} on GitHub`}
                >
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {pull.author} · updated {timeAgo(pull.updatedAt)}
                {pull.changedFiles !== null && ` · ${pull.changedFiles} changed files`}
                {done && ` · ${done.filesChecked} files checked`}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2" aria-live="polite">
                {state?.status === "checking" ? (
                  <Spinner label="Checking" />
                ) : (
                  <button
                    type="button"
                    className={buttonClass.secondary}
                    onClick={() => check(pull.number)}
                    disabled={running}
                  >
                    {done ? "Check again" : "Check"}
                  </button>
                )}
                {done && (
                  <>
                    <Badge tone={VERDICT_TONE[done.report.verdict]}>{done.report.verdict}</Badge>
                    <span className="text-muted-foreground text-xs">
                      {done.report.counts.errors} errors, {done.report.counts.warnings} warnings,{" "}
                      {done.report.counts.infos} notes
                    </span>
                    <button
                      type="button"
                      className={buttonClass.ghost}
                      aria-expanded={expanded}
                      onClick={() => setOpen((o) => ({ ...o, [pull.number]: !expanded }))}
                    >
                      <Chevron className="size-4" aria-hidden />
                      Details
                    </button>
                  </>
                )}
              </div>

              {state?.status === "error" && (
                <div className="mt-2">
                  <ErrorNote>{state.message}</ErrorNote>
                </div>
              )}

              {done && expanded && (
                <div className="mt-3 space-y-4">
                  <VerdictBanner report={done.report} />
                  <ImpactStrip impact={done.report.impact} />
                  <IssueList issues={done.report.issues} />
                  {done.skipped.length > 0 && (
                    <ul className="text-muted-foreground space-y-1 text-sm">
                      {done.skipped.map((s) => (
                        <li key={s.path} className="break-words">
                          Not checked: <span className="font-mono text-xs">{s.path}</span> —{" "}
                          {s.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Transparency
                    checked={done.report.checked}
                    notChecked={done.report.notChecked}
                    basis={done.report.basis}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
