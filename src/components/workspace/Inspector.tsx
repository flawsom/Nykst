import { ChevronRight, Trash2 } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { chainFor, historyFor } from "@/lib/analysis/impact";
import { isFixLike, isRevert } from "@/lib/analysis/history-utils";
import { MEMORY_KINDS, type MemoryKind, type MemoryNote } from "@/lib/analysis/memory-match";
import type { AnalyzedFile, ImportRef } from "@/lib/analysis/types";
import { IMPACT_TONE, SEVERITY_TONE, timeAgo } from "@/lib/workspace/model";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./WorkspaceContext";
import {
  Badge,
  buttonClass,
  EmptyState,
  ErrorNote,
  FileLink,
  SectionTitle,
  Spinner,
  Stat,
} from "./ui";

const TABS = ["Impact", "History", "Memory", "Code"] as const;
type Tab = (typeof TABS)[number];

const KIND_LABEL: Record<MemoryKind, string> = {
  note: "Note",
  decision: "Decision",
  gotcha: "Gotcha",
  "bug-fix": "Bug fix",
  convention: "Convention",
};

const NOTE_MAX = 4000;
const CAP = 15;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function dirOf(path: string) {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

/** A list capped at `cap` items with a "Show all N" toggle. */
function Capped<T>({
  items,
  cap = CAP,
  render,
}: {
  items: T[];
  cap?: number;
  render: (item: T, index: number) => ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, cap);
  return (
    <div>
      <ul className="divide-border divide-y">
        {shown.map((item, i) => (
          <li key={i} className="py-1.5">
            {render(item, i)}
          </li>
        ))}
      </ul>
      {items.length > cap && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className={cn(buttonClass.ghost, "mt-1")}
        >
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <SectionTitle aside={count !== undefined ? <Badge>{count}</Badge> : null}>
        {title}
      </SectionTitle>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

/* ---------------------------------- tabs ---------------------------------- */

function TabList({ tab, setTab, base }: { tab: Tab; setTab: (t: Tab) => void; base: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: KeyboardEvent) => {
    const at = TABS.indexOf(tab);
    let next = at;
    if (event.key === "ArrowRight") next = (at + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (at - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next]!);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Inspector sections"
      onKeyDown={onKey}
      className="border-border flex border-b px-2"
    >
      {TABS.map((name, i) => (
        <button
          key={name}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          id={`${base}-tab-${name}`}
          aria-selected={tab === name}
          aria-controls={`${base}-panel`}
          tabIndex={tab === name ? 0 : -1}
          onClick={() => setTab(name)}
          className={cn(
            "min-h-10 flex-1 border-b-2 px-2 text-sm font-medium transition-colors",
            tab === name
              ? "border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- impact --------------------------------- */

function ImpactTab({ path }: { path: string }) {
  const { impact, findingsByPath, index } = useWorkspace();
  const report = impact([path]);
  const findings = findingsByPath.get(path) ?? [];
  const total = report.impacted.length;
  const areas = report.areas;
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold">If you change this file</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          {total === 0
            ? "Nothing imports this file, so a change here cannot break other files through imports."
            : `${plural(report.direct.length, "file")} import${report.direct.length === 1 ? "s" : ""} it directly; ${plural(total, "file")} can be affected in total; ${plural(report.entrypoints.length, "entry point")}; ${plural(report.tests.length, "test")}.`}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Direct importers" value={report.direct.length} />
          <Stat
            label="Files affected"
            value={total}
            {...(total >= 15 ? { tone: "warn" as const } : {})}
          />
          <Stat label="Entry points" value={report.entrypoints.length} />
          <Stat label="Tests" value={report.tests.length} />
        </div>
      </section>

      {findings.length > 0 && (
        <Block title="Open findings" count={findings.length}>
          <ul className="space-y-1.5">
            {findings.map((f) => (
              <li key={f.id} className="flex items-start gap-2 text-sm">
                <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
                <span>{f.title}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Direct importers" count={report.direct.length}>
        {report.direct.length === 0 ? (
          <Muted>Nothing imports this file.</Muted>
        ) : (
          <Capped
            items={report.direct}
            render={(item) => (
              <span className="flex flex-wrap items-center gap-2">
                <FileLink path={item.path} line={item.line} />
                {item.typeOnly && <Badge>type only</Badge>}
              </span>
            )}
          />
        )}
      </Block>

      <Block title="Entry points reached" count={report.entrypoints.length}>
        {report.entrypoints.length === 0 ? (
          <Muted>No route, API or script reaches this file through imports.</Muted>
        ) : (
          <Capped
            items={report.entrypoints}
            render={(item) => {
              const chain = chainFor(report, item.path);
              return (
                <div className="space-y-1">
                  <FileLink path={item.path} />
                  <p className="text-muted-foreground flex flex-wrap items-center gap-0.5 text-xs">
                    {[...chain].reverse().map((step, i) => (
                      <span key={`${step}-${i}`} className="inline-flex items-center gap-0.5">
                        {i > 0 && <ChevronRight className="size-3" aria-hidden />}
                        <span className="font-mono" title={step}>
                          {step.split("/").pop()}
                        </span>
                      </span>
                    ))}
                  </p>
                </div>
              );
            }}
          />
        )}
      </Block>

      <Block title="Tests that reach it" count={report.tests.length}>
        {report.tests.length === 0 ? (
          <Muted>No test reaches this file through imports.</Muted>
        ) : (
          <Capped items={report.tests} render={(item) => <FileLink path={item.path} />} />
        )}
      </Block>

      <Block title="Areas affected" count={areas.length}>
        {areas.length === 0 ? (
          <Muted>No other area is affected.</Muted>
        ) : (
          <Capped
            items={areas}
            render={(a) => (
              <span className="flex items-center justify-between gap-2 text-sm">
                <span className="font-mono text-xs break-all">{a.area}</span>
                <span className="text-muted-foreground tabular text-xs">
                  {plural(a.files, "file")}
                </span>
              </span>
            )}
          />
        )}
      </Block>
      <p className="sr-only">{index.files.size} files analyzed</p>
    </div>
  );
}

/* --------------------------------- history -------------------------------- */

function HistoryTab({ path }: { path: string }) {
  const { data } = useWorkspace();
  const h = useMemo(() => historyFor(data.history, [path]), [data.history, path]);
  if (!h.commits.length && !h.pullRequests.length)
    return (
      <EmptyState title="No history for this file">
        {data.history
          ? "None of the analyzed commits or pull requests touched it."
          : "Commit history was not available for this repository."}
      </EmptyState>
    );
  const maxCo = Math.max(1, ...h.coChange.map((c) => c.count));
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-xs">From the most recent analyzed commits.</p>
      <Block title="Authors" count={h.authors.length}>
        <ul className="space-y-1">
          {h.authors.slice(0, 8).map((a) => (
            <li key={a.name} className="flex justify-between gap-2 text-sm">
              <span className="break-all">{a.name}</span>
              <span className="text-muted-foreground tabular text-xs">
                {plural(a.commits, "commit")}
              </span>
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Changes together with">
        <p className="text-muted-foreground text-xs">Files that changed in the same commit or PR</p>
        {h.coChange.length === 0 ? (
          <Muted>No file changed together with this one at least twice.</Muted>
        ) : (
          <ul className="space-y-2">
            {h.coChange.slice(0, 8).map((c) => (
              <li key={c.path} className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <FileLink path={c.path} />
                  <span className="text-muted-foreground tabular text-xs">{c.count}x</span>
                </div>
                <div className="bg-muted h-1 rounded-full" aria-hidden>
                  <div
                    className="bg-primary h-1 rounded-full"
                    style={{ width: `${Math.round((c.count / maxCo) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title="Recent commits" count={h.commits.length}>
        {h.commits.length === 0 ? (
          <Muted>No commits touched this file.</Muted>
        ) : (
          <ul className="divide-border divide-y">
            {h.commits.slice(0, 15).map((c) => (
              <li key={c.sha} className="space-y-1 py-2">
                <p className="text-sm">
                  {c.message} {isFixLike(c.message) && <Badge tone="warn">fix</Badge>}{" "}
                  {isRevert(c.message) && <Badge tone="danger">revert</Badge>}
                </p>
                <p className="text-muted-foreground text-xs">
                  {c.author} · {timeAgo(c.date)} ·{" "}
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary font-mono underline-offset-2 hover:underline"
                    >
                      {c.sha.slice(0, 7)}
                    </a>
                  ) : (
                    <span className="font-mono">{c.sha.slice(0, 7)}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Block>
      {h.pullRequests.length > 0 && (
        <Block title="Pull requests" count={h.pullRequests.length}>
          <ul className="divide-border divide-y">
            {h.pullRequests.slice(0, 10).map((p) => (
              <li key={p.number} className="py-2 text-sm">
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary font-mono underline-offset-2 hover:underline"
                  >
                    #{p.number}
                  </a>
                ) : (
                  <span className="font-mono">#{p.number}</span>
                )}{" "}
                {p.title}
              </li>
            ))}
          </ul>
        </Block>
      )}
      {h.closedIssues.length > 0 && (
        <Block title="Closed issues">
          <p className="font-mono text-sm">{h.closedIssues.map((n) => `#${n}`).join(", ")}</p>
        </Block>
      )}
    </div>
  );
}

/* --------------------------------- memory --------------------------------- */

function NoteRow({
  note,
  path,
  canWrite,
  onDelete,
}: {
  note: MemoryNote;
  path: string;
  canWrite: boolean;
  onDelete: (id: string) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete(note.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the note.");
      setBusy(false);
      setConfirm(false);
    }
  };
  return (
    <li className="border-border bg-surface space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={note.kind === "gotcha" ? "warn" : "info"}>{KIND_LABEL[note.kind]}</Badge>
        {canWrite && (
          <button
            type="button"
            aria-label={confirm ? "Confirm delete" : "Delete note"}
            disabled={busy}
            onClick={() => (confirm ? void remove() : setConfirm(true))}
            onBlur={() => setConfirm(false)}
            className={cn(buttonClass.ghost, "-my-1", confirm && "text-danger")}
          >
            <Trash2 className="size-4" aria-hidden />
            {confirm && "Confirm delete"}
          </button>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap">{note.body}</p>
      {note.path !== path && (
        <p className="text-muted-foreground text-xs">
          On <span className="font-mono break-all">{note.path || "whole repository"}</span>
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {note.source === "user" ? "added by you" : "added by an AI agent"} ·{" "}
        {timeAgo(note.created_at)}
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}
    </li>
  );
}

function NotesTab({ path }: { path: string }) {
  const { api, canWrite } = useWorkspace();
  const [notes, setNotes] = useState<MemoryNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<MemoryKind>("note");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"file" | "folder" | "repo">("file");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const uid = useId();
  const dir = dirOf(path);

  useEffect(() => {
    let live = true;
    setNotes(null);
    setError(null);
    api
      .listNotes(path)
      .then((list) => live && setNotes(list))
      .catch(
        (e: unknown) => live && setError(e instanceof Error ? e.message : "Could not load notes."),
      );
    return () => {
      live = false;
    };
  }, [api, path]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const target = scope === "file" ? path : scope === "folder" ? dir : "";
      const note = await api.addNote({ path: target, kind, body: body.trim() });
      setNotes((prev) => [note, ...(prev ?? [])]);
      setBody("");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "border-border bg-background focus-visible:ring-primary min-h-10 w-full rounded-lg border px-3 text-sm";
  return (
    <div className="space-y-5">
      {canWrite && (
        <form
          className="border-border space-y-3 rounded-lg border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) void save();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs" htmlFor={`${uid}-kind`}>
              <span className="text-muted-foreground">Type</span>
              <select
                id={`${uid}-kind`}
                className={field}
                value={kind}
                onChange={(e) => setKind(e.target.value as MemoryKind)}
              >
                {MEMORY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k].toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs" htmlFor={`${uid}-scope`}>
              <span className="text-muted-foreground">Applies to</span>
              <select
                id={`${uid}-scope`}
                className={field}
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
              >
                <option value="file">This file</option>
                {dir && <option value="folder">This folder ({dir})</option>}
                <option value="repo">Whole repository</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-xs" htmlFor={`${uid}-body`}>
            <span className="text-muted-foreground">Note</span>
            <textarea
              id={`${uid}-body`}
              required
              rows={4}
              maxLength={NOTE_MAX}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="border-border bg-background focus-visible:ring-primary w-full rounded-lg border p-3 text-sm"
            />
            <span className="text-muted-foreground tabular block text-right">
              {body.length}/{NOTE_MAX}
            </span>
          </label>
          <p className="text-muted-foreground text-xs">
            Notes are visible to your AI agents over MCP. Don't paste secrets.
          </p>
          {saveError && <ErrorNote>{saveError}</ErrorNote>}
          <button type="submit" disabled={saving || !body.trim()} className={buttonClass.primary}>
            {saving ? "Saving..." : "Save note"}
          </button>
        </form>
      )}
      {error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : notes === null ? (
        <Spinner label="Loading notes" />
      ) : notes.length === 0 ? (
        <Muted>
          {canWrite
            ? "No notes apply to this file yet."
            : "No notes. Notes need a connected repository."}
        </Muted>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              path={path}
              canWrite={canWrite}
              onDelete={async (id) => {
                await api.deleteNote(id);
                setNotes((prev) => (prev ?? []).filter((x) => x.id !== id));
              }}
            />
          ))}
        </ul>
      )}
      {!canWrite && notes !== null && notes.length > 0 && (
        <Muted>Notes need a connected repository to be changed.</Muted>
      )}
    </div>
  );
}

/* ---------------------------------- code ---------------------------------- */

function signature(file: AnalyzedFile, name: string) {
  const sig = file.exportSigs[name];
  if (!sig) return null;
  if (sig.kind === "function" && sig.required !== undefined) {
    const max = sig.max === undefined ? undefined : sig.max;
    const tail =
      max === null ? ", rest" : max !== undefined && max !== sig.required ? `, up to ${max}` : "";
    return `${sig.kind}(${sig.required} required${tail})`;
  }
  return sig.kind;
}

function CodeTab({ file }: { file: AnalyzedFile }) {
  const { index } = useWorkspace();
  const groups: [string, ImportRef[]][] = [
    ["Internal", file.imports.filter((i) => i.kind === "internal" || i.kind === "asset")],
    ["Packages", file.imports.filter((i) => i.kind === "external")],
    ["Built-in", file.imports.filter((i) => i.kind === "builtin")],
  ];
  const unresolved = file.imports.filter((i) => i.kind === "unresolved");
  const moduleEnv = new Map(file.moduleScopeEnv.map((e) => [e.name, e.line]));
  return (
    <div className="space-y-6">
      <Block title="Exports" count={file.exports.length}>
        {file.exports.length === 0 ? (
          <Muted>This file exports nothing.</Muted>
        ) : (
          <ul className="divide-border divide-y">
            {file.exports.map((name) => (
              <li key={name} className="flex items-baseline justify-between gap-2 py-1.5">
                <span className="font-mono text-xs break-all">{name}</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {signature(file, name)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Imports" count={file.imports.length}>
        {file.imports.length === 0 && <Muted>This file imports nothing.</Muted>}
        {groups.map(
          ([label, list]) =>
            list.length > 0 && (
              <div key={label} className="space-y-1">
                <p className="text-sm font-medium">
                  {label} <span className="text-muted-foreground font-normal">({list.length})</span>
                </p>
                <Capped
                  items={list}
                  render={(i) =>
                    i.kind === "internal" && i.target ? (
                      <FileLink path={i.target} line={i.line} />
                    ) : (
                      <span className="font-mono text-xs break-all">{i.target ?? i.specifier}</span>
                    )
                  }
                />
              </div>
            ),
        )}
        {unresolved.length > 0 && (
          <div className="space-y-1">
            <p className="text-danger text-sm font-medium">Unresolved ({unresolved.length})</p>
            <ul className="space-y-1">
              {unresolved.map((i, n) => (
                <li
                  key={n}
                  className="bg-danger-soft text-danger rounded px-2 py-1 font-mono text-xs break-all"
                >
                  {i.specifier}
                  <span className="opacity-80">:{i.line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Block>

      <Block title="External services" count={file.services.length}>
        {file.services.length === 0 ? (
          <Muted>No external service detected.</Muted>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {file.services.map((id) => (
              <li key={id}>
                <Badge tone="info">{index.services.get(id)?.name ?? id}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Data resources" count={file.resources.length}>
        {file.resources.length === 0 ? (
          <Muted>No tables, functions or buckets used.</Muted>
        ) : (
          <ul className="space-y-1">
            {file.resources.map((r, n) => (
              <li key={`${r.id}-${n}`} className="font-mono text-xs break-all">
                {r.id} <span className="text-subtle">:{r.line}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Environment variables" count={file.envVars.length}>
        {file.envVars.length === 0 ? (
          <Muted>No environment variables read.</Muted>
        ) : (
          <ul className="space-y-1.5">
            {file.envVars.map((name) => (
              <li key={name} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs break-all">{name}</span>
                {moduleEnv.has(name) && (
                  <Badge tone="warn">read at load :{moduleEnv.get(name)}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Calls to other files" count={file.calls.length}>
        {file.calls.length === 0 ? (
          <Muted>No calls to functions exported by other files.</Muted>
        ) : (
          <Capped
            items={file.calls}
            cap={20}
            render={(c) => (
              <div className="space-y-0.5">
                <p className="font-mono text-xs">
                  {c.name}({plural(c.args, "arg")}
                  {c.spread ? ", spread" : ""}) <span className="text-subtle">:{c.line}</span>
                </p>
                <FileLink path={c.target} />
              </div>
            )}
          />
        )}
      </Block>
    </div>
  );
}

/* -------------------------------- inspector -------------------------------- */

export function Inspector() {
  const { selected, index, impact, findingsByPath } = useWorkspace();
  const [tab, setTab] = useState<Tab>("Impact");
  const base = useId();
  useEffect(() => setTab("Impact"), [selected]);

  if (selected === null)
    return (
      <EmptyState title="Select a file">
        Choosing a file shows what depends on it, its history, and notes.
      </EmptyState>
    );

  const file = index.files.get(selected);
  const level = impact([selected]).level;
  const findings = findingsByPath.get(selected) ?? [];
  const bySeverity = (["high", "medium", "low"] as const).map(
    (s) => [s, findings.filter((f) => f.severity === s).length] as const,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-border space-y-2 border-b p-4">
        <h2 className="text-lg font-semibold break-all">{selected.split("/").pop()}</h2>
        <p className="text-muted-foreground font-mono text-xs break-all">{selected}</p>
        <div className="flex flex-wrap gap-1.5">
          {file && <Badge>{file.role}</Badge>}
          {file && <Badge>{plural(file.loc, "line")}</Badge>}
          <Badge tone={IMPACT_TONE[level]}>{level} impact</Badge>
          {bySeverity.map(
            ([s, n]) =>
              n > 0 && (
                <Badge key={s} tone={SEVERITY_TONE[s]}>
                  {n} {s}
                </Badge>
              ),
          )}
        </div>
      </header>
      <TabList tab={tab} setTab={setTab} base={base} />
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${tab}`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto p-4"
      >
        {tab === "Impact" && <ImpactTab path={selected} />}
        {tab === "History" && <HistoryTab path={selected} />}
        {tab === "Memory" && <NotesTab key={selected} path={selected} />}
        {tab === "Code" &&
          (file ? <CodeTab file={file} /> : <Muted>This file was not analyzed.</Muted>)}
      </div>
    </div>
  );
}
