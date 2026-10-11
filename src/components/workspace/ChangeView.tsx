import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, KeyRound, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { openApiSettings } from "@/lib/ai-client";
import type { ProposedEdit, VerifyReport } from "@/lib/analysis/verify-types";
import { useWorkspace, type GeneratedChange } from "./WorkspaceContext";
import { Badge, EmptyState, ErrorNote, FileLink, SectionTitle, buttonClass } from "./ui";
import {
  DiffList,
  ImpactStrip,
  IssueList,
  PatchActions,
  Transparency,
  VerdictBanner,
} from "./ReportBlocks";

const MAX_TASK = 4000;
const MIN_TASK = 8;
const MAX_FILES = 10;
const STEPS = [
  "Finding the relevant files",
  "Reading impact, history and team notes",
  "Writing the change",
  "Checking it against the repository graph",
];

type Mode = "describe" | "check";

const fieldClass =
  "border-border bg-background focus-visible:border-primary w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-60";

/** Verdict, issues, impact and transparency for any report. */
function ReportBody({
  report,
  repairs,
  provider,
  children,
}: {
  report: VerifyReport;
  repairs?: number | undefined;
  provider?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <>
      <VerdictBanner report={report} repairs={repairs} provider={provider} />
      {children}
      <ImpactStrip impact={report.impact} />
      <IssueList issues={report.issues} />
    </>
  );
}

/* ------------------------------ describe a change ------------------------------ */

function ChangeResult({ result }: { result: GeneratedChange }) {
  const { report } = result;
  return (
    <div className="space-y-5">
      <ReportBody report={report} repairs={result.repairs} provider={result.provider}>
        {result.summary && <p className="text-sm leading-relaxed">{result.summary}</p>}
      </ReportBody>
      <DiffList files={result.files} />
      <PatchActions patch={result.patch} />
      <Transparency
        checked={report.checked}
        notChecked={report.notChecked}
        basis={report.basis}
        open={report.verdict !== "clear"}
      />
      {result.warnings.length > 0 && (
        <ul className="text-muted-foreground space-y-1 text-sm">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {result.read.length > 0 && (
        <div className="space-y-1.5">
          <SectionTitle>Files the model read</SectionTitle>
          <ul className="space-y-1">
            {result.read.map((p) => (
              <li key={p}>
                <FileLink path={p} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RunningSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4000);
    return () => clearInterval(id);
  }, []);
  return (
    <ol className="border-border bg-surface space-y-2 rounded-lg border p-3" aria-live="polite">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={cn(
            "flex items-center gap-2 text-sm",
            i > step && "text-subtle",
            i === step && "text-foreground font-medium",
            i < step && "text-muted-foreground",
          )}
        >
          {i < step ? (
            <Check className="text-ok size-4" aria-hidden />
          ) : i === step ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <span className="size-4" aria-hidden />
          )}
          {label}
        </li>
      ))}
    </ol>
  );
}

function DescribeMode() {
  const { api, selected } = useWorkspace();
  const [task, setTask] = useState("");
  const [startFrom, setStartFrom] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ message: string; needsKey: boolean } | null>(null);
  const [result, setResult] = useState<GeneratedChange | null>(null);
  const valid = task.trim().length >= MIN_TASK && task.length <= MAX_TASK;
  const useSelected = Boolean(selected && startFrom);

  async function run() {
    if (!valid || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.generate(task.trim(), useSelected && selected ? [selected] : undefined));
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : "Something went wrong.",
        needsKey: Boolean((e as { needsKey?: boolean }).needsKey),
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <fieldset disabled={running} className="space-y-3">
          <label htmlFor="change-task" className="block text-sm font-medium">
            What should change?
          </label>
          {useSelected && selected && (
            <span className="border-border bg-surface inline-flex min-h-8 items-center gap-1 rounded-md border pl-2.5 text-sm">
              Starting from {selected.split("/").pop()}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground inline-flex size-10 items-center justify-center"
                aria-label={`Stop starting from ${selected}`}
                onClick={() => setStartFrom(false)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </span>
          )}
          <textarea
            id="change-task"
            rows={5}
            maxLength={MAX_TASK}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the change in a sentence or two"
            className={fieldClass}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs tabular-nums">
              {task.length}/{MAX_TASK}
              {task.trim().length < MIN_TASK && ` · at least ${MIN_TASK} characters`}
            </span>
            <button type="submit" className={buttonClass.primary} disabled={!valid}>
              Write and check
            </button>
          </div>
        </fieldset>
      </form>
      {running && <RunningSteps />}
      {error && (
        <div className="space-y-2">
          <ErrorNote>{error.message}</ErrorNote>
          {error.needsKey && (
            <button type="button" className={buttonClass.primary} onClick={openApiSettings}>
              <KeyRound className="size-4" aria-hidden />
              Add your AI key
            </button>
          )}
        </div>
      )}
      {result && <ChangeResult result={result} />}
    </div>
  );
}

/* ------------------------------- check own files ------------------------------- */

interface Draft {
  id: number;
  path: string;
  content: string;
  remove: boolean;
}

function CheckMode({ initial, autoRun }: { initial?: Draft[]; autoRun?: boolean }) {
  const { api } = useWorkspace();
  const nextId = useRef((initial?.length ?? 0) + 1);
  const [drafts, setDrafts] = useState<Draft[]>(
    initial ?? [{ id: 0, path: "", content: "", remove: false }],
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<VerifyReport | null>(null);

  const patch = (id: number, change: Partial<Draft>) =>
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...change } : d)));
  const pathError = (d: Draft) =>
    !d.path.trim()
      ? "Enter a path"
      : d.path.trim().startsWith("/")
        ? "Use a path relative to the repository root, without a leading /"
        : null;
  const valid = drafts.length > 0 && drafts.every((d) => !pathError(d));

  function readFile(id: number, file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => patch(id, { content: String(reader.result ?? "") });
    reader.readAsText(file);
  }

  async function run() {
    if (!valid || running) return;
    setRunning(true);
    setError(null);
    setReport(null);
    const edits: ProposedEdit[] = drafts.map((d) => ({
      path: d.path.trim(),
      content: d.remove ? null : d.content,
    }));
    try {
      setReport(await api.verify(edits));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (autoRun) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        Paste the complete new content of each file you changed. Nykst checks it without storing it.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <fieldset disabled={running} className="space-y-4">
          {drafts.map((d, i) => {
            const problem = d.path && pathError(d);
            return (
              <div
                key={d.id}
                className="border-border bg-surface space-y-2.5 rounded-lg border p-3"
              >
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label htmlFor={`path-${d.id}`} className="block text-sm font-medium">
                      File path
                    </label>
                    <input
                      id={`path-${d.id}`}
                      type="text"
                      value={d.path}
                      onChange={(e) => patch(d.id, { path: e.target.value })}
                      placeholder="Path from the repository root"
                      aria-invalid={Boolean(problem)}
                      className={cn(fieldClass, "mt-1 min-h-10 font-mono")}
                    />
                  </div>
                  {drafts.length > 1 && (
                    <button
                      type="button"
                      className={buttonClass.ghost}
                      aria-label={`Remove file ${i + 1}`}
                      onClick={() => setDrafts((l) => l.filter((x) => x.id !== d.id))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                {problem && <p className="text-danger text-sm">{problem}</p>}
                {!d.remove && (
                  <>
                    <label htmlFor={`content-${d.id}`} className="block text-sm font-medium">
                      Complete new content
                    </label>
                    <textarea
                      id={`content-${d.id}`}
                      rows={8}
                      value={d.content}
                      onChange={(e) => patch(d.id, { content: e.target.value })}
                      spellCheck={false}
                      className={cn(fieldClass, "resize-y font-mono")}
                    />
                    <label className={cn(buttonClass.secondary, "cursor-pointer")}>
                      <Upload className="size-4" aria-hidden />
                      Load from a file
                      <input
                        type="file"
                        accept="text/*,.ts,.tsx,.js,.jsx,.json,.md,.css,.py,.go,.rs"
                        className="sr-only"
                        onChange={(e) => {
                          readFile(d.id, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </>
                )}
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.remove}
                    onChange={(e) => patch(d.id, { remove: e.target.checked })}
                    className="size-4"
                  />
                  Delete this file instead
                </label>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={buttonClass.secondary}
              disabled={drafts.length >= MAX_FILES}
              onClick={() =>
                setDrafts((l) => [
                  ...l,
                  { id: nextId.current++, path: "", content: "", remove: false },
                ])
              }
            >
              <Plus className="size-4" aria-hidden />
              Add file
            </button>
            <span className="text-muted-foreground text-xs">
              {drafts.length} of {MAX_FILES} files
            </span>
            <button type="submit" className={cn(buttonClass.primary, "ml-auto")} disabled={!valid}>
              {running && (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              )}
              Check against repository
            </button>
          </div>
        </fieldset>
      </form>
      {error && <ErrorNote>{error}</ErrorNote>}
      {report && (
        <div className="space-y-5">
          <ReportBody report={report} />
          <Transparency
            checked={report.checked}
            notChecked={report.notChecked}
            basis={report.basis}
            open={report.verdict !== "clear"}
          />
        </div>
      )}
    </div>
  );
}

/* ----------------------------------- demo ----------------------------------- */

/** The demo runs the real checker on the example repository; you edit the file yourself. */
function DemoCheck() {
  const { data } = useWorkspace();
  const file = data.recorded?.files[0];
  const initial: Draft[] | undefined =
    file && file.after !== null
      ? [{ id: 0, path: file.path, content: file.after, remove: false }]
      : undefined;
  return (
    <div className="space-y-5">
      <div className="border-info/30 bg-info-soft rounded-xl border p-4 text-sm">
        <Badge tone="info">Live on the example repository</Badge>
        <p className="mt-2 leading-relaxed">
          This runs Nykst&apos;s real checker against {data.repository}. The file below has an
          exported function renamed; edit it or paste any other file and press Check. Writing a
          change with AI needs your own connected repository.
        </p>
      </div>
      <CheckMode {...(initial ? { initial, autoRun: true } : {})} />
    </div>
  );
}

/* ----------------------------------- view ----------------------------------- */

export function ChangeView() {
  const { canWrite } = useWorkspace();
  const [mode, setMode] = useState<Mode>("describe");
  if (!canWrite)
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <DemoCheck />
      </div>
    );
  const tabs: { id: Mode; label: string }[] = [
    { id: "describe", label: "Describe a change" },
    { id: "check", label: "Check my own files" },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div
        role="tablist"
        aria-label="Change mode"
        className="border-border bg-surface inline-flex rounded-lg border p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={mode === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setMode(t.id)}
            className={cn(
              "min-h-10 rounded-md px-3 text-sm font-medium transition-colors",
              mode === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`}>
        {mode === "describe" ? <DescribeMode /> : <CheckMode />}
      </div>
    </div>
  );
}
