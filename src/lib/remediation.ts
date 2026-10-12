import { useCallback, useEffect, useState } from "react";
import type { GraphNode } from "./graph-data";

export interface IssueLike {
  id: string;
  title: string;
  area: string;
  severity: string;
  owner: string;
}

export interface Remedy {
  /** pattern signature: area + issue title */
  signature: string;
  title: string;
  area: string;
  steps: string[];
  /** node label the fix was first proven on */
  provenOn: string;
  provenKind: string;
  resolvedAt: string;
  appliedCount: number;
  /** dependency chain that had to move with the fix */
  linked: string[];
}

const KEY = "nykst.remedies";
const RESOLVED_KEY = "nykst.resolved";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(value));
  emit();
}

export function signatureOf(issue: IssueLike) {
  return `${issue.area}::${issue.title}`;
}

/** Deterministic remediation plan per issue class. */
const PLAYBOOK: Record<string, string[]> = {
  "Cyclic dependency detected": [
    "Extract the shared contract into a standalone module",
    "Invert the back-edge to depend on the abstraction",
    "Add an import-boundary check to CI",
  ],
  "Missing test coverage on error paths": [
    "Enumerate thrown error codes on the handler",
    "Add failure-path cases to the module spec",
    "Gate merges below the coverage floor",
  ],
  "Deprecated API still referenced": [
    "Map every call site of the deprecated symbol",
    "Migrate call sites to the supported surface",
    "Delete the shim and mark the version removed",
  ],
  "Unbounded retry loop": [
    "Cap attempts and add exponential backoff with jitter",
    "Add a circuit breaker around the downstream client",
    "Emit a saturation metric for the retry budget",
  ],
  "Secrets read at module scope": [
    "Move secret reads inside the request handler",
    "Fail closed when the secret is absent",
    "Rotate the exposed credential",
  ],
  "Hot path allocates per request": [
    "Hoist buffers and reuse the encoder",
    "Batch writes on the hot path",
    "Re-baseline p99 after the change",
  ],
  "Ownership unclear — no CODEOWNERS entry": [
    "Assign the owning team in CODEOWNERS",
    "Wire review routing to that team",
    "Record the owner on the node",
  ],
};

export function stepsFor(issue: IssueLike): string[] {
  return (
    PLAYBOOK[issue.title] ?? [
      "Reproduce against the owning module",
      "Apply the minimal contained change",
      "Verify dependents before rollout",
    ]
  );
}

/** Everything this fix must move with — derived from the node's own graph edges. */
export function linkedTo(node: GraphNode): string[] {
  return [
    ...node.dependencies.map((d) => `Depends on ${d}`),
    ...node.dependents.map((d) => `${d} depends on this`),
    `Blast radius: ${node.blast.services} services · ${node.blast.modules} modules · ${node.blast.teams} teams`,
  ];
}

export function getRemedies(): Record<string, Remedy> {
  return read<Record<string, Remedy>>(KEY, {});
}

export function getResolved(): string[] {
  return read<string[]>(RESOLVED_KEY, []);
}

/** Store the solved issue so an identical pattern is pre-solved next time. */
export function recordResolution(issue: IssueLike, node: GraphNode) {
  const sig = signatureOf(issue);
  const all = getRemedies();
  const prev = all[sig];
  all[sig] = {
    signature: sig,
    title: issue.title,
    area: issue.area,
    steps: stepsFor(issue),
    provenOn: prev?.provenOn ?? node.label,
    provenKind: prev?.provenKind ?? node.kind,
    resolvedAt: new Date().toISOString(),
    appliedCount: (prev?.appliedCount ?? 0) + 1,
    linked: prev?.linked ?? linkedTo(node),
  };
  write(KEY, all);
  const resolved = getResolved();
  if (!resolved.includes(issue.id)) write(RESOLVED_KEY, [...resolved, issue.id]);
}

/** A known fix exists for this pattern, waiting on approval. */
export function knownRemedy(issue: IssueLike): Remedy | null {
  return getRemedies()[signatureOf(issue)] ?? null;
}

export function useRemediation() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  const resolve = useCallback((issue: IssueLike, node: GraphNode) => {
    recordResolution(issue, node);
  }, []);
  return {
    tick,
    resolve,
    remedies: getRemedies(),
    resolvedIds: getResolved(),
  };
}
