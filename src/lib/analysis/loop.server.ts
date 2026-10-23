import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCodeEvidence } from "@/lib/integrations/evidence.server";
import { isSelfRepository } from "@/lib/code-links";
import { impactBriefing } from "./context";
import { generateFixPatch } from "./fix";
import { indexAnalysis } from "./impact";
import { simulateChange } from "./simulate";
import { columnDriftFindings } from "./sql";
import { formatSymbolSignature } from "./symbols";
import type { AnalysisSnapshot } from "./tools";
import {
  computeFinOps,
  coveringTestCommand,
  scenarioContent,
  summarizeVerdict,
  type LoopCaller,
  type LoopHeal,
  type LoopRun,
  type LoopScenarioId,
  type LoopSymbolRow,
} from "../loop";

/**
 * Runs all four stages of the safe-coding loop against a live analysis snapshot.
 *
 * The proposed change is a literal transform of the real file, the overlay runs
 * on a clone of the real graph, and the verdict is derived from that overlay's
 * own new-cycle / new-unresolved / column-drift output. Nothing here persists a
 * file, a snapshot or a database row.
 */
export async function buildLoopRun(
  snapshot: AnalysisSnapshot,
  input: {
    path: string;
    scenario?: LoopScenarioId;
    content?: string;
    token?: string | null;
  },
): Promise<LoopRun> {
  const { analysis } = snapshot;
  const index = indexAnalysis(analysis);
  const file = index.files.get(input.path);
  if (!file) throw new Error(`${input.path} is not an analyzed source file.`);

  const realContent = input.content ?? (await readContent(snapshot, input.path, input.token));
  if (realContent === null)
    throw new Error(
      `Could not read ${input.path}. Connect GitHub for private repositories and retry.`,
    );

  const importer = (index.dependents.get(input.path) ?? [])
    .slice()
    .sort((a, b) => Number(a.typeOnly) - Number(b.typeOnly) || a.path.localeCompare(b.path))[0];
  const table =
    analysis.resources.find(
      (resource) =>
        resource.kind === "table" &&
        (resource.columns?.length ?? 0) > 0 &&
        resource.uses.some((use) => use.path === input.path),
    ) ??
    analysis.resources.find(
      (resource) => resource.kind === "table" && (resource.columns?.length ?? 0) > 0,
    );
  // A deliberately unknown column name: the scenario must actually drift.
  const tableContext = table
    ? { name: table.name, column: "nykst_simulated_dropped_column" }
    : null;

  const scenario: LoopScenarioId = input.scenario ?? "clean-enhancement";
  const transform = input.content
    ? {
        content: input.content,
        summary: "Caller-supplied buffer, verified unchanged against the live graph.",
        line: null,
      }
    : scenarioContent(realContent, scenario, {
        path: input.path,
        directImporter: importer?.path ?? null,
        table: tableContext,
      });

  const before = {
    cycles: analysis.cycles.length,
    unresolved: analysis.stats.unresolvedImports,
    columnDrift: columnDriftFindings(analysis).length,
  };

  const startedAt = Date.now();
  const simulation = await simulateChange(
    snapshot,
    [{ path: input.path, content: transform.content }],
    [input.path],
  );
  const durationMs = Date.now() - startedAt;

  const removedExports =
    scenario === "remove-export" && !input.content
      ? [file.exports[0] ?? file.symbols?.[0]?.name ?? "exported symbol"]
      : [];

  const briefing = impactBriefing(analysis, snapshot.history, [input.path], { maxItems: 40 });
  const directImporters: LoopCaller[] = briefing.impact.direct_importers.map((item) => ({
    path: item.path,
    line: item.line,
    imports: item.imports,
    typeOnly: item.type_only,
  }));
  const brokenCallers = removedExports.length ? directImporters : [];
  const driftedResources = analysis.resources.filter((resource) =>
    resource.uses.some((use) => use.path === input.path),
  );

  const stage1: LoopRun["stage1"] = {
    file: { role: file.role, loc: file.loc, exports: file.exports.slice(0, 20) },
    symbols: (file.symbols ?? []).slice(0, 14).map((symbol): LoopSymbolRow => ({
      name: symbol.name,
      kind: symbol.kind,
      line: symbol.line,
      signature: formatSymbolSignature(symbol),
      minArity: symbol.requiredArity ?? null,
      maxArity: symbol.arity ?? null,
    })),
    directImporters,
    transitive: {
      runtime: briefing.impact.runtime_dependents,
      typeOnly: briefing.impact.type_only_dependents,
      entrypoints: briefing.impact.entrypoints.slice(0, 10),
      tests: briefing.impact.tests_that_cover_it,
      areas: briefing.impact.areas,
    },
    cycles: analysis.cycles.filter((cycle) => cycle.includes(input.path)).slice(0, 6),
    contracts: driftedResources.slice(0, 10).map((resource) => ({
      id: resource.id,
      name: resource.name,
      kind: resource.kind,
      line: resource.uses.find((use) => use.path === input.path)?.line ?? 0,
      columns: (resource.columns ?? []).map((column) => column.name),
      drift: (resource.columnDrift ?? [])
        .filter((finding) => finding.references.some((ref) => ref.path === input.path))
        .map((finding) => ({
          column: finding.column,
          message: finding.message,
          references: finding.references.map((ref) => ({ path: ref.path, line: ref.line })),
        })),
    })),
    memory: [
      {
        id: "co-change",
        label: "Co-change history",
        count: briefing.history.usually_changed_together.length,
        detail: briefing.history.usually_changed_together
          .slice(0, 3)
          .map((item) => `${item.path} (${item.count}×)`)
          .join(" · "),
      },
      {
        id: "decisions",
        label: "Decisions & pull requests",
        count: briefing.history.pull_requests.length,
        detail: briefing.history.pull_requests
          .slice(0, 2)
          .map((pull) => `#${pull.number} ${pull.title}`)
          .join(" · "),
      },
      {
        id: "commits",
        label: "Commit outcomes",
        count: briefing.history.commits.length,
        detail: briefing.history.commits
          .slice(0, 2)
          .map((commit) => `${commit.sha} ${commit.message}`)
          .join(" · "),
      },
      {
        id: "failures",
        label: "Failure patterns",
        count:
          analysis.cycles.length +
          briefing.impact.tests_that_cover_it.length +
          driftedResources.reduce((sum, resource) => sum + (resource.columnDrift?.length ?? 0), 0),
        detail: `${analysis.cycles.length} runtime cycles · ${driftedResources.length} SQL resources in scope`,
      },
      {
        id: "conventions",
        label: "Conventions & contracts",
        count: file.resources.length + (file.endpoints?.length ?? 0),
        detail: `${file.resources.length} SQL references · ${file.endpoints?.length ?? 0} literal endpoints`,
      },
      {
        id: "continuity",
        label: "Continuity & blind spots",
        count: analysis.limitations.length,
        detail: analysis.limitations.slice(0, 2).join(" · "),
      },
    ],
    finops: computeFinOps(
      {
        target: input.path,
        symbols: file.symbols ?? [],
        impact: briefing.impact,
        contracts: driftedResources,
        history: briefing.history,
      },
      analysis.stats,
    ),
  };

  const stage3: LoopRun["stage3"] = {
    durationMs,
    before,
    after: {
      cycles: simulation.after.cycles,
      unresolved: simulation.after.unresolved,
      columnDrift: simulation.column_drift.length,
    },
    newCycles: simulation.new_cycles,
    newUnresolved: simulation.new_unresolved_imports,
    columnDrift: simulation.column_drift.map((finding) => ({
      table: finding.table,
      column: finding.column,
      message: finding.message,
      references: finding.references.map((ref) => ({ path: ref.path, line: ref.line })),
    })),
    removedExports,
    brokenCallers,
    blastDelta:
      (simulation.impact?.runtime_dependents ?? briefing.impact.runtime_dependents) -
      briefing.impact.runtime_dependents,
  };

  const verdict = summarizeVerdict({
    before,
    after: stage3.after,
    newCycles: stage3.newCycles,
    newUnresolved: stage3.newUnresolved,
    removedExports,
    brokenCallers,
  });

  let heal: LoopHeal | null = null;
  if (stage3.newUnresolved.length) {
    try {
      const fix = await generateFixPatch(snapshot, {
        path: input.path,
        content: transform.content,
        issue: "unresolved-import",
      });
      const patch = "patch" in fix ? fix.patch : "";
      const changes = "changes" in fix ? fix.changes : [];
      let healedContent: string | null = null;
      if (fix.verified && changes.length) {
        const lines = transform.content.split("\n");
        for (const change of changes) {
          if (lines[change.line - 1] === change.before) lines[change.line - 1] = change.after;
        }
        const candidate = lines.join("\n");
        const verified = await simulateChange(
          snapshot,
          [{ path: input.path, content: candidate }],
          [input.path],
        );
        if (verified.new_unresolved_imports.length === 0 && verified.new_cycles.length === 0) {
          healedContent = candidate;
        }
      }
      const verification =
        "verification" in fix
          ? {
              before: fix.verification.unresolved_before,
              after: fix.verification.unresolved_after,
              cyclesBefore: fix.verification.cycles_before,
              cyclesAfter: fix.verification.cycles_after,
            }
          : {
              before: stage3.before.unresolved,
              after: stage3.after.unresolved,
              cyclesBefore: stage3.before.cycles,
              cyclesAfter: stage3.after.cycles,
            };
      heal = {
        available: true,
        verified: Boolean(fix.verified && healedContent),
        patch: patch || "",
        reason:
          ("reason" in fix && fix.reason) ||
          (fix.verified
            ? "The rewrite lowered unresolved imports without adding a cycle."
            : "No exact existing target was found; Nykst will not guess a file."),
        healedContent,
        unresolvedBefore: verification.before,
        unresolvedAfter: verification.after,
        cyclesBefore: verification.cyclesBefore,
        cyclesAfter: verification.cyclesAfter,
      };
    } catch {
      heal = null;
    }
  }

  const coveringTests = briefing.impact.tests_that_cover_it;
  const stage4: LoopRun["stage4"] = {
    ...verdict,
    coveringTests,
    command: coveringTestCommand(coveringTests),
    heal,
    safeChecks:
      verdict.verdict === "safe"
        ? [
            "0 new runtime cycles (Tarjan SCC)",
            "0 new unresolved imports",
            "0 new SQL column contract violations",
            "All downstream callers intact",
          ]
        : [],
  };

  const suggestedPaths = [...index.files.values()]
    .filter((candidate) => candidate.path !== input.path && candidate.loc > 40)
    .sort((a, b) => {
      const aScore = (index.dependents.get(a.path)?.length ?? 0) * 10 + a.loc / 100;
      const bScore = (index.dependents.get(b.path)?.length ?? 0) * 10 + b.loc / 100;
      return bScore - aScore || a.path.localeCompare(b.path);
    })
    .slice(0, 8)
    .map((candidate) => candidate.path);

  return {
    repository: snapshot.repository_full_name,
    path: input.path,
    ref: analysis.ref,
    source: isSelfRepository(snapshot.repository_full_name) ? "workspace" : "github",
    suggestedPaths: [input.path, ...suggestedPaths],
    stage1,
    stage2: {
      scenario: input.content ? "clean-enhancement" : scenario,
      summary: transform.summary,
      changedLine: transform.line,
      content: transform.content,
    },
    stage3,
    stage4,
  };
}

/** Full source for the target file: local checkout first, then the GitHub blob. */
async function readContent(
  snapshot: AnalysisSnapshot,
  path: string,
  token: string | null | undefined,
): Promise<string | null> {
  if (isSelfRepository(snapshot.repository_full_name) && !path.includes("..")) {
    const absolute = join(process.cwd(), path);
    if (existsSync(absolute)) {
      try {
        return readFileSync(absolute, "utf8");
      } catch {
        // Fall through to the evidence loader.
      }
    }
  }
  const evidence = await loadCodeEvidence({
    token: token ?? null,
    repository: snapshot.repository_full_name,
    path,
    ref: snapshot.analysis.ref,
  });
  return evidence?.content ?? null;
}
