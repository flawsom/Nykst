import type { AnalysisIndex } from "./impact";

/**
 * Shortest connection between two files, in either direction.
 *
 * A dependency graph is directed, but a person asking "how are these two
 * things connected?" usually does not know which side imports the other. This
 * walks both the dependency and dependent edges, then records the direction
 * of every hop so the answer can say "imports" or "is imported by".
 */
export type TraceDirection = "imports" | "imported-by";

export interface TraceStep {
  from: string;
  to: string;
  /** Direction from `from` to `to`. */
  direction: TraceDirection;
  line: number;
  typeOnly: boolean;
}

export interface TraceResult {
  from: string;
  to: string;
  path: string[];
  steps: TraceStep[];
  /** Number of edges, not files. */
  hops: number;
}

type TraceGraph = Pick<AnalysisIndex, "files" | "dependencies" | "dependents">;

interface Hop {
  previous: string;
  direction: TraceDirection;
  line: number;
  typeOnly: boolean;
}

export function tracePath(
  graph: TraceGraph,
  from: string,
  to: string,
  maxHops = 16,
): TraceResult | null {
  if (!graph.files.has(from) || !graph.files.has(to) || maxHops < 0) return null;
  if (from === to) return { from, to, path: [from], steps: [], hops: 0 };

  const queue: Array<{ path: string; depth: number }> = [{ path: from, depth: 0 }];
  const seen = new Set([from]);
  const parent = new Map<string, Hop>();

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (current.depth >= maxHops) continue;

    const outgoing = [...(graph.dependencies.get(current.path) ?? [])].sort(
      (a, b) => a.path.localeCompare(b.path) || a.line - b.line,
    );
    const incoming = [...(graph.dependents.get(current.path) ?? [])].sort(
      (a, b) => a.path.localeCompare(b.path) || a.line - b.line,
    );

    // Keep the two directions in one ordered list so a direct import wins over
    // an equally short reverse hop. The direction is recorded for display.
    const nextHops: Array<{
      next: string;
      direction: TraceDirection;
      line: number;
      typeOnly: boolean;
    }> = [
      ...outgoing.map((edge) => ({
        next: edge.path,
        direction: "imports" as const,
        line: edge.line,
        typeOnly: edge.typeOnly,
      })),
      ...incoming.map((edge) => ({
        next: edge.path,
        direction: "imported-by" as const,
        line: edge.line,
        typeOnly: edge.typeOnly,
      })),
    ];

    for (const hop of nextHops) {
      if (seen.has(hop.next)) continue;
      seen.add(hop.next);
      parent.set(hop.next, {
        previous: current.path,
        direction: hop.direction,
        line: hop.line,
        typeOnly: hop.typeOnly,
      });
      if (hop.next === to) {
        const path = [to];
        let node = to;
        while (node !== from) {
          const step = parent.get(node);
          if (!step) return null;
          node = step.previous;
          path.push(node);
        }
        path.reverse();
        const steps = path.slice(1).map((next, index) => {
          const previous = path[index]!;
          const step = parent.get(next)!;
          return {
            from: previous,
            to: next,
            direction: step.direction,
            line: step.line,
            typeOnly: step.typeOnly,
          };
        });
        return { from, to, path, steps, hops: steps.length };
      }
      queue.push({ path: hop.next, depth: current.depth + 1 });
    }
  }

  return null;
}
