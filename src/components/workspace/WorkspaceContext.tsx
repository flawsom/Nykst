import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  impactOf,
  indexAnalysis,
  type AnalysisIndex,
  type ImpactReport,
} from "@/lib/analysis/impact";
import type { Finding } from "@/lib/analysis/findings";
import type { MemoryKind, MemoryNote } from "@/lib/analysis/memory-match";
import type { VerifyReport, ProposedEdit } from "@/lib/analysis/verify-types";
import { findingsByPath, type WorkspaceData, type WorkspaceView } from "@/lib/workspace/model";

/** What the generate endpoint returns. Mirrors ChangeResult in workspace.server.ts. */
export interface GeneratedChange {
  repository: string;
  summary: string;
  files: {
    path: string;
    status: "new" | "modified" | "deleted";
    before: string | null;
    after: string | null;
  }[];
  report: VerifyReport;
  patch: string;
  read: string[];
  repairs: number;
  warnings: string[];
  provider: string;
}

export interface FindingState {
  signature: string;
  status: "open" | "resolved" | "dismissed";
  first_seen_at: string;
  resolved_at: string | null;
  resolved_commit: string | null;
  times_opened: number;
  dismissed_note: string | null;
}

/** Server calls. They throw an Error whose message is safe to show to the user. */
export interface WorkspaceApi {
  listNotes(path?: string): Promise<MemoryNote[]>;
  addNote(input: { path: string; kind: MemoryKind; body: string }): Promise<MemoryNote>;
  deleteNote(id: string): Promise<void>;
  findingStates(): Promise<FindingState[]>;
  setDismissed(signature: string, dismissed: boolean, note?: string): Promise<void>;
  verify(edits: ProposedEdit[]): Promise<VerifyReport>;
  generate(task: string, paths?: string[]): Promise<GeneratedChange>;
}

export interface WorkspaceValue {
  data: WorkspaceData;
  index: AnalysisIndex;
  selected: string | null;
  select(path: string | null): void;
  view: WorkspaceView;
  setView(view: WorkspaceView): void;
  findingsByPath: Map<string, Finding[]>;
  /** memoized per set of paths */
  impact(paths: string[]): ImpactReport;
  /** false in the read-only demo: notes, generation and verification need a connected repository */
  canWrite: boolean;
  api: WorkspaceApi;
}

const Context = createContext<WorkspaceValue | null>(null);

export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return value;
}

export function WorkspaceProvider(props: {
  data: WorkspaceData;
  selected: string | null;
  select(path: string | null): void;
  view: WorkspaceView;
  setView(view: WorkspaceView): void;
  api: WorkspaceApi;
  children: ReactNode;
}) {
  const { data, selected, select, view, setView, api, children } = props;
  const value = useMemo<WorkspaceValue>(() => {
    const index = indexAnalysis(data.analysis);
    const cache = new Map<string, ImpactReport>();
    return {
      data,
      index,
      selected,
      select,
      view,
      setView,
      findingsByPath: findingsByPath(data.findings),
      impact: (paths) => {
        const key = [...paths].sort().join("\n");
        let report = cache.get(key);
        if (!report) {
          report = impactOf(index, paths);
          cache.set(key, report);
        }
        return report;
      },
      canWrite: data.source === "github",
      api,
    };
  }, [data, selected, select, view, setView, api]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
