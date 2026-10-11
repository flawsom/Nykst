import { beforeAll, describe, expect, test } from "bun:test";
import { loadParser, parseSource, syntaxProblems } from "../src/lib/analysis/parse.server";

beforeAll(async () => {
  await loadParser();
});

describe("parseSource", () => {
  test("records imported names for every import style", () => {
    const parsed = parseSource(
      "a.ts",
      `import def, { a, b as c } from "./x";
import * as ns from "./y";
import "./side-effect";
import type { T } from "./types";
export * from "./z";
export { q as r } from "./w";
const { m, n: renamed } = require("./cjs");
const lazy = await import("./lazy");`,
    );
    const byTarget = Object.fromEntries(parsed.imports.map((i) => [i.specifier, i]));
    expect(byTarget["./x"]!.bindings).toMatchObject([
      { imported: "default", local: "def" },
      { imported: "a", local: "a" },
      { imported: "b", local: "c" },
    ]);
    expect(byTarget["./y"]!.bindings).toEqual([{ imported: "*", local: "ns" }]);
    expect(byTarget["./side-effect"]!.bindings).toEqual([]);
    expect(byTarget["./types"]!.typeOnly).toBe(true);
    expect(byTarget["./z"]!.reexportAll).toBe(true);
    expect(byTarget["./w"]!.bindings).toMatchObject([{ imported: "q", local: "r" }]);
    expect(byTarget["./cjs"]!.bindings.map((b) => b.imported)).toEqual(["m", "n"]);
    expect(byTarget["./lazy"]!.dynamic).toBe(true);
  });

  test("records export signatures with required and maximum parameters", () => {
    const parsed = parseSource(
      "a.ts",
      `export function two(a: string, b: number) {}
export function optional(a: string, b?: number, c = 3) {}
export const arrow = (x: number, ...rest: number[]) => x;
export default function (a: string) {}
export class K {}
export const value = 1;
export interface I {}
export enum E { A }`,
    );
    expect(parsed.exportSigs["two"]).toEqual({ kind: "function", required: 2, max: 2 });
    expect(parsed.exportSigs["optional"]).toEqual({ kind: "function", required: 1, max: 3 });
    // a required parameter after an optional one makes the earlier one required as well
    const late = parseSource("b.ts", "export function late(a?: string, b: number) {}");
    expect(late.exportSigs["late"]).toEqual({ kind: "function", required: 2, max: 2 });
    expect(parsed.exportSigs["arrow"]).toEqual({ kind: "function", required: 1, max: null });
    expect(parsed.exportSigs["default"]).toEqual({ kind: "function", required: 1, max: 1 });
    expect(parsed.exportSigs["K"]!.kind).toBe("class");
    expect(parsed.exportSigs["value"]!.kind).toBe("variable");
    expect(parsed.exportSigs["I"]!.kind).toBe("type");
    expect(parsed.exportSigs["E"]!.kind).toBe("enum");
  });

  test("tells module-scope environment reads from reads inside functions", () => {
    const parsed = parseSource(
      "a.ts",
      `const top = process.env.TOP_LEVEL;
export function inside() { return process.env.INSIDE; }
export const arrow = () => process.env["ARROW"];
class C { prop = process.env.PER_INSTANCE; static shared = process.env.STATIC_INIT; method() { return process.env.METHOD; } }
if (process.env.IN_IF) {}`,
    );
    const scope = Object.fromEntries(parsed.envVars.map((e) => [e.name, e.moduleScope]));
    expect(scope).toEqual({
      TOP_LEVEL: true,
      INSIDE: false,
      ARROW: false,
      PER_INSTANCE: false,
      STATIC_INIT: true,
      METHOD: false,
      IN_IF: true,
    });
  });

  test("records calls on imported names and on namespace members with argument counts", () => {
    const parsed = parseSource(
      "a.ts",
      `import { run } from "./x";
import * as lib from "./y";
run(1, 2);
lib.go();
run(...args);
other();`,
    );
    expect(parsed.calls.filter((c) => c.local === "run").map((c) => [c.args, c.spread])).toEqual([
      [2, false],
      [1, true],
    ]);
    expect(parsed.calls.find((c) => c.local === "lib")).toMatchObject({ member: "go", args: 0 });
  });
});

describe("syntaxProblems", () => {
  test("accepts valid TypeScript and JSX", () => {
    expect(syntaxProblems("ok.ts", "export const a: number = 1;")).toEqual([]);
    expect(syntaxProblems("ok.tsx", "export const A = () => <div className='x'>hi</div>;")).toEqual(
      [],
    );
  });

  test("reports real syntax errors with a line number", () => {
    const problems = syntaxProblems("bad.ts", "export const a = 1;\nexport function ( {\n");
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]!.line).toBe(2);
  });
});
