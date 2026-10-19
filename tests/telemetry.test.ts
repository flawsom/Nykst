import { describe, expect, test } from "bun:test";
import {
  overlayTelemetry,
  parseOtlpSpans,
  type NormalizedSpan,
} from "../src/lib/analysis/telemetry";
import type { AnalyzedFile, RepoAnalysis } from "../src/lib/analysis/types";

function file(path: string, imports: string[] = []): AnalyzedFile {
  return {
    path,
    language: "ts",
    loc: 10,
    packageDir: "",
    role: "lib",
    imports: imports.map((target, index) => ({
      specifier: `./${target.split("/").pop()}`,
      line: index + 1,
      kind: "internal",
      target,
      typeOnly: false,
      dynamic: false,
    })),
    exports: [],
    functions: [],
    classes: [],
    envVars: [],
    services: [],
    resources: [],
  };
}

function analysis(files: AnalyzedFile[]): RepoAnalysis {
  return {
    version: 2,
    generatedAt: "2026-01-01T00:00:00.000Z",
    method: "typescript-ast",
    ref: "test",
    packages: [],
    files,
    services: [],
    resources: [],
    envVars: [],
    cycles: [],
    stats: {
      treeFiles: files.length,
      sourceFiles: files.length,
      analyzedFiles: files.length,
      internalEdges: files.reduce((sum, item) => sum + item.imports.length, 0),
      externalPackages: 0,
      unresolvedImports: 0,
      skippedFiles: 0,
      loc: files.length * 10,
      durationMs: 1,
    },
    limitations: [],
  };
}

function span(overrides: Partial<NormalizedSpan>): NormalizedSpan {
  return {
    traceId: "trace",
    spanId: "span",
    name: "span",
    startMs: 0,
    durationMs: 1,
    status: "unset",
    ...overrides,
  };
}

describe("parseOtlpSpans", () => {
  test("decodes OTLP attributes, resource service, status and nanosecond duration", () => {
    const spans = parseOtlpSpans({
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "web" } }],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "t1",
                  spanId: "s1",
                  name: "GET /users",
                  startTimeUnixNano: "1700000000000000000",
                  endTimeUnixNano: "1700000000015000000",
                  status: { code: 2 },
                  attributes: [
                    { key: "code.filepath", value: { stringValue: "./src/a.ts" } },
                    { key: "http.route", value: { stringValue: "/users" } },
                    { key: "db.system", value: { stringValue: "postgresql" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(spans).toHaveLength(1);
    expect(spans[0]?.service).toBe("web");
    expect(spans[0]?.durationMs).toBe(15);
    expect(spans[0]?.status).toBe("error");
    expect(spans[0]?.filePath).toBe("./src/a.ts");
    expect(spans[0]?.route).toBe("/users");
    expect(spans[0]?.dbSystem).toBe("postgresql");
  });

  test("accepts a flat span list and skips spans without an id or duration", () => {
    const spans = parseOtlpSpans([
      { spanId: "a", name: "ok", startMs: 0, durationMs: 12 },
      { name: "missing id", durationMs: 3 },
      { spanId: "b", name: "missing duration" },
    ]);
    expect(spans.map((item) => item.spanId)).toEqual(["a"]);
  });
});

describe("overlayTelemetry", () => {
  test("matches exact paths and unique suffixes, never ambiguous ones", () => {
    const repo = analysis([
      file("src/a.ts"),
      file("src/lib/b.ts"),
      file("src/one/index.ts"),
      file("src/two/index.ts"),
    ]);
    const overlay = overlayTelemetry(repo, [
      span({ spanId: "s1", filePath: "./src/a.ts" }),
      span({ spanId: "s2", filePath: "/repo/src/lib/b.ts" }),
      span({ spanId: "s3", filePath: "index.ts" }),
    ]);

    expect(overlay.matchedSpans).toBe(2);
    expect(overlay.files.map((item) => item.path)).toEqual(["src/a.ts", "src/lib/b.ts"]);
    expect(overlay.unmatchedFiles).toEqual([{ filePath: "index.ts", spans: 1 }]);
    expect(overlay.coverage).toBe(0.667);
  });

  test("computes nearest-rank p50 and p95", () => {
    const repo = analysis([file("src/a.ts")]);
    const overlay = overlayTelemetry(
      repo,
      [10, 20, 30, 40, 100].map((durationMs, index) =>
        span({ spanId: `s${index}`, filePath: "src/a.ts", durationMs }),
      ),
    );
    expect(overlay.files[0]?.p50Ms).toBe(30);
    expect(overlay.files[0]?.p95Ms).toBe(100);
    expect(overlay.files[0]?.totalMs).toBe(200);
  });

  test("links parent and child spans, marking static and observed-only edges", () => {
    const repo = analysis([file("src/a.ts", ["src/b.ts"]), file("src/b.ts"), file("src/c.ts")]);
    const overlay = overlayTelemetry(repo, [
      span({ spanId: "p1", filePath: "src/a.ts", durationMs: 20 }),
      span({
        spanId: "c1",
        parentSpanId: "p1",
        filePath: "src/b.ts",
        durationMs: 8,
        status: "error",
      }),
      span({ spanId: "p2", filePath: "src/b.ts", durationMs: 4 }),
      span({ spanId: "c2", parentSpanId: "p2", filePath: "src/c.ts", durationMs: 2 }),
    ]);

    expect(overlay.edges).toEqual([
      {
        from: "src/a.ts",
        to: "src/b.ts",
        calls: 1,
        errors: 1,
        p50Ms: 8,
        p95Ms: 8,
        static: true,
      },
      {
        from: "src/b.ts",
        to: "src/c.ts",
        calls: 1,
        errors: 0,
        p50Ms: 2,
        p95Ms: 2,
        static: false,
      },
    ]);
    const b = overlay.files.find((item) => item.path === "src/b.ts");
    expect(b?.errors).toBe(1);
    expect(b?.observedDependents).toBe(1);
    expect(b?.staticDependents).toBe(1);
  });

  test("returns an explicit empty overlay", () => {
    const overlay = overlayTelemetry(analysis([file("src/a.ts")]), []);
    expect(overlay.spans).toBe(0);
    expect(overlay.matchedSpans).toBe(0);
    expect(overlay.coverage).toBe(0);
    expect(overlay.files).toEqual([]);
    expect(overlay.edges).toEqual([]);
    expect(overlay.limitations.join(" ")).toContain("No spans were supplied");
  });
});
