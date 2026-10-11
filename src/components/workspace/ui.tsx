import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./WorkspaceContext";

export type Tone = "ok" | "info" | "warn" | "danger" | "neutral";

const TONE: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok border-ok/30",
  info: "bg-info-soft text-info border-info/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small uppercase label above a block of content. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        {children}
      </h3>
      {aside}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone | undefined;
}) {
  return (
    <div className="border-border bg-surface rounded-lg border px-3 py-2.5">
      <div
        className={cn(
          "tabular text-xl font-semibold",
          tone === "danger" && "text-danger",
          tone === "warn" && "text-warn",
          tone === "ok" && "text-ok",
        )}
      >
        {value}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-border mx-auto my-8 max-w-md rounded-xl border border-dashed p-6 text-center">
      <p className="font-medium">{title}</p>
      {children && (
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{children}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-2 text-sm" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="border-danger/30 bg-danger-soft text-danger rounded-lg border px-3 py-2 text-sm"
    >
      {children}
    </p>
  );
}

/** A file path that selects the file in the workspace when clicked. */
export function FileLink({
  path,
  line,
  className,
  children,
}: {
  path: string;
  line?: number | undefined;
  className?: string;
  children?: ReactNode;
}) {
  const { select, index } = useWorkspace();
  const known = index.files.has(path);
  const label = (
    <>
      <span className="text-muted-foreground">
        {path.includes("/") ? `${path.slice(0, path.lastIndexOf("/") + 1)}` : ""}
      </span>
      <span className="text-foreground">{path.split("/").pop()}</span>
      {line ? <span className="text-subtle">:{line}</span> : null}
    </>
  );
  if (!known)
    return (
      <span className={cn("font-mono text-xs break-all", className)}>{children ?? label}</span>
    );
  return (
    <button
      type="button"
      onClick={() => select(path)}
      className={cn(
        "hover:bg-muted focus-visible:bg-muted -mx-1 rounded px-1 text-left font-mono text-xs break-all transition-colors",
        className,
      )}
    >
      {children ?? label}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="border-border bg-surface text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[11px]">
      {children}
    </kbd>
  );
}

export const buttonClass = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-glow inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "border-border bg-surface hover:bg-surface-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  ghost:
    "text-muted-foreground hover:text-foreground hover:bg-muted inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
};
