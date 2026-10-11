import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ExternalLink, RotateCcw, X } from "lucide-react";
import type { Finding, FindingKind, Severity } from "@/lib/analysis/findings";
import { SEVERITY_TONE, timeAgo } from "@/lib/workspace/model";
import { cn } from "@/lib/utils";
import { useWorkspace, type FindingState } from "./WorkspaceContext";
import {
  Badge,
  EmptyState,
  ErrorNote,
  FileLink,
  SectionTitle,
  Spinner,
  Stat,
  buttonClass,
} from "./ui";

const KIND_LABEL: Record<FindingKind, string> = {
  cycle: "Import cycle",
  "unresolved-import": "Unresolved import",
  "module-scope-secret": "Secret read at load",
  "undeclared-package": "Undeclared package",
  "no-tests": "No tests",
  "untested-hotspot": "Untested hotspot",
  orphan: "Orphaned file",
  "fix-churn": "Keeps needing fixes",
  "issue-mention": "Mentioned in an issue",
};

const SEVERITIES: Severity[] = ["high", "medium", "low"];
const AFFECTED_CAP = 10;
const NOTE_MAX = 300;

const selectClass =
  "border-border bg-surface text-foreground min-h-10 rounded-lg border px-3 text-sm focus-visible:outline-2";

export function FindingsView() {
  const { data, selected, canWrite, api } = useWorkspace();
  const { findings } = data;

  const [states, setStates] = useState<Map<string, FindingState>>(new Map());
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [kind, setKind] = useState<FindingKind | "all">("all");
  const [showDismissed, setShowDismissed] = useState(false);
  const [onlyFile, setOnlyFile] = useState(selected !== null);

  useEffect(() => setOnlyFile(selected !== null), [selected]);

  useEffect(() => {
    if (!canWrite) return;
    let cancelled = false;
    setLoading(true);
    setHistoryError(false);
    api
      .findingStates()
      .then((list) => {
        if (!cancelled) setStates(new Map(list.map((state) => [state.signature, state])));
      })
      .catch(() => {
        if (!cancelled) setHistoryError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canWrite, api, findings]);

  function applyState(id: string, dismissed: boolean, note?: string) {
    setStates((current) => {
      const next = new Map(current);
      const before = current.get(id);
      next.set(id, {
        signature: id,
        status: dismissed ? "dismissed" : "open",
        first_seen_at: before?.first_seen_at ?? new Date().toISOString(),
        resolved_at: before?.resolved_at ?? null,
        resolved_commit: before?.resolved_commit ?? null,
        times_opened: before?.times_opened ?? 1,
        dismissed_note: dismissed ? (note ?? null) : null,
      });
      return next;
    });
  }

  const kinds = useMemo(() => [...new Set(findings.map((finding) => finding.kind))], [findings]);
  const counts = useMemo(() => {
    const result: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const finding of findings) result[finding.severity] += 1;
    return result;
  }, [findings]);
  const dismissedCount = findings.filter((f) => states.get(f.id)?.status === "dismissed").length;

  if (!findings.length) {
    return (
      <EmptyState title="Nothing provable found">
        Nykst checks for import cycles, unresolved imports, secrets read at module load, undeclared
        packages, missing tests, untested hotspots, orphaned files, files that keep needing fixes,
        and files mentioned in issues. None of these were found in this repository.
      </EmptyState>
    );
  }

  const fileName = selected?.split("/").pop();
  const visible = findings.filter((finding) => {
    if (severity !== "all" && finding.severity !== severity) return false;
    if (kind !== "all" && finding.kind !== kind) return false;
    if (selected && onlyFile && !finding.paths.includes(selected)) return false;
    if (!showDismissed && states.get(finding.id)?.status === "dismissed") return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="space-y-3">
        <h2 className="text-lg font-semibold">Findings</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Total" value={findings.length} />
          <Stat label="High" value={counts.high} tone={counts.high ? "danger" : "neutral"} />
          <Stat label="Medium" value={counts.medium} tone={counts.medium ? "warn" : "neutral"} />
          <Stat label="Low" value={counts.low} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Severity" className="flex flex-wrap gap-1">
          {(["all", ...SEVERITIES] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={severity === value}
              onClick={() => setSeverity(value)}
              className={cn(
                buttonClass.ghost,
                "capitalize",
                severity === value && "bg-muted text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="finding-kind">
          Kind
        </label>
        <select
          id="finding-kind"
          className={selectClass}
          value={kind}
          onChange={(event) => setKind(event.target.value as FindingKind | "all")}
        >
          <option value="all">All kinds</option>
          {kinds.map((value) => (
            <option key={value} value={value}>
              {KIND_LABEL[value]}
            </option>
          ))}
        </select>
        <label className="text-muted-foreground flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={showDismissed}
            onChange={(event) => setShowDismissed(event.target.checked)}
          />
          Show dismissed/resolved
        </label>
        {selected && (
          <button
            type="button"
            aria-pressed={onlyFile}
            onClick={() => setOnlyFile((value) => !value)}
            className={cn(
              buttonClass.secondary,
              "min-w-0 text-xs",
              onlyFile && "border-primary text-primary",
            )}
          >
            <span className="truncate">Only findings about {fileName}</span>
          </button>
        )}
      </div>

      <div className="space-y-1">
        {loading && <Spinner label="Loading finding history" />}
        {historyError && (
          <p className="text-muted-foreground text-sm">Finding history unavailable</p>
        )}
        {!canWrite && (
          <p className="text-muted-foreground text-sm">
            Dismissing and history need a connected repository.
          </p>
        )}
        {!showDismissed && dismissedCount > 0 && (
          <p className="text-muted-foreground text-sm">{dismissedCount} dismissed and hidden.</p>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No findings match these filters" />
      ) : (
        <ul className="space-y-2">
          {visible.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              state={states.get(finding.id)}
              onChange={applyState}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  state,
  onChange,
}: {
  finding: Finding;
  state: FindingState | undefined;
  onChange: (id: string, dismissed: boolean, note?: string) => void;
}) {
  const { canWrite, api } = useWorkspace();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismissed = state?.status === "dismissed";

  const evidencePaths = new Set(finding.evidence.map((item) => item.path));
  const more = finding.paths.filter((path) => !evidencePaths.has(path));
  const hasMore = more.length > 0 && finding.paths.length > finding.evidence.length;

  async function run(isDismiss: boolean, text?: string) {
    setBusy(true);
    setError(null);
    try {
      await api.setDismissed(finding.id, isDismiss, text);
      onChange(finding.id, isDismiss, text);
      setAsking(false);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the finding");
    } finally {
      setBusy(false);
    }
  }

  const trimmed = note.trim();
  return (
    <li className={cn("border-border bg-card rounded-lg border", dismissed && "opacity-75")}>
      <details className="group">
        <summary className="hover:bg-surface-2 flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
              <span className="text-muted-foreground text-xs">{KIND_LABEL[finding.kind]}</span>
              {dismissed && <Badge>Dismissed</Badge>}
              {state && state.times_opened > 1 && (
                <Badge tone="warn">Seen before: came back {state.times_opened} times</Badge>
              )}
            </div>
            <p className="mt-1 text-sm font-medium">{finding.title}</p>
          </div>
          <span className="text-muted-foreground shrink-0 text-xs">
            {finding.paths.length} {finding.paths.length === 1 ? "file" : "files"}
          </span>
        </summary>

        <div className="border-border space-y-4 border-t px-3 py-3 pl-10">
          {state && (
            <p className="text-muted-foreground text-xs">
              Open since {timeAgo(state.first_seen_at)}
            </p>
          )}
          {dismissed && state?.dismissed_note && (
            <p className="text-sm">
              <span className="text-muted-foreground">Dismissed: </span>
              {state.dismissed_note}
            </p>
          )}
          <p className="text-sm leading-relaxed">{finding.detail}</p>
          <div className="space-y-1">
            <SectionTitle>Why it matters</SectionTitle>
            <p className="text-sm leading-relaxed">{finding.why}</p>
          </div>
          <div className="space-y-1">
            <SectionTitle>How to fix</SectionTitle>
            <p className="text-sm leading-relaxed">{finding.fix}</p>
          </div>

          {finding.evidence.length > 0 && (
            <div className="space-y-1.5">
              <SectionTitle>Evidence</SectionTitle>
              <ul className="space-y-1.5">
                {finding.evidence.map((item, i) => (
                  <li key={`${item.path}:${item.line ?? 0}:${i}`} className="text-sm">
                    <FileLink path={item.path} line={item.line} />
                    {item.note && <span className="text-muted-foreground"> {item.note}</span>}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary ml-2 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
                      >
                        Open
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasMore && (
            <div className="space-y-1.5">
              <SectionTitle>Affects {finding.paths.length} files</SectionTitle>
              <ul className="space-y-1">
                {more.slice(0, AFFECTED_CAP).map((path) => (
                  <li key={path}>
                    <FileLink path={path} />
                  </li>
                ))}
              </ul>
              {more.length > AFFECTED_CAP && (
                <p className="text-muted-foreground text-xs">
                  and {more.length - AFFECTED_CAP} more
                </p>
              )}
            </div>
          )}

          {canWrite && (
            <div className="space-y-2">
              {error && <ErrorNote>{error}</ErrorNote>}
              {dismissed ? (
                <button
                  type="button"
                  className={buttonClass.secondary}
                  disabled={busy}
                  onClick={() => run(false)}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  Reopen
                </button>
              ) : asking ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (trimmed) void run(true, trimmed);
                  }}
                >
                  <label className="block text-sm font-medium" htmlFor={`why-${finding.id}`}>
                    Reason for dismissing
                  </label>
                  <input
                    id={`why-${finding.id}`}
                    className={cn(selectClass, "w-full")}
                    value={note}
                    maxLength={NOTE_MAX}
                    required
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="e.g. generated file, intentional"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className={buttonClass.primary}
                      disabled={busy || !trimmed}
                    >
                      {busy ? <Spinner /> : "Dismiss finding"}
                    </button>
                    <button
                      type="button"
                      className={buttonClass.ghost}
                      onClick={() => setAsking(false)}
                    >
                      Cancel
                    </button>
                    <span className="text-muted-foreground ml-auto text-xs">
                      {note.length}/{NOTE_MAX}
                    </span>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className={buttonClass.secondary}
                  onClick={() => setAsking(true)}
                >
                  <X className="size-4" aria-hidden />
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
