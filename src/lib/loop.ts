/**
 * The four-stage safe-coding loop, as pure data and pure functions.
 *
 * Stage 1 grounds the agent in real architecture, Stage 2 produces a proposal,
 * Stage 3 overlays it on an in-memory clone of the graph, and Stage 4 either
 * reports the checks or points at an observed file:line issue. Nothing in
 * this file touches the network, the disk or a clock, so the transforms and the
 * token maths are testable in isolation.
 */

export const LOOP_STAGES = [
  {
    id: 1,
    testId: "loop-stage-1",
    title: "Check Architecture & History",
    subtitle: "The bounded evidence envelope, assembled before a line is written.",
  },
  {
    id: 2,
    testId: "loop-stage-2",
    title: "Write or Generate Change",
    subtitle: "Your edit, or a deterministic failure scenario, against the real file.",
  },
  {
    id: 3,
    testId: "loop-stage-3",
    title: "Verify Hidden Dependencies (In-Memory)",
    subtitle: "Overlay the proposal on a cloned graph. Nothing is written.",
  },
  {
    id: 4,
    testId: "loop-stage-4",
    title: "Verdict: Exact file:line Impact & Auto-Fix",
    subtitle: "Review the checks, or teleport to a line with a detected issue.",
  },
] as const;

export type LoopScenarioId =
  | "clean-enhancement"
  | "unresolved-import"
  | "circular-import"
  | "dropped-column"
  | "wrong-arity"
  | "removed-route"
  | "remove-export";

export interface LoopScenario {
  id: LoopScenarioId;
  label: string;
  description: string;
  expectation: "breaking" | "safe";
}

export const LOOP_SCENARIOS: LoopScenario[] = [
  {
    id: "remove-export",
    label: "Remove an exported symbol",
    description: "Drops one exported declaration while every downstream importer stays untouched.",
    expectation: "breaking",
  },
  {
    id: "unresolved-import",
    label: "Introduce an unresolved import",
    description: "Imports a real module from the wrong folder, the classic agent slip.",
    expectation: "breaking",
  },
  {
    id: "wrong-arity",
    label: "Call a function with the wrong arity",
    description:
      "Adds a call to an imported function outside its declared arity envelope, with zero or too many arguments.",
    expectation: "breaking",
  },
  {
    id: "removed-route",
    label: "Remove a route or service dependency",
    description:
      "Removes the exported Route of a route file while the generated route tree still imports it. On a non-route file the loop refuses with a specific reason instead of testing a different file.",
    expectation: "breaking",
  },
  {
    id: "dropped-column",
    label: "Query a dropped SQL column",
    description: "Adds a literal column that the replayed migrations never defined.",
    expectation: "breaking",
  },
  {
    id: "circular-import",
    label: "Introduce a runtime circular import",
    description: "Imports a file that already imports this one, closing a runtime cycle.",
    expectation: "breaking",
  },
  {
    id: "clean-enhancement",
    label: "Try a simple enhancement",
    description: "Adds a new exported constant without touching any existing contract.",
    expectation: "safe",
  },
];

export const DEFAULT_LOOP_SCENARIO: LoopScenarioId = "clean-enhancement";

/** Rough but explicit token estimate: four UTF-8 characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Average characters per analysed source line used for the blind-scan baseline. */
export const BLIND_CHARS_PER_LINE = 40;

export interface LoopFinOps {
  boundedBytes: number;
  boundedTokens: number;
  blindTokens: number;
  blindLoc: number;
  analysedFiles: number;
  reductionPct: number;
  basis: string;
}

export function computeFinOps(
  envelope: unknown,
  stats: { loc: number; analyzedFiles?: number; sourceFiles?: number },
): LoopFinOps {
  const boundedBytes = JSON.stringify(envelope).length;
  const boundedTokens = estimateTokens(JSON.stringify(envelope));
  const blindTokens = Math.max(boundedTokens, Math.ceil((stats.loc * BLIND_CHARS_PER_LINE) / 4));
  const reductionPct = blindTokens > 0 ? Math.round((1 - boundedTokens / blindTokens) * 100) : 0;
  return {
    boundedBytes,
    boundedTokens,
    blindTokens,
    blindLoc: stats.loc,
    analysedFiles: stats.analyzedFiles ?? stats.sourceFiles ?? 0,
    reductionPct,
    basis: `bounded envelope measured exactly; blind baseline = ${stats.loc.toLocaleString("en-US")} analysed LOC × ${BLIND_CHARS_PER_LINE} chars/line ÷ 4 chars/token`,
  };
}

export interface ScenarioContext {
  path: string;
  /** A real file that imports `path`, used to close a runtime cycle. */
  directImporter?: string | null;
  /** A real table/column pair used for the column-drift scenario. */
  table?: { name: string; column: string } | null;
  /** A real imported function and its arity envelope, used by the wrong-arity scenario. */
  callable?: { name: string; minArity: number; maxArity: number | null } | null;
  /** True when the target declares a file route, so its Route export can be removed. */
  route?: boolean;
}

export interface ScenarioTransform {
  content: string;
  summary: string;
  line: number | null;
}

/** Relative module specifier from one repository path to another. */
export function relativeSpecifier(fromPath: string, toPath: string): string {
  const from = fromPath.split("/").slice(0, -1);
  const to = toPath.split("/");
  const file = to.pop() ?? "";
  const target = file.replace(/\.(?:[cm]?[jt]sx?)$/i, "");
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common += 1;
  const up = from.length - common;
  const rest = to.slice(common);
  const prefix = up === 0 ? "./" : `${"../".repeat(up)}`;
  return `${prefix}${[...rest, target].join("/")}`;
}

/**
 * Applies one preset scenario to the real file content. Every mutation is a
 * literal, single-purpose edit so the overlay delta is attributable.
 */
export function scenarioContent(
  content: string,
  scenario: LoopScenarioId,
  context: ScenarioContext,
): ScenarioTransform {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  switch (scenario) {
    case "unresolved-import": {
      // A real sibling module reached through a folder that does not exist: an
      // agent typo that a blind grep misses but the in-memory resolver repairs.
      const line = `import "./__nykst_missing__/utils";`;
      return {
        content: `${line}${newline}${content}`,
        summary:
          "Prepended one side-effect import whose real sibling module sits behind a folder that does not exist in this repository.",
        line: 1,
      };
    }
    case "circular-import": {
      if (!context.directImporter)
        return {
          content,
          summary: "No downstream importer exists, so a cycle cannot be introduced here.",
          line: null,
        };
      const specifier = relativeSpecifier(context.path, context.directImporter);
      const line = `import "${specifier}";`;
      return {
        content: `${content}${newline}${line}${newline}`,
        summary: `Appended an import of ${context.directImporter}, which already imports this file, closing a runtime cycle.`,
        line: content.split(newline).length + 1,
      };
    }
    case "wrong-arity": {
      if (!context.callable)
        return {
          content,
          summary:
            "No imported function with a known required arity was found, so an arity break cannot be constructed here.",
          line: null,
        };
      const { name, minArity, maxArity } = context.callable;
      const tooFew = minArity > 0;
      const args = tooFew
        ? ""
        : Array.from({ length: (maxArity ?? 0) + 2 }, () => "null").join(", ");
      const call = `void ${name}(${args});`;
      return {
        content: `${content}${newline}${call}${newline}`,
        summary: tooFew
          ? `Added a call to ${name}() with 0 arguments, while its declared signature requires at least ${minArity}.`
          : `Added a call to ${name}() with ${(maxArity ?? 0) + 2} arguments, above its declared maximum of ${maxArity}.`,
        line: content.split(newline).length + 1,
      };
    }
    case "removed-route": {
      if (!context.route)
        return {
          content,
          summary:
            "This file does not declare a file route, so a route export cannot be removed here. The loop refuses to test a different file.",
          line: null,
        };
      const routeLine = content
        .split(newline)
        .findIndex((line) => /^\s*export\s+const\s+Route\s*=/.test(line));
      if (routeLine === -1)
        return {
          content,
          summary:
            "No `export const Route` declaration was found, so no route can be removed here.",
          line: null,
        };
      const lines = content.split(newline);
      lines[routeLine] = lines[routeLine]!.replace(/^(\s*)export\s+/, "$1");
      return {
        content: lines.join(newline),
        summary:
          "Removed the export keyword from the file Route declaration while the generated route tree still imports it.",
        line: routeLine + 1,
      };
    }
    case "dropped-column": {
      if (!context.table)
        return {
          content,
          summary: "No literal SQL table reference was found to mutate.",
          line: null,
        };
      const line = `void supabase.from("${context.table.name}").select("id, ${context.table.column}");`;
      return {
        content: `${content}${newline}${line}${newline}`,
        summary: `Added a literal query against ${context.table.name}.${context.table.column}, a column the replayed DDL never defines.`,
        line: content.split(newline).length + 1,
      };
    }
    case "remove-export": {
      const lines = content.split(newline);
      const index = lines.findIndex((line) =>
        /^\s*export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+[A-Za-z_$]/.test(
          line,
        ),
      );
      if (index === -1)
        return {
          content,
          summary: "This file has no exported declaration to remove.",
          line: null,
        };
      const original = lines[index]!;
      lines[index] = original.replace(/^(\s*)export\s+/, "$1");
      const name = /(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/.exec(
        original,
      )?.[1];
      return {
        content: lines.join(newline),
        summary: `Removed the export keyword from ${name ?? "the first exported declaration"} at line ${index + 1}; every importer still expects it.`,
        line: index + 1,
      };
    }
    case "clean-enhancement":
    default: {
      const line = `export const nykstLoopVerified = "${context.path}";`;
      return {
        content: `${content}${newline}${line}${newline}`,
        summary:
          "Appended a new exported constant. Existing exports, imports and SQL columns are untouched.",
        line: content.split(newline).length + 1,
      };
    }
  }
}

export interface LoopCaller {
  path: string;
  line: number;
  imports: string;
  typeOnly: boolean;
}

export interface LoopGateCounts {
  cycles: number;
  unresolved: number;
  columnDrift: number;
}

export interface LoopVerdictInput {
  before: LoopGateCounts;
  after: LoopGateCounts;
  newCycles: string[][];
  newUnresolved: { path: string; line: number; specifier: string }[];
  removedExports: string[];
  brokenCallers: LoopCaller[];
  newColumnDriftCount?: number;
  missingSymbolUsageFiles?: string[];
  /** Calls outside a declared arity envelope, observed in the proposed overlay. */
  arityViolations?: { path: string; line: number; symbolName: string }[];
  /** Routes removed while other analyzed files still import them. */
  removedRoutes?: { path: string; role: string; callers: { path: string; line: number }[] }[];
}

export interface LoopVerdict {
  verdict: "safe" | "breaking";
  headline: string;
  whatBroke: string[];
  why: string;
  newCycleCount: number;
  newUnresolvedCount: number;
  driftDelta: number;
  removedExportCount: number;
  callerCount: number;
  arityViolationCount: number;
  removedRouteCount: number;
}

/** Deterministic verdict. Any new structural fact is a breaking change. */
export function summarizeVerdict(input: LoopVerdictInput): LoopVerdict {
  const driftDelta =
    input.newColumnDriftCount ?? Math.max(0, input.after.columnDrift - input.before.columnDrift);
  const newCycleCount = input.newCycles.length;
  const newUnresolvedCount = input.newUnresolved.length;
  const removedExportCount = input.removedExports.length;
  const arityViolationCount = input.arityViolations?.length ?? 0;
  const removedRouteCount = input.removedRoutes?.length ?? 0;
  const breaking =
    newCycleCount > 0 ||
    newUnresolvedCount > 0 ||
    driftDelta > 0 ||
    removedExportCount > 0 ||
    input.brokenCallers.length > 0 ||
    (input.missingSymbolUsageFiles?.length ?? 0) > 0 ||
    arityViolationCount > 0 ||
    removedRouteCount > 0;

  const whatBroke: string[] = [];
  if (newCycleCount)
    whatBroke.push(
      `${newCycleCount} new runtime cycle${newCycleCount === 1 ? "" : "s"}: ${input.newCycles
        .map((cycle) => cycle.join(" → "))
        .join(" · ")}`,
    );
  if (newUnresolvedCount)
    whatBroke.push(
      `${newUnresolvedCount} new unresolved import${newUnresolvedCount === 1 ? "" : "s"}: ${input.newUnresolved
        .map((item) => `${item.path}:${item.line} → ${item.specifier}`)
        .join(" · ")}`,
    );
  if (driftDelta)
    whatBroke.push(`${driftDelta} new SQL column contract violation(s) against the DDL`);
  if (removedExportCount)
    whatBroke.push(
      `${removedExportCount} public export${removedExportCount === 1 ? "" : "s"} removed from the analyzed file`,
    );
  if (input.brokenCallers.length)
    whatBroke.push(
      `${input.brokenCallers.length} observed downstream usage${input.brokenCallers.length === 1 ? "" : "s"} may no longer match the contract`,
    );
  if (arityViolationCount)
    whatBroke.push(
      `${arityViolationCount} call${arityViolationCount === 1 ? "" : "s"} outside a declared arity envelope: ${input
        .arityViolations!.map((item) => `${item.symbolName} at ${item.path}:${item.line}`)
        .join(" · ")}`,
    );
  if (removedRouteCount)
    whatBroke.push(
      `${removedRouteCount} route or service dependenc${removedRouteCount === 1 ? "y" : "ies"} removed while ${input.removedRoutes!.reduce(
        (total, item) => total + item.callers.length,
        0,
      )} import${input.removedRoutes!.reduce((total, item) => total + item.callers.length, 0) === 1 ? "" : "s"} still reference it`,
    );

  if (input.missingSymbolUsageFiles?.length)
    whatBroke.push(
      `Symbol usage evidence is missing for ${input.missingSymbolUsageFiles.length} importer(s); re-analyze the repository before relying on these checks.`,
    );

  return {
    verdict: breaking ? "breaking" : "safe",
    headline: breaking
      ? "Issues or missing evidence detected. Do not ship without review."
      : "NO ISSUES FOUND IN ANALYZED CHECKS",
    whatBroke,
    why: breaking
      ? "The in-memory overlay found structural facts that the current graph does not satisfy. Every item below is a real path and line from this repository, not a guess."
      : "The overlay found no new issues in its supported checks. This is not a full typecheck, test run, or guarantee of deployment safety.",
    newCycleCount,
    newUnresolvedCount,
    driftDelta,
    removedExportCount,
    callerCount: input.brokenCallers.length,
    arityViolationCount,
    removedRouteCount,
  };
}

/**
 * Extracts the proposed file from a grounded AI answer. Only a fenced code block
 * or the explicit BEGIN_FILE markers are accepted; prose is never applied to the
 * buffer, so an explanation can never overwrite real source.
 */
export function extractGeneratedCode(answer: string): string | null {
  const marked = /BEGIN_FILE\s*\n([\s\S]*?)\nEND_FILE/.exec(answer);
  if (marked?.[1]?.trim()) return marked[1].trim();
  const fenced = /```(?:[a-zA-Z0-9+#._-]+)?\s*\n([\s\S]*?)```/.exec(answer);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  return null;
}

/** The exact test command that covers a change. */
export function coveringTestCommand(tests: string[]): string {
  const unique = [...new Set(tests)].filter(Boolean);
  if (!unique.length) return "bun test ./tests";
  return `bun test ${unique.join(" ")}`;
}

export interface LoopSymbolRow {
  name: string;
  kind: string;
  line: number;
  signature: string;
  minArity: number | null;
  maxArity: number | null;
}

export interface LoopContractRow {
  id: string;
  name: string;
  kind: string;
  line: number;
  columns: string[];
  drift: { column: string; message: string; references: { path: string; line: number }[] }[];
}

export interface LoopMemoryLayer {
  id: string;
  label: string;
  count: number;
  detail: string;
}

export interface LoopHeal {
  available: boolean;
  verified: boolean;
  patch: string;
  reason: string;
  healedContent: string | null;
  unresolvedBefore: number;
  unresolvedAfter: number;
  cyclesBefore: number;
  cyclesAfter: number;
  strategies: string[];
}

/** One structured WHAT / WHY / ARCHITECTURAL REASON diagnostic card. */
export interface LoopFinding {
  id: string;
  kind:
    | "removed_export"
    | "arity_break"
    | "property_break"
    | "cycle"
    | "unresolved_import"
    | "column_drift"
    | "removed_route";
  whatBroke: string;
  why: string;
  architecturalReason: string;
  causalChain: {
    fromPath: string;
    toPath: string;
    importLine: number;
    importedSymbols: string[];
  }[];
  target: { path: string; line: number };
}

export interface LoopRun {
  repository: string;
  path: string;
  ref: string;
  source: "workspace" | "github" | "client";
  suggestedPaths: string[];
  stage1: {
    file: { role: string; loc: number; exports: string[] };
    symbols: LoopSymbolRow[];
    directImporters: LoopCaller[];
    transitive: {
      runtime: number;
      typeOnly: number;
      entrypoints: { path: string; role: string; chain: string[] }[];
      tests: string[];
      areas: { area: string; files: number }[];
    };
    cycles: string[][];
    contracts: LoopContractRow[];
    memory: LoopMemoryLayer[];
    finops: LoopFinOps;
  };
  stage2: {
    scenario: LoopScenarioId;
    summary: string;
    changedLine: number | null;
    content: string;
  };
  stage3: {
    durationMs: number;
    before: LoopGateCounts;
    after: LoopGateCounts;
    newCycles: string[][];
    newUnresolved: { path: string; line: number; specifier: string }[];
    columnDrift: {
      table: string;
      column: string;
      message: string;
      references: { path: string; line: number }[];
    }[];
    removedExports: string[];
    brokenCallers: LoopCaller[];
    arityViolations: {
      path: string;
      line: number;
      symbolName: string;
      passedArgs: number;
      expectedArity: string;
    }[];
    removedRoutes: { path: string; role: string; callers: { path: string; line: number }[] }[];
    findings: LoopFinding[];
    blastDelta: number;
  };
  stage4: LoopVerdict & {
    coveringTests: string[];
    command: string;
    heal: LoopHeal | null;
    safeChecks: string[];
  };
}

/** One-line latency label used by Stage 3. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "n/a";
  if (ms < 1) return "<1ms";
  return `${Math.round(ms)}ms`;
}
