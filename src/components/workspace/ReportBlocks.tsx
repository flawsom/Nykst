import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Info,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { diffLines, diffStats, type DiffLine } from "@/lib/diff";
import { IMPACT_TONE, timeAgo } from "@/lib/workspace/model";
import type { IssueSeverity, VerifyReport } from "@/lib/analysis/verify-types";
import { Badge, FileLink, SectionTitle, Stat, buttonClass, type Tone } from "./ui";

/* --------------------------------- verdict --------------------------------- */

const VERDICT = {
  blocked: {
    tone: "danger",
    title: "Blocked — this change breaks something we can prove",
    Icon: ShieldAlert,
    box: "bg-danger-soft text-danger border-danger/30",
  },
  review: {
    tone: "warn",
    title: "Needs a look",
    Icon: AlertTriangle,
    box: "bg-warn-soft text-warn border-warn/30",
  },
  clear: {
    tone: "ok",
    title: "No problems found",
    Icon: ShieldCheck,
    box: "bg-ok-soft text-ok border-ok/30",
  },
} as const;

export function VerdictBanner({
  report,
  repairs,
  provider,
}: {
  report: VerifyReport;
  repairs?: number | undefined;
  provider?: string | undefined;
}) {
  const v = VERDICT[report.verdict];
  const { errors, warnings, infos } = report.counts;
  return (
    <div className={cn("rounded-xl border p-4", v.box)} role="status" aria-live="polite">
      <div className="flex items-center gap-2.5">
        <v.Icon className="size-5 shrink-0" aria-hidden />
        <p className="text-base font-semibold">{v.title}</p>
      </div>
      <p className="text-foreground mt-2 text-sm">
        {errors} {errors === 1 ? "error" : "errors"}, {warnings}{" "}
        {warnings === 1 ? "warning" : "warnings"}, {infos} {infos === 1 ? "note" : "notes"}
      </p>
      {repairs ? (
        <p className="text-foreground mt-1 text-sm">
          Nykst found problems in the first draft and had the model fix them ({repairs} repair{" "}
          {repairs === 1 ? "round" : "rounds"}).
        </p>
      ) : null}
      {provider && <p className="text-muted-foreground mt-1 text-xs">Written with {provider}</p>}
    </div>
  );
}

/* --------------------------------- impact --------------------------------- */

export function ImpactStrip({ impact }: { impact: VerifyReport["impact"] }) {
  return (
    <section className="space-y-2" aria-label="Impact">
      <SectionTitle>Impact</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="border-border bg-surface rounded-lg border px-3 py-2.5">
          <Badge tone={IMPACT_TONE[impact.level]}>{impact.level}</Badge>
          <div className="text-muted-foreground mt-1.5 text-xs">Impact level</div>
        </div>
        <Stat label="Files depending on it" value={impact.dependents} />
        <Stat label="Entrypoints" value={impact.entrypoints.length} />
        <Stat label="Tests" value={impact.tests.length} />
      </div>
      {impact.areas.length > 0 && (
        <p className="text-muted-foreground text-sm">
          Areas reached: {impact.areas.map((a) => `${a.area} (${a.files})`).join(", ")}
        </p>
      )}
    </section>
  );
}

/* --------------------------------- issues --------------------------------- */

const SEVERITY: Record<IssueSeverity, { Icon: typeof Info; tone: Tone; label: string }> = {
  error: { Icon: XCircle, tone: "danger", label: "Error" },
  warning: { Icon: AlertTriangle, tone: "warn", label: "Warning" },
  info: { Icon: Info, tone: "info", label: "Note" },
};

export function IssueList({ issues }: { issues: VerifyReport["issues"] }) {
  if (!issues.length)
    return (
      <p className="text-muted-foreground text-sm">No issues were reported by the checks run.</p>
    );
  const groups = (["error", "warning", "info"] as const)
    .map((sev) => ({ sev, items: issues.filter((i) => i.severity === sev) }))
    .filter((g) => g.items.length);
  return (
    <section className="space-y-4" aria-label="Issues">
      {groups.map(({ sev, items }) => {
        const s = SEVERITY[sev];
        return (
          <div key={sev} className="space-y-2">
            <SectionTitle>
              {s.label}s ({items.length})
            </SectionTitle>
            <ul className="space-y-2">
              {items.map((issue, i) => (
                <li
                  key={`${issue.check}-${issue.path}-${issue.line ?? 0}-${i}`}
                  className="border-border bg-surface rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <s.Icon
                      className={cn(
                        "size-4 shrink-0",
                        s.tone === "danger" && "text-danger",
                        s.tone === "warn" && "text-warn",
                        s.tone === "info" && "text-info",
                      )}
                      aria-label={s.label}
                    />
                    <Badge tone={s.tone}>{issue.check}</Badge>
                    <FileLink path={issue.path} line={issue.line} />
                  </div>
                  <p className="mt-1.5 text-sm">{issue.message}</p>
                  {issue.detail && (
                    <p className="text-muted-foreground mt-1 text-sm break-words">{issue.detail}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/* ---------------------------------- diffs ---------------------------------- */

type Row = { kind: "line"; line: DiffLine } | { kind: "gap"; count: number };

/** Keep 3 lines of context around changes; collapse longer unchanged runs. */
function collapse(lines: DiffLine[], context = 3): Row[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, i) => {
    if (line.type === " ") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k += 1)
      keep[k] = true;
  });
  const rows: Row[] = [];
  let skipped = 0;
  lines.forEach((line, i) => {
    if (keep[i]) {
      if (skipped) rows.push({ kind: "gap", count: skipped });
      skipped = 0;
      rows.push({ kind: "line", line });
    } else skipped += 1;
  });
  if (skipped) rows.push({ kind: "gap", count: skipped });
  return rows;
}

const STATUS_TONE = { new: "ok", modified: "info", deleted: "danger" } as const;

interface DiffFile {
  path: string;
  status: "new" | "modified" | "deleted";
  before: string | null;
  after: string | null;
}

function DiffFileBlock({ file, defaultOpen }: { file: DiffFile; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = useMemo(() => diffLines(file.before ?? "", file.after ?? ""), [file]);
  const stats = useMemo(() => diffStats(lines), [lines]);
  const rows = useMemo(() => (open ? collapse(lines) : []), [lines, open]);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="bg-surface hover:bg-surface-2 flex min-h-10 w-full flex-wrap items-center gap-2 px-3 py-2 text-left transition-colors"
      >
        <Chevron className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 font-mono text-xs break-all">{file.path}</span>
        <Badge tone={STATUS_TONE[file.status]}>{file.status}</Badge>
        <span className="tabular text-ok text-xs">+{stats.added}</span>
        <span className="tabular text-danger text-xs">-{stats.removed}</span>
      </button>
      {open && (
        <div className="border-border overflow-x-auto border-t">
          <table className="w-full min-w-max border-collapse font-mono text-xs leading-5">
            <tbody>
              {rows.map((row, i) =>
                row.kind === "gap" ? (
                  <tr key={`g${i}`} className="bg-surface-2 text-subtle">
                    <td className="w-6 px-2 text-center select-none">…</td>
                    <td className="px-2 py-0.5">
                      {row.count} unchanged {row.count === 1 ? "line" : "lines"}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={`l${i}`}
                    className={cn(
                      row.line.type === "+" && "bg-ok-soft",
                      row.line.type === "-" && "bg-danger-soft",
                    )}
                  >
                    <td
                      className={cn(
                        "w-6 px-2 text-center select-none",
                        row.line.type === "+" && "text-ok",
                        row.line.type === "-" && "text-danger",
                        row.line.type === " " && "text-subtle",
                      )}
                      aria-label={
                        row.line.type === "+"
                          ? "added"
                          : row.line.type === "-"
                            ? "removed"
                            : "unchanged"
                      }
                    >
                      {row.line.type === " " ? " " : row.line.type}
                    </td>
                    <td className="px-2 whitespace-pre">{row.line.text || " "}</td>
                  </tr>
                ),
              )}
              {open && rows.length === 0 && (
                <tr>
                  <td className="text-muted-foreground px-3 py-2" colSpan={2}>
                    No line changes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DiffList({ files, openFirst = 2 }: { files: DiffFile[]; openFirst?: number }) {
  if (!files.length) return null;
  return (
    <section className="space-y-2" aria-label="Files changed">
      <SectionTitle>Files changed ({files.length})</SectionTitle>
      <div className="space-y-2">
        {files.map((file, i) => (
          <DiffFileBlock key={file.path} file={file} defaultOpen={i < openFirst} />
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------- patch ---------------------------------- */

export function PatchActions({ patch }: { patch: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const [cmdCopied, setCmdCopied] = useState(false);
  const command = "git apply nykst-change.patch";

  async function copy(text: string, done: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      setState("failed");
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([patch], { type: "text/x-diff" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "nykst-change.patch";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="space-y-3" aria-label="Patch">
      <SectionTitle>Take the change</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass.secondary}
          onClick={() =>
            copy(patch, () => {
              setState("copied");
              setTimeout(() => setState("idle"), 2000);
            })
          }
        >
          {state === "copied" ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {state === "copied" ? "Copied" : "Copy patch"}
        </button>
        <button type="button" className={buttonClass.secondary} onClick={download}>
          <Download className="size-4" aria-hidden />
          Download .patch
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {state === "copied" ? "Patch copied to clipboard" : ""}
      </p>
      {state === "failed" && (
        <p className="text-warn text-sm" role="status">
          Copying was blocked by the browser. Use Download .patch instead.
        </p>
      )}
      <div className="border-border bg-surface flex items-center gap-2 rounded-lg border py-1 pr-1 pl-3">
        <code className="min-w-0 flex-1 overflow-x-auto font-mono text-sm whitespace-nowrap">
          {command}
        </code>
        <button
          type="button"
          className={buttonClass.ghost}
          aria-label="Copy git apply command"
          onClick={() =>
            copy(command, () => {
              setCmdCopied(true);
              setTimeout(() => setCmdCopied(false), 2000);
            })
          }
        >
          {cmdCopied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
        </button>
      </div>
      <p className="text-muted-foreground text-sm">
        Run it from the root of your checkout. Nothing was written to your repository.
      </p>
    </section>
  );
}

/* ------------------------------- transparency ------------------------------- */

export function Transparency({
  checked,
  notChecked,
  basis,
  open,
}: {
  checked: string[];
  notChecked: string[];
  basis: VerifyReport["basis"];
  open?: boolean;
}) {
  return (
    <details className="border-border bg-surface rounded-lg border p-3" open={open}>
      <summary className="min-h-10 cursor-pointer text-sm font-medium">
        What was checked and what was not
      </summary>
      <div className="mt-2 space-y-4">
        <div>
          <SectionTitle>What was checked</SectionTitle>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
            {checked.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle>What was not checked</SectionTitle>
          {notChecked.length ? (
            <ul className="text-muted-foreground mt-1.5 list-disc space-y-1 pl-5 text-sm">
              {notChecked.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-1.5 text-sm">Nothing was reported as skipped.</p>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Checked against commit <span className="font-mono">{basis.commit.slice(0, 7)}</span>{" "}
          analyzed {timeAgo(basis.analyzedAt)}.
        </p>
      </div>
    </details>
  );
}
