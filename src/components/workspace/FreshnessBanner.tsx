import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useWorkspace } from "./WorkspaceContext";
import { buttonClass } from "./ui";

interface Behind {
  behindBy: number;
  defaultBranch: string;
}

export function FreshnessBanner({ onReanalyze }: { onReanalyze(): void }) {
  const { data, canWrite } = useWorkspace();
  const repository = data.repository;
  const [behind, setBehind] = useState<Behind | null>(null);

  useEffect(() => {
    if (!canWrite) return;
    let cancelled = false;
    fetch(`/api/pulls?repository=${encodeURIComponent(repository)}`)
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          freshness?: { behindBy?: number | null; defaultBranch?: string } | null;
        };
        const f = body.freshness;
        if (!cancelled && f && typeof f.behindBy === "number" && f.behindBy > 0)
          setBehind({
            behindBy: f.behindBy,
            defaultBranch: f.defaultBranch ?? "the default branch",
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [repository, canWrite]);

  if (!canWrite || !behind) return null;
  return (
    <div
      role="status"
      className="border-warn/30 bg-warn-soft text-warn flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm"
    >
      <span className="min-w-0 flex-1">
        {behind.behindBy} new {behind.behindBy === 1 ? "commit" : "commits"} on{" "}
        <span className="font-mono">{behind.defaultBranch}</span> since this analysis
      </span>
      <button type="button" className={buttonClass.secondary} onClick={onReanalyze}>
        <RefreshCw className="size-4" aria-hidden />
        Update analysis
      </button>
    </div>
  );
}
