import { childrenOf, type GraphNode } from "@/lib/graph-data";

export interface CodeFinding {
  id: string;
  severity: "error" | "warning";
  line: number;
  title: string;
  why: string;
  /** what the virtual fix would do */
  fix: string;
  /** applied by the "virtual fix" action */
  apply: (code: string) => string;
}

export interface VirtualRun {
  findings: CodeFinding[];
  fits: boolean;
  /** structural context the check was run against */
  context: {
    scope: string;
    allowedModules: string[];
    knownFiles: string[];
    owners: string[];
    blast: string;
  };
}

function subtreeFiles(node: GraphNode, limit = 12): string[] {
  const out: string[] = [];
  const walk = (n: GraphNode, depth: number) => {
    if (out.length >= limit || depth > 2) return;
    for (const c of childrenOf(n)) {
      if (out.length >= limit) return;
      if (!c.expandable) out.push(c.detail?.path ?? c.label);
      else walk(c, depth + 1);
    }
  };
  if (!node.expandable) out.push(node.detail?.path ?? node.label);
  else walk(node, 0);
  return out;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Runs typed code against the organization's structure, without touching a real
 * repository. Nothing is injected until every structural check passes.
 */
export function runVirtualCheck(code: string, node: GraphNode): VirtualRun {
  const kids = childrenOf(node);
  const allowedModules = [
    ...node.dependencies,
    ...kids.map((k) => k.label),
    node.label,
  ].map(slug);
  const knownFiles = subtreeFiles(node);
  const lines = code.split("\n");
  const findings: CodeFinding[] = [];

  const add = (f: CodeFinding) => findings.push(f);

  lines.forEach((raw, i) => {
    const line = i + 1;
    const text = raw.trim();

    const imp = text.match(/^import\s+.*?from\s+["']([^"']+)["'];?$/);
    if (imp) {
      const spec = imp[1]!;
      const local = spec.startsWith(".") || spec.startsWith("@/");
      const target = slug(spec.replace(/^[@./]+/, "").split("/")[0] ?? "");
      if (local && target && !allowedModules.some((m) => m.includes(target) || target.includes(m))) {
        add({
          id: `imp-${line}`,
          severity: "error",
          line,
          title: `Import crosses the boundary of ${node.label}`,
          why: `"${spec}" is not an owned child of ${node.label} nor a declared dependency (${node.dependencies.join(", ") || "none"}). Injecting this would create an undeclared edge in the graph.`,
          fix: `Route the call through a declared dependency instead of importing across the boundary.`,
          apply: (c) =>
            c
              .split("\n")
              .map((l, idx) =>
                idx === i
                  ? `// virtual fix: use declared dependency "${node.dependencies[0] ?? node.label}"\n${l.replace(spec, node.dependencies[0] ? `@/${slug(node.dependencies[0])}` : spec)}`
                  : l,
              )
              .join("\n"),
        });
      }
    }

    if (/^(const|let|var)\s+\w+\s*=\s*process\.env/.test(text)) {
      add({
        id: `env-${line}`,
        severity: "error",
        line,
        title: "Secret read at module scope",
        why: "Module-scope environment reads execute at import time and leak into every bundle that touches this module.",
        fix: "Move the read inside the function that needs it.",
        apply: (c) =>
          c
            .split("\n")
            .map((l, idx) => (idx === i ? `  // virtual fix: read inside the handler\n  ${text}` : l))
            .join("\n"),
      });
    }

    if (/while\s*\(\s*true\s*\)/.test(text) || /for\s*\(\s*;;\s*\)/.test(text)) {
      add({
        id: `loop-${line}`,
        severity: "error",
        line,
        title: "Unbounded retry loop",
        why: `${node.label} fans out to ${node.blast.services} services — an unbounded loop here becomes a retry storm.`,
        fix: "Bound the loop with an attempt counter and backoff.",
        apply: (c) =>
          c
            .split("\n")
            .map((l, idx) =>
              idx === i
                ? l.replace(/while\s*\(\s*true\s*\)|for\s*\(\s*;;\s*\)/, "for (let attempt = 0; attempt < 5; attempt++)")
                : l,
            )
            .join("\n"),
      });
    }

    if (/:\s*any\b/.test(text)) {
      add({
        id: `any-${line}`,
        severity: "warning",
        line,
        title: "Untyped value on a shared contract",
        why: "Consumers downstream of this node rely on the contract shape; `any` hides drift until runtime.",
        fix: "Replace with `unknown` and validate before use.",
        apply: (c) =>
          c
            .split("\n")
            .map((l, idx) => (idx === i ? l.replace(/:\s*any\b/g, ": unknown") : l))
            .join("\n"),
      });
    }

    if (/console\.log\(/.test(text)) {
      add({
        id: `log-${line}`,
        severity: "warning",
        line,
        title: "Raw console logging",
        why: "This area ships telemetry through the shared collector; raw logs bypass sampling and ownership routing.",
        fix: "Use the instrumentation helper instead.",
        apply: (c) =>
          c
            .split("\n")
            .map((l, idx) => (idx === i ? l.replace("console.log(", "logger.info(") : l))
            .join("\n"),
      });
    }
  });

  const hasAsync = /\basync\b/.test(code);
  if (hasAsync && !/try\s*\{/.test(code)) {
    add({
      id: "err-path",
      severity: "warning",
      line: Math.max(1, lines.findIndex((l) => l.includes("async")) + 1),
      title: "Async path with no error handling",
      why: `Failures here surface to ${node.dependents.slice(0, 2).join(", ") || "downstream consumers"} untyped.`,
      fix: "Wrap the await in try/catch and map to a typed error.",
      apply: (c) => `${c}\n\n// virtual fix: map failures to a typed error before they leave ${node.label}`,
    });
  }

  if (code.trim().length > 0 && !/export\b/.test(code)) {
    add({
      id: "no-export",
      severity: "error",
      line: 1,
      title: "Nothing exported — the graph cannot attach this file",
      why: `Every file under ${node.label} attaches to the graph through its exported symbols.`,
      fix: "Export the entry symbol.",
      apply: (c) => c.replace(/^(\s*)(function|const|class)\s/m, "$1export $2 "),
    });
  }

  return {
    findings,
    fits: findings.every((f) => f.severity !== "error") && code.trim().length > 0,
    context: {
      scope: node.label,
      allowedModules: [...node.dependencies, ...kids.slice(0, 4).map((k) => k.label)],
      knownFiles,
      owners: node.owners,
      blast: `${node.blast.level} · ${node.blast.services} services`,
    },
  };
}
