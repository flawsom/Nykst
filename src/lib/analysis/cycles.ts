/**
 * Strongly connected components with more than one member, i.e. import cycles, using an
 * iterative Tarjan so deep import chains cannot overflow the stack.
 */
export function findCycles(adjacency: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  let counter = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const strongConnect = (start: string) => {
    const work: { node: string; next: number }[] = [{ node: start, next: 0 }];
    indices.set(start, counter);
    low.set(start, counter);
    counter += 1;
    stack.push(start);
    onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1]!;
      const neighbours = adjacency.get(frame.node) ?? [];
      if (frame.next < neighbours.length) {
        const next = neighbours[frame.next++]!;
        if (!adjacency.has(next)) continue;
        if (!indices.has(next)) {
          indices.set(next, counter);
          low.set(next, counter);
          counter += 1;
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, next: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, indices.get(next)!));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      if (low.get(frame.node) === indices.get(frame.node)) {
        const component: string[] = [];
        let member: string | undefined;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.node);
        if (component.length > 1) cycles.push(component.sort());
      }
    }
  };

  for (const node of adjacency.keys()) if (!indices.has(node)) strongConnect(node);
  return cycles;
}

/** The shortest chain start -> ... -> start through the members of a cycle. */
export function cyclePath(
  adjacency: Map<string, string[]>,
  members: string[],
  start: string,
): string[] {
  const inside = new Set(members);
  const parent = new Map<string, string>();
  const discovered = new Set<string>();
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    for (const next of adjacency.get(current) ?? []) {
      if (!inside.has(next)) continue;
      if (next === start) {
        const chain = [current];
        let cursor = current;
        while (parent.has(cursor)) {
          cursor = parent.get(cursor)!;
          chain.push(cursor);
        }
        return [...chain.reverse(), start];
      }
      if (!discovered.has(next)) {
        discovered.add(next);
        parent.set(next, current);
        queue.push(next);
      }
    }
  }
  return [start, start];
}
