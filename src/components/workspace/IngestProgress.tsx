import { Check, Loader2 } from "lucide-react";
import { INGEST_STAGES, type IngestStageId } from "@/lib/workspace/ingest-client";
import { cn } from "@/lib/utils";

/**
 * Real progress: the server reports each stage as it starts, so a stage is "done" only once
 * a later one began. `stage` is null before the first event; `complete` marks everything done.
 */
export function IngestProgress({
  repository,
  stage,
  detail,
  complete,
  error,
}: {
  repository: string;
  stage: IngestStageId | null;
  detail?: string | undefined;
  complete: boolean;
  error?: string | null;
}) {
  const current = stage ? INGEST_STAGES.findIndex((item) => item.id === stage) : -1;
  return (
    <div
      className="border-border bg-card w-full max-w-md rounded-2xl border p-6"
      aria-live="polite"
    >
      <h2 className="text-lg font-semibold">
        {error ? "Analysis failed" : complete ? "Analysis ready" : "Analyzing"}{" "}
        <span className="text-muted-foreground font-mono text-sm font-normal">{repository}</span>
      </h2>
      <ol className="mt-5 space-y-3">
        {INGEST_STAGES.map((item, index) => {
          const done = complete || index < current;
          const active = !complete && !error && index === current;
          return (
            <li key={item.id} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                  done && "border-ok bg-ok-soft text-ok",
                  active && "border-primary text-primary",
                  !done && !active && "border-border text-subtle",
                )}
                aria-hidden
              >
                {done ? (
                  <Check className="size-3" />
                ) : active ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
              </span>
              <span>
                <span
                  className={cn(
                    "block text-sm",
                    done || active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                  {active && detail ? (
                    <span className="text-muted-foreground"> · {detail}</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground block text-xs">{item.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {error && (
        <p
          role="alert"
          className="border-danger/30 bg-danger-soft text-danger mt-5 rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}
      <p className="text-muted-foreground mt-5 text-xs">
        Large repositories can take a minute or two. Nothing is written to your repository.
      </p>
    </div>
  );
}
