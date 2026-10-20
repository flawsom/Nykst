import { describe, expect, test } from "bun:test";
import { analyzeRepository } from "../src/lib/analysis/engine.server";

/**
 * Real repositories do not all export a root tsconfig with `baseUrl`. A nested
 * `jsconfig.json` that only declares `paths`, and a barrel `index.ts`, must
 * still produce real internal edges instead of unresolved imports.
 */

const SOURCES: Record<string, string> = {
  // Nested config without baseUrl, the common monorepo case.
  "packages/app/jsconfig.json": JSON.stringify({
    compilerOptions: {
      paths: {
        "@/*": ["./src/*"],
        "~/*": ["./src/*"],
      },
    },
  }),
  "packages/app/src/index.ts": [
    'import { core } from "@/lib/core";',
    'import { other } from "~/lib/other";',
    'import { barrel } from "./lib";',
    "export const entry = [core, other, barrel];",
  ].join("\n"),
  "packages/app/src/lib/core.ts": "export const core = 1;\n",
  "packages/app/src/lib/other.ts": "export const other = 2;\n",
  // Barrel re-export: importers of ./lib must resolve to this file.
  "packages/app/src/lib/index.ts":
    'export * from "./core";\nexport { other as barrel } from "./other";\n',
  // Outside the nested config, the alias must not resolve.
  "app-entry.ts": 'import { core } from "@/lib/core";\nexport const value = core;\n',
};

const analysis = await analyzeRepository({
  ref: "abcdef1234567",
  paths: Object.keys(SOURCES),
  contents: new Map(Object.entries(SOURCES)),
});

function file(path: string) {
  const found = analysis.files.find((item) => item.path === path);
  if (!found) throw new Error(`${path} was not analyzed`);
  return found;
}

describe("path aliases and barrels", () => {
  test("resolves @/* and ~/* from a nested config that omits baseUrl", () => {
    const entry = file("packages/app/src/index.ts");
    const aliases = entry.imports.filter(
      (ref) => ref.specifier.startsWith("@/") || ref.specifier.startsWith("~/"),
    );
    expect(aliases.map((ref) => ref.target)).toEqual([
      "packages/app/src/lib/core.ts",
      "packages/app/src/lib/other.ts",
    ]);
    expect(aliases.every((ref) => ref.kind === "internal")).toBe(true);
  });

  test("resolves a barrel index.ts for importers of the directory", () => {
    const entry = file("packages/app/src/index.ts");
    const barrel = entry.imports.find((ref) => ref.specifier === "./lib");
    expect(barrel?.target).toBe("packages/app/src/lib/index.ts");
    expect(barrel?.kind).toBe("internal");
  });

  test("keeps the nested alias scoped to its own package", () => {
    const rootImport = file("app-entry.ts").imports[0]!;
    expect(rootImport.kind).toBe("unresolved");
    expect(rootImport.target).toBeUndefined();
  });

  test("counts the barrel edges in the dependency graph", () => {
    expect(analysis.stats.internalEdges).toBeGreaterThanOrEqual(4);
    expect(analysis.stats.unresolvedImports).toBe(1);
  });
});
