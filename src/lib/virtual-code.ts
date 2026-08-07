import { childrenOf, type GraphNode } from "@/lib/graph-data";

export interface CodeFinding {
  id: string;
  severity: "error" | "warning";
  line: number;
  title: string;
  why: string;
  fix: string;
  apply: (code: string) => string;
}

export interface VirtualRun {
  findings: CodeFinding[];
  fits: boolean;
  context: {
    scope: string;
    allowedModules: string[];
    knownFiles: string[];
    owners: string[];
    blast: string;
  };
}

export interface ExecStep {
  label: string;
  status: "ok" | "fail" | "warn" | "pending";
  detail?: string;
}

export interface ExecResult {
  steps: ExecStep[];
  passed: boolean;
  durationMs: number;
  output: string[];
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

/* ------------------------- prompt → code generation ------------------------- */

const INTENT_RULES: { match: RegExp; build: (node: GraphNode, prompt: string) => string }[] = [
  {
    match: /retry|backoff|resilien|robust/i,
    build: (node) => `export async function call${pascal(node.label)}(input: unknown): Promise<unknown> {
  const maxAttempts = 5;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch("/${slug(node.label)}", { method: "POST", body: JSON.stringify(input) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 200));
    }
  }
  throw lastError;
}`,
  },
  {
    match: /cache|memo|store|fast|quick/i,
    build: (node) => `const cache = new Map<string, unknown>();

export function getCached(key: string, compute: () => unknown): unknown {
  if (cache.has(key)) return cache.get(key);
  const value = compute();
  cache.set(key, value);
  return value;
}

export function invalidate(key: string): void {
  cache.delete(key);
}`,
  },
  {
    match: /auth|token|permission|rbac|role/i,
    build: (node) => `export interface Principal { id: string; roles: string[]; org: string }

export function canAccess(principal: Principal, action: string): boolean {
  const allowed = ["read", "write", "admin"];
  if (!allowed.includes(action)) return false;
  return principal.roles.some((r) => r === "admin" || r === action);
}`,
  },
  {
    match: /webhook|event|emit|dispatch|publish/i,
    build: (node) => `export interface WebhookEvent { type: string; payload: unknown; ts: number }

export async function emit(event: WebhookEvent): Promise<void> {
  try {
    await fetch("/${slug(node.label)}/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.error("webhook emit failed", err);
    throw err;
  }
}`,
  },
  {
    match: /valid|schema|parse|check|zod/i,
    build: (node) => `export function validate(input: unknown): { ok: true; data: unknown } | { ok: false; errors: string[] } {
  if (input == null || typeof input !== "object") {
    return { ok: false, errors: ["expected an object"] };
  }
  const obj = input as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof obj.id !== "string") errors.push("id must be a string");
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: obj };
}`,
  },
  {
    match: /queue|job|worker|task|schedule/i,
    build: (node) => `export interface Job { id: string; payload: unknown; attempts: number }

export async function processJob(job: Job): Promise<void> {
  if (job.attempts > 3) throw new Error("max retries exceeded");
  try {
    await handlePayload(job.payload);
  } catch (err) {
    job.attempts++;
    throw err;
  }
}

async function handlePayload(_payload: unknown): Promise<void> {}`,
  },
];

function pascal(s: string) {
  return s
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

const FALLBACK = (node: GraphNode, prompt: string) => `// ${prompt}
export function handle${pascal(node.label)}(input: unknown): unknown {
  return input;
}`;

/** Turns a plain-language prompt into a code stub for the given node. */
export function generateCode(prompt: string, node: GraphNode): string {
  const rule = INTENT_RULES.find((r) => r.match.test(prompt));
  return (rule ?? { build: FALLBACK }).build(node, prompt.trim());
}

/* ------------------------- simulated execution ------------------------- */

/** Simulates running the code against the org structure and returns a verdict. */
export function simulateExecution(code: string, node: GraphNode, check: VirtualRun): ExecResult {
  const steps: ExecStep[] = [];
  const output: string[] = [];
  const start = performance.now();

  steps.push({
    label: "Parse TypeScript",
    status: "pending",
    detail: "syntax + type check",
  });
  steps.push({
    label: `Resolve imports against ${node.label}`,
    status: "pending",
    detail: `${check.context.allowedModules.length} allowed modules`,
  });
  steps.push({
    label: "Run unit tests",
    status: "pending",
    detail: "virtual test harness",
  });
  steps.push({
    label: "Check blast radius",
    status: "pending",
    detail: check.context.blast,
  });
  steps.push({
    label: "Fit organization structure",
    status: "pending",
    detail: check.context.scope,
  });

  const errors = check.findings.filter((f) => f.severity === "error");
  const warnings = check.findings.filter((f) => f.severity === "warning");

  // step 0 — parse
  const hasSyntax = /\bexport\b/.test(code) && /[{};:]/.test(code);
  steps[0]!.status = hasSyntax ? "ok" : "fail";
  if (!hasSyntax) {
    steps[0]!.detail = "syntax error — no export or malformed code";
    output.push("✗ Parse failed: code does not look like valid TypeScript");
  } else {
    output.push("✓ Parsed successfully");
  }

  // step 1 — imports
  const importErrors = errors.filter((e) => e.id.startsWith("imp-"));
  steps[1]!.status = importErrors.length ? "fail" : "ok";
  if (importErrors.length) {
    steps[1]!.detail = `${importErrors.length} boundary violation(s)`;
    output.push(`✗ ${importErrors.length} import(s) cross the boundary of ${node.label}`);
  } else {
    output.push("✓ All imports resolve within declared dependencies");
  }

  // step 2 — tests
  const hasAsync = /\basync\b/.test(code);
  const hasTry = /try\s*\{/.test(code);
  if (hasAsync && !hasTry) {
    steps[2]!.status = "warn";
    steps[2]!.detail = "async without try/catch";
    output.push("⚠ Tests pass but async paths are unguarded");
  } else if (errors.length) {
    steps[2]!.status = "fail";
    output.push("✗ Tests fail due to structural errors");
  } else {
    steps[2]!.status = "ok";
    output.push("✓ Virtual tests pass");
  }

  // step 3 — blast radius
  const blastErrors = errors.filter((e) => e.id.startsWith("loop-") || e.id.startsWith("env-"));
  steps[3]!.status = blastErrors.length ? "fail" : warnings.length ? "warn" : "ok";
  if (blastErrors.length) {
    steps[3]!.detail = `${blastErrors.length} blast risk(s)`;
    output.push(`✗ ${blastErrors.length} finding(s) threaten ${node.blast.services} downstream services`);
  } else {
    output.push(`✓ Blast radius contained — ${node.blast.level}`);
  }

  // step 4 — fit
  steps[4]!.status = check.fits ? "ok" : "fail";
  if (check.fits) {
    output.push(`✓ Fits the structure of ${node.label} — safe to inject`);
  } else {
    steps[4]!.detail = `${errors.length} blocking error(s)`;
    output.push(`✗ Does not fit ${node.label} — ${errors.length} structural error(s) block injection`);
  }

  const passed = check.fits && hasSyntax && importErrors.length === 0 && blastErrors.length === 0;

  return {
    steps,
    passed,
    durationMs: Math.round(performance.now() - start + 12 + Math.random() * 80),
    output,
  };
}
