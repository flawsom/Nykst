import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCodeEvidence } from "@/lib/integrations/evidence.server";
import { isSelfRepository } from "@/lib/code-links";
import { impactBriefing } from "./context";
import { generateFixPatch } from "./fix";
import { impactOf, indexAnalysis } from "./impact";
import { resolveExportOrigin } from "./reexports";
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
  type LoopFinding,
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

  const loaded =
    input.content !== undefined
      ? { content: input.content, source: "client" as const }
      : await readContent(snapshot, input.path, input.token);
  if (!loaded)
    throw new Error(
      `Could not read ${input.path}. Connect GitHub for private repositories and retry.`,
    );
  const realContent = loaded.content;

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

  // A real imported function with a known required arity, used by the
  // wrong-arity control. Without one the scenario refuses instead of inventing
  // a symbol that does not exist in this repository.
  const callable = (() => {
    for (const usage of file.importedSymbolUsages ?? []) {
      if (usage.importedName === "*" || usage.isTypeOnly) continue;
      const target = file.imports.find((ref) => ref.specifier === usage.specifier)?.target;
      if (!target) continue;
      const origin = resolveExportOrigin(analysis, target, usage.importedName);
      if (!origin) continue;
      const symbol = analysis.files
        .find((candidate) => candidate.path === origin.path)
        ?.symbols?.find((candidate) => candidate.name === origin.name);
      if (
        symbol?.kind === "function" &&
        symbol.arity !== undefined &&
        (symbol.requiredArity ?? 0) > 0
      )
        return {
          name: usage.localName,
          minArity: symbol.requiredArity ?? 0,
          maxArity: symbol.arity,
        };
    }
    return null;
  })();
  const routeFile =
    file.role === "route" &&
    (file.exports.includes("Route") ||
      (file.symbols ?? []).some((symbol) => symbol.name === "Route"));

  const scenario: LoopScenarioId = input.scenario ?? "clean-enhancement";
  const transform =
    input.content !== undefined
      ? {
          content: input.content,
          summary: "Caller-supplied buffer, verified unchanged against the live graph.",
          line: null,
        }
      : scenarioContent(realContent, scenario, {
          path: input.path,
          directImporter: importer?.path ?? null,
          table: tableContext,
          callable,
          route: routeFile,
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

  // Older ingestions have no usage index. Report them rather than inferring
  // caller breakage from an import edge alone.
  const removedExports = simulation.removed_exports
    .filter((item) => item.path === input.path)
    .map((item) => item.name);

  const briefing = impactBriefing(analysis, snapshot.history, [input.path], { maxItems: 40 });
  const directImporters: LoopCaller[] = briefing.impact.direct_importers.map((item) => ({
    path: item.path,
    line: item.line,
    imports: item.imports,
    typeOnly: item.type_only,
  }));
  const brokenCallers: LoopCaller[] = [
    ...new Map(
      [
        ...simulation.removed_export_callers.map((item) => ({
          path: item.importerPath,
          line: item.importerLine,
          imports: item.symbolName,
          typeOnly: false,
        })),
        ...simulation.signature_arity_breaks.map((item) => ({
          path: item.importerPath,
          line: item.callLine,
          imports: item.symbolName,
          typeOnly: false,
        })),
        ...simulation.arity_violations.map((item) => ({
          path: item.path,
          line: item.line,
          imports: item.symbolName,
          typeOnly: false,
        })),
        ...simulation.removed_routes.flatMap((route) =>
          route.callers.map((caller) => ({
            path: caller.path,
            line: caller.line,
            imports: `Route from ${route.path}`,
            typeOnly: false,
          })),
        ),
        ...simulation.property_contract_breaks.map((item) => ({
          path: item.importerPath,
          line: item.accessLine,
          imports: `${item.symbolName}.${item.property}`,
          typeOnly: false,
        })),
      ].map((item) => [`${item.path}:${item.line}:${item.imports}`, item] as const),
    ).values(),
  ];
  const driftedResources = analysis.resources.filter((resource) =>
    resource.uses.some((use) => use.path === input.path),
  );

  // Chains are recomputed from the live index so a warm module cache can never
  // serve a stale report without causal hops.
  const directImpact = impactOf(index, [input.path]);
  const chainByImporter = new Map(
    directImpact.direct.map((item) => [item.path, item.causalChain] as const),
  );
  const entrypointNames = briefing.impact.entrypoints
    .slice(0, 3)
    .map((item) => item.path)
    .join(", ");
  const areaNames = briefing.impact.areas
    .slice(0, 3)
    .map((area) => `${area.area} (${area.files})`)
    .join(", ");
  const architecturalReason = [
    `Impact level ${briefing.impact.level} with ${briefing.impact.runtime_dependents} runtime dependents and ${briefing.impact.direct_importers.length} direct importers.`,
    entrypointNames
      ? `Reached entrypoints: ${entrypointNames}.`
      : "No page or API entrypoint imports this file, so the blast radius stays inside the library layer.",
    areaNames ? `Areas in scope: ${areaNames}.` : "No area grouping was available.",
    briefing.history.usually_changed_together.length
      ? `Co-change memory: ${briefing.history.usually_changed_together
          .slice(0, 2)
          .map((item) => `${item.path} (${item.count}x)`)
          .join(", ")}.`
      : "No repeated co-change history was recorded for this file.",
  ].join(" ");

  const findings: LoopFinding[] = [];
  const addFinding = (finding: LoopFinding) => {
    if (findings.length < 12) findings.push(finding);
  };
  for (const symbolName of removedExports) {
    const callers = simulation.removed_export_callers.filter(
      (item) => item.symbolName === symbolName,
    );
    const primary = callers[0];
    const symbolLine = file.symbols?.find((symbol) => symbol.name === symbolName)?.line ?? 1;
    addFinding({
      id: `export:${symbolName}`,
      kind: "removed_export",
      whatBroke: `Export removed: ${symbolName}`,
      why: primary
        ? `${primary.importerPath}:${primary.importerLine} still imports ${symbolName}, but the replacement no longer exports it.`
        : `${input.path} no longer exports ${symbolName}; no observed importer uses it.`,
      architecturalReason,
      causalChain: primary ? (chainByImporter.get(primary.importerPath) ?? []) : [],
      target: { path: input.path, line: symbolLine },
    });
  }
  for (const breakage of simulation.signature_arity_breaks) {
    addFinding({
      id: `arity:${breakage.symbolName}:${breakage.importerPath}:${breakage.callLine}`,
      kind: "arity_break",
      whatBroke: `Caller arity mismatch in ${breakage.importerPath}:${breakage.callLine}`,
      why: `${breakage.symbolName} now requires ${breakage.expectedArity} arguments, but this call passes ${breakage.passedArgs}.`,
      architecturalReason,
      causalChain: chainByImporter.get(breakage.importerPath) ?? [],
      target: { path: breakage.importerPath, line: breakage.callLine },
    });
  }
  for (const violation of simulation.arity_violations)
    addFinding({
      id: `arity-envelope:${violation.symbolName}:${violation.path}:${violation.line}`,
      kind: "arity_break",
      whatBroke: `Call outside the arity envelope: ${violation.symbolName}`,
      why: `${violation.path}:${violation.line} passes ${violation.passedArgs} arguments, while ${violation.symbolName} accepts ${violation.minArity}..${violation.maxArity}.`,
      architecturalReason,
      causalChain: chainByImporter.get(violation.path) ?? [],
      target: { path: violation.path, line: violation.line },
    });
  for (const route of simulation.removed_routes)
    addFinding({
      id: `route:${route.path}`,
      kind: "removed_route",
      whatBroke: `Route or service dependency removed: ${route.path}`,
      why: route.callers.length
        ? `${route.callers
            .slice(0, 3)
            .map((caller) => `${caller.path}:${caller.line}`)
            .join(
              ", ",
            )} still import${route.callers.length === 1 ? "s" : ""} this route module, but the replacement no longer exports Route.`
        : "The route export was removed; no analyzed file still imports this route module.",
      architecturalReason,
      causalChain: route.callers[0] ? (chainByImporter.get(route.callers[0].path) ?? []) : [],
      target: {
        path: route.path,
        line: file.symbols?.find((symbol) => symbol.name === "Route")?.line ?? 1,
      },
    });
  for (const breakage of simulation.property_contract_breaks) {
    addFinding({
      id: `property:${breakage.symbolName}:${breakage.property}:${breakage.importerPath}:${breakage.accessLine}`,
      kind: "property_break",
      whatBroke: `Property contract break: ${breakage.symbolName}.${breakage.property}`,
      why: `${breakage.importerPath}:${breakage.accessLine} reads ${breakage.property}, which the replacement ${breakage.symbolName} no longer declares.`,
      architecturalReason,
      causalChain: chainByImporter.get(breakage.importerPath) ?? [],
      target: { path: breakage.importerPath, line: breakage.accessLine },
    });
  }
  for (const cycle of simulation.new_cycles)
    addFinding({
      id: `cycle:${cycle.join(">")}`,
      kind: "cycle",
      whatBroke: `Runtime import cycle: ${cycle.join(" -> ")} -> ${cycle[0]}`,
      why: `Tarjan SCC found a new ${cycle.length}-file runtime cycle that did not exist in the stored graph.`,
      architecturalReason,
      causalChain: cycle.slice(0, -1).map((fromPath, index) => ({
        fromPath,
        toPath: cycle[index + 1] ?? cycle[0]!,
        importLine:
          analysis.files
            .find((candidate) => candidate.path === fromPath)
            ?.imports.find((ref) => ref.target === (cycle[index + 1] ?? cycle[0]))?.line ?? 1,
        importedSymbols: [],
      })),
      target: { path: input.path, line: 1 },
    });
  for (const item of simulation.new_unresolved_imports)
    addFinding({
      id: `unresolved:${item.path}:${item.line}:${item.specifier}`,
      kind: "unresolved_import",
      whatBroke: `Unresolved import at ${item.path}:${item.line}`,
      why: `"${item.specifier}" does not resolve to any file in the analyzed repository.`,
      architecturalReason,
      causalChain: [],
      target: { path: item.path, line: item.line },
    });
  for (const finding of simulation.new_column_drift)
    for (const reference of finding.references)
      addFinding({
        id: `column:${finding.table}:${finding.column}:${reference.path}:${reference.line}`,
        kind: "column_drift",
        whatBroke: `SQL column drift: ${finding.table}.${finding.column}`,
        why: `${reference.path}:${reference.line} ${finding.message}`,
        architecturalReason,
        causalChain: chainByImporter.get(reference.path) ?? [],
        target: { path: reference.path, line: reference.line },
      });

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
    columnDrift: simulation.new_column_drift.map((finding) => ({
      table: finding.table,
      column: finding.column,
      message: finding.message,
      references: finding.references.map((ref) => ({ path: ref.path, line: ref.line })),
    })),
    removedExports,
    brokenCallers,
    arityViolations: simulation.arity_violations.map((item) => ({
      path: item.path,
      line: item.line,
      symbolName: item.symbolName,
      passedArgs: item.passedArgs,
      expectedArity: `${item.minArity}..${item.maxArity}`,
    })),
    removedRoutes: simulation.removed_routes,
    findings,
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
    newColumnDriftCount: simulation.new_column_drift.length,
    missingSymbolUsageFiles: simulation.missing_symbol_usage_files,
    arityViolations: simulation.arity_violations.map((item) => ({
      path: item.path,
      line: item.line,
      symbolName: item.symbolName,
    })),
    removedRoutes: simulation.removed_routes,
  });

  const breakingTotal = (candidate: typeof simulation) =>
    candidate.new_unresolved_imports.length +
    candidate.new_cycles.length +
    candidate.removed_export_callers.length +
    candidate.signature_arity_breaks.length +
    candidate.arity_violations.length +
    candidate.removed_routes.length +
    candidate.property_contract_breaks.length +
    candidate.new_column_drift.length;

  /**
   * A refusal must name the check that failed for this break class. Reusing one
   * generic "cycle" sentence for SQL drift or arity was the exact defect D04
   * recorded, so each class gets its own reason.
   */
  const refusalReason = (fallback?: string) => {
    const cycle = stage3.newCycles[0];
    if (cycle)
      return `New runtime cycle: ${cycle.join(" -> ")} -> ${cycle[0]}. The auto-healer did not find a strategy that removed this cycle without breaking another resolved import, so no patch was presented.`;
    const drift = stage3.columnDrift[0];
    if (drift) {
      const reference = drift.references[0];
      return `SQL column drift: ${drift.table}.${drift.column}${reference ? ` is read at ${reference.path}:${reference.line}` : ""}. The auto-healer found no active column to rewrite to, so no patch was presented.`;
    }
    const arity = stage3.arityViolations[0];
    if (arity)
      return `Wrong arity: ${arity.symbolName} at ${arity.path}:${arity.line} passes ${arity.passedArgs} arguments while its declared envelope is ${arity.expectedArity}. The auto-healer will not guess the caller's intended values, so no patch was presented.`;
    const route = stage3.removedRoutes[0];
    if (route)
      return `Route or service dependency removed: ${route.path}. ${route.callers.length ? `${route.callers[0]!.path}:${route.callers[0]!.line} still imports it.` : "No analyzed file still imports it."} No strategy restored a verified route export, so no patch was presented.`;
    if (stage3.removedExports.length) {
      const names = stage3.removedExports.join(", ");
      const caller = simulation.removed_export_callers[0];
      return caller
        ? `Export removed: ${names}. ${caller.importerPath}:${caller.importerLine} still imports it, and no strategy restored a verified compatible export, so no patch was presented.`
        : `Export removed: ${names}. No analyzed importer in this snapshot uses that symbol, so there is no caller-side edit to verify. The public API change is reported and no patch was presented.`;
    }
    return (
      fallback ??
      "No verified strategy reduced the breaking findings without adding a cycle, so no patch was presented."
    );
  };

  let heal: LoopHeal | null = null;
  if (breakingTotal(simulation) > 0) {
    try {
      const fix = await generateFixPatch(snapshot, {
        path: input.path,
        content: transform.content,
        issue: "auto",
      });
      const patch = "patch" in fix ? fix.patch : "";
      const candidate = "healedContent" in fix ? fix.healedContent : null;
      let healedContent: string | null = null;
      if (fix.verified && candidate) {
        const verified = await simulateChange(
          snapshot,
          [{ path: input.path, content: candidate }],
          [input.path],
        );
        if (
          breakingTotal(verified) < breakingTotal(simulation) &&
          verified.new_cycles.length <= simulation.new_cycles.length
        ) {
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
      const strategies = "strategiesApplied" in fix ? (fix.strategiesApplied as string[]) : [];
      // A patch is evidence only when the in-memory overlay verified that it
      // reduces the breaking score without adding a cycle. An unverified
      // candidate is refused, never returned as a plausible fix.
      const verified = Boolean(fix.verified && healedContent);
      heal = {
        available: true,
        verified,
        patch: verified ? patch || "" : "",
        reason: verified
          ? `Verified ${strategies.length} AST remed${strategies.length === 1 ? "y" : "ies"}: ${strategies.join(", ")}.`
          : refusalReason("reason" in fix ? fix.reason : undefined),
        healedContent: verified ? healedContent : null,
        unresolvedBefore: verification.before,
        unresolvedAfter: verification.after,
        cyclesBefore: verification.cyclesBefore,
        cyclesAfter: verification.cyclesAfter,
        strategies: verified ? strategies : [],
      };
    } catch {
      heal = {
        available: true,
        verified: false,
        patch: "",
        reason: refusalReason(),
        healedContent: null,
        unresolvedBefore: stage3.before.unresolved,
        unresolvedAfter: stage3.after.unresolved,
        cyclesBefore: stage3.before.cycles,
        cyclesAfter: stage3.after.cycles,
        strategies: [],
      };
    }
  } else if (verdict.verdict === "breaking") {
    // Detection can block a public API change without any observed caller. That
    // is still a refusal, so the UI receives a named reason and no patch.
    heal = {
      available: true,
      verified: false,
      patch: "",
      reason: refusalReason(),
      healedContent: null,
      unresolvedBefore: stage3.before.unresolved,
      unresolvedAfter: stage3.after.unresolved,
      cyclesBefore: stage3.before.cycles,
      cyclesAfter: stage3.after.cycles,
      strategies: [],
    };
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
            "0 calls outside a declared arity envelope",
            "0 removed route exports still imported by the route tree",
            "No observed direct symbol contract breaks; run the full typecheck and tests",
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
    source: loaded.source,
    suggestedPaths: [input.path, ...suggestedPaths],
    stage1,
    stage2: {
      scenario: input.content !== undefined ? "clean-enhancement" : scenario,
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
): Promise<{ content: string; source: "workspace" | "github" } | null> {
  if (isSelfRepository(snapshot.repository_full_name) && !path.includes("..")) {
    const absolute = join(process.cwd(), path);
    if (existsSync(absolute)) {
      try {
        return { content: readFileSync(absolute, "utf8"), source: "workspace" };
      } catch {
        // Fall through to the evidence loader.
      }
    }
  }
  const self = isSelfRepository(snapshot.repository_full_name);
  const evidence = await loadCodeEvidence({
    token: token ?? null,
    repository: snapshot.repository_full_name,
    path,
    // The committed self-snapshot is built at "self-snapshot", which is not a
    // real git ref. A source-less host must read the public blob from main.
    ref: self ? "main" : snapshot.analysis.ref,
  });
  if (!evidence) return null;
  return { content: evidence.content, source: evidence.source };
}
