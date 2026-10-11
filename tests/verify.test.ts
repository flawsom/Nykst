import { describe, expect, test } from "bun:test";
import {
  verifyChange,
  type ProposedEdit,
  type VerifyReport,
} from "../src/lib/analysis/verify.server";
import { analyzeFixture } from "./helpers";

const repo = {
  "package.json": JSON.stringify({ name: "shop", dependencies: { react: "1" } }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["src/*"] } } }),
  "src/lib/money.ts": `export function format(amount: number, currency: string) { return currency + amount; }
export function round(value: number, digits?: number) { return value; }
export const TAX = 0.2;
export default function legacy() {}`,
  "src/lib/index.ts": `export * from "./money";
export { clamp } from "./math";`,
  "src/lib/math.ts": `export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));`,
  "src/cart.ts": `import { format, TAX } from "@/lib/money";
import { clamp } from "@/lib/index";
export const total = (x: number) => format(x * (1 + TAX), "USD") + clamp(x, 0, 1);`,
  "src/checkout.ts": `import { format, round } from "./lib/money";
import * as money from "./lib/money";
export const pay = () => format(round(5), "EUR") + money.format(1, "GBP");`,
  "src/pages/home.tsx": `import { total } from "../cart";
export default function Home() { return total(1); }`,
  "src/cart.test.ts": `import { total } from "./cart"; export const t = total(1);`,
};

async function check(
  edits: ProposedEdit[],
  files: Record<string, string> = repo,
): Promise<VerifyReport> {
  return verifyChange(await analyzeFixture(files), edits);
}
const errors = (report: VerifyReport) => report.issues.filter((i) => i.severity === "error");
const find = (report: VerifyReport, check: string) =>
  report.issues.filter((i) => i.check === check);

describe("verifyChange: correct changes", () => {
  test("a harmless refactor is clear, and shows impact and the tests to run", async () => {
    const report = await check([
      {
        path: "src/lib/money.ts",
        content: repo["src/lib/money.ts"].replace("currency + amount", "`${currency} ${amount}`"),
      },
    ]);
    expect(report.verdict).toBe("clear");
    expect(report.impact.dependents).toBeGreaterThanOrEqual(3);
    expect(report.impact.tests).toEqual(["src/cart.test.ts"]);
    expect(report.impact.entrypoints).toEqual(["src/pages/home.tsx"]); // the page reaches money through cart
  });

  test("making a parameter optional, or adding an optional one, is fine", async () => {
    const report = await check([
      {
        path: "src/lib/money.ts",
        content: repo["src/lib/money.ts"].replace(
          "format(amount: number, currency: string)",
          "format(amount: number, currency: string, locale?: string)",
        ),
      },
    ]);
    expect(report.verdict).toBe("clear");
    expect(find(report, "signature").map((i) => i.severity)).toEqual(["info"]);
  });

  test("a new file that imports existing modules correctly is clear", async () => {
    const report = await check([
      {
        path: "src/receipt.ts",
        content: `import { format } from "@/lib/money";\nimport { clamp } from "@/lib/index";\nexport const r = format(clamp(1, 0, 2), "USD");\n`,
      },
    ]);
    expect(report.verdict).toBe("clear");
    expect(report.files[0]).toMatchObject({ path: "src/receipt.ts", status: "new" });
  });
});

describe("verifyChange: things that break", () => {
  test("syntax errors are reported with the line", async () => {
    const report = await check([
      { path: "src/cart.ts", content: `export const a = 1;\nexport function ( {\n` },
    ]);
    expect(report.verdict).toBe("blocked");
    expect(find(report, "syntax")[0]).toMatchObject({
      severity: "error",
      path: "src/cart.ts",
      line: 2,
    });
  });

  test("an import of a file that does not exist is an error with a suggestion", async () => {
    const report = await check([
      {
        path: "src/receipt.ts",
        content: `import { format } from "./lib/mony";\nexport const r = format;\n`,
      },
    ]);
    expect(find(report, "unresolved-import")[0]).toMatchObject({ severity: "error", line: 1 });
    const suggest = await check([
      {
        path: "src/receipt.ts",
        content: `import { x } from "./helpers/money";\nexport const r = x;\n`,
      },
    ]);
    expect(find(suggest, "unresolved-import")[0]!.detail).toContain("src/lib/money.ts");
  });

  test("importing a name that the module does not export", async () => {
    const report = await check([
      {
        path: "src/receipt.ts",
        content: `import { formatMoney, TAX } from "@/lib/money";\nexport const r = [formatMoney, TAX];\n`,
      },
    ]);
    const issue = find(report, "missing-export")[0]!;
    expect(issue.message).toContain("`formatMoney`");
    expect(issue.message).not.toContain("TAX");
    expect(issue.detail).toContain("format");
  });

  test("a named import through a re-export file is checked against the real exports", async () => {
    const ok = await check([
      {
        path: "src/receipt.ts",
        content: `import { clamp, format } from "@/lib/index";\nexport const r = [clamp, format];\n`,
      },
    ]);
    expect(find(ok, "missing-export")).toEqual([]);
    const bad = await check([
      {
        path: "src/receipt.ts",
        content: `import { nope } from "@/lib/index";\nexport const r = nope;\n`,
      },
    ]);
    expect(find(bad, "missing-export").length).toBe(1);
  });

  test("renaming an exported function breaks every file that imports it, with lines", async () => {
    const report = await check([
      {
        path: "src/lib/money.ts",
        content: repo["src/lib/money.ts"].replace(
          "export function format(",
          "export function formatMoney(",
        ),
      },
    ]);
    expect(report.verdict).toBe("blocked");
    const broken = find(report, "removed-export").filter((i) => i.severity === "error");
    expect(broken.map((i) => [i.path, i.line])).toEqual([
      ["src/cart.ts", 1],
      ["src/checkout.ts", 1],
    ]);
    expect(broken[0]!.message).toContain("`format`");
  });

  test("the break is found through a barrel file that re-exports everything", async () => {
    const files = {
      ...repo,
      "src/consumer.ts": `import { format } from "@/lib/index";\nexport const c = format(1, "USD");\n`,
    };
    const report = await check(
      [
        {
          path: "src/lib/money.ts",
          content: repo["src/lib/money.ts"].replace(
            "export function format(",
            "export function fmt(",
          ),
        },
      ],
      files,
    );
    expect(find(report, "removed-export").some((i) => i.path === "src/consumer.ts")).toBe(true);
  });

  test("removing the default export breaks default imports", async () => {
    const files = {
      ...repo,
      "src/uses-default.ts": `import legacy from "./lib/money";\nexport const l = legacy;\n`,
    };
    const report = await check(
      [
        {
          path: "src/lib/money.ts",
          content: repo["src/lib/money.ts"].replace("export default function legacy() {}", ""),
        },
      ],
      files,
    );
    expect(
      find(report, "removed-export").some(
        (i) => i.path === "src/uses-default.ts" && i.message.includes("`default`"),
      ),
    ).toBe(true);
  });

  test("a namespace import of a module that loses exports is a warning, not an error", async () => {
    const report = await check([
      {
        path: "src/lib/money.ts",
        content: repo["src/lib/money.ts"].replace("export const TAX = 0.2;", ""),
      },
    ]);
    const ns = find(report, "removed-export").find(
      (i) => i.path === "src/checkout.ts" && i.severity === "warning",
    );
    expect(ns).toBeDefined();
  });

  test("adding a required parameter breaks the callers that pass fewer arguments", async () => {
    const report = await check([
      {
        path: "src/lib/money.ts",
        content: repo["src/lib/money.ts"].replace(
          "round(value: number, digits?: number)",
          "round(value: number, digits: number)",
        ),
      },
    ]);
    const broken = find(report, "signature").filter((i) => i.severity === "error");
    expect(broken.map((i) => [i.path, i.line])).toEqual([["src/checkout.ts", 3]]);
    expect(broken[0]!.message).toBe(
      "Calls round() with 1 argument, but the change makes it require 2.",
    );
    expect(report.verdict).toBe("blocked");
  });

  test("a call that passes too many arguments to a tightened function is a warning", async () => {
    const files = {
      ...repo,
      "src/extra.ts": `import { round } from "./lib/money";\nexport const e = round(1, 2);\n`,
    };
    const report = await check(
      [
        {
          path: "src/lib/money.ts",
          content: repo["src/lib/money.ts"].replace(
            "round(value: number, digits?: number)",
            "round(value: number)",
          ),
        },
      ],
      files,
    );
    expect(
      find(report, "signature").some((i) => i.path === "src/extra.ts" && i.severity === "warning"),
    ).toBe(true);
  });

  test("calls inside the edited file are checked against other functions' signatures", async () => {
    const report = await check([
      {
        path: "src/cart.ts",
        content: `import { format } from "@/lib/money";\nexport const total = () => format(5);\n`,
      },
    ]);
    expect(find(report, "signature")[0]).toMatchObject({
      severity: "error",
      path: "src/cart.ts",
      line: 2,
    });
  });

  test("spread arguments are not guessed at", async () => {
    const report = await check([
      {
        path: "src/cart.ts",
        content: `import { format } from "@/lib/money";\nconst args: [number, string] = [1, "a"];\nexport const total = (x: number) => format(...args) + x;\n`,
      },
    ]);
    expect(find(report, "signature")).toEqual([]);
  });

  test("deleting a file that others import is blocked", async () => {
    const report = await check([{ path: "src/lib/math.ts", content: null }]);
    expect(report.verdict).toBe("blocked");
    expect(find(report, "deleted-file").map((i) => i.path)).toContain("src/lib/index.ts");
    expect(report.files[0]!.status).toBe("deleted");
  });

  test("a new circular import is flagged on the edited file", async () => {
    const report = await check([
      {
        path: "src/lib/math.ts",
        content: `import { total } from "../cart";\nexport const clamp = (v: number, lo: number, hi: number) => total(v) && Math.min(hi, Math.max(lo, v));\n`,
      },
    ]);
    const cycle = find(report, "cycle")[0]!;
    expect(cycle.severity).toBe("warning");
    expect(cycle.message).toContain("math.ts");
    expect(cycle.path).toBe("src/lib/math.ts");
  });

  test("an existing cycle is not blamed on the change", async () => {
    const files = {
      ...repo,
      "src/a.ts": `import { b } from "./b";\nexport const a = b;\n`,
      "src/b.ts": `import { a } from "./a";\nexport const b = a;\n`,
    };
    const report = await check(
      [{ path: "src/cart.ts", content: repo["src/cart.ts"] + "\n// touched\n" }],
      files,
    );
    expect(find(report, "cycle")).toEqual([]);
  });

  test("a new package that is not in package.json is a warning; a declared one is not", async () => {
    const bad = await check([
      { path: "src/receipt.ts", content: `import _ from "lodash";\nexport const r = _;\n` },
    ]);
    expect(find(bad, "undeclared-package")[0]).toMatchObject({ severity: "warning", line: 1 });
    const fine = await check([
      { path: "src/receipt.ts", content: `import React from "react";\nexport const r = React;\n` },
    ]);
    expect(find(fine, "undeclared-package")).toEqual([]);
  });

  test("a new secret read at module scope is flagged; reading it inside a function is not", async () => {
    const bad = await check([
      {
        path: "src/receipt.ts",
        content: `const key = process.env.STRIPE_SECRET_KEY;\nexport const r = key;\n`,
      },
    ]);
    expect(find(bad, "module-scope-secret")[0]).toMatchObject({ severity: "warning", line: 1 });
    const fine = await check([
      {
        path: "src/receipt.ts",
        content: `export const r = () => process.env.STRIPE_SECRET_KEY;\n`,
      },
    ]);
    expect(find(fine, "module-scope-secret")).toEqual([]);
  });

  test("a new external service is reported as information", async () => {
    const report = await check([
      { path: "src/pay.ts", content: `import Stripe from "stripe";\nexport const s = Stripe;\n` },
    ]);
    expect(find(report, "service")[0]!.message).toContain("Stripe");
    expect(find(report, "service")[0]!.severity).toBe("info");
  });

  test("warns when no test reaches the changed code", async () => {
    const report = await check([
      { path: "src/pages/home.tsx", content: repo["src/pages/home.tsx"] + "\n// edit\n" },
    ]);
    // home.tsx is imported by nothing, so no test imports it
    expect(find(report, "tests")[0]!.severity).toBe("warning");
  });

  test("files outside the selected scope are pointed out", async () => {
    const report = await verifyChange(
      await analyzeFixture(repo),
      [
        { path: "src/cart.ts", content: repo["src/cart.ts"] },
        { path: "src/checkout.ts", content: repo["src/checkout.ts"] },
      ],
      { scope: ["src/cart.ts"] },
    );
    expect(find(report, "scope").map((i) => i.path)).toEqual(["src/checkout.ts"]);
  });

  test("invalid paths and invalid JSON are errors", async () => {
    const report = await check([
      { path: "../etc/passwd", content: "x" },
      { path: "package.json", content: "{ nope" },
    ]);
    expect(find(report, "path").length).toBe(1);
    expect(find(report, "syntax").some((i) => i.path === "package.json")).toBe(true);
  });
});

describe("verifyChange: reports", () => {
  test("states what was and was not checked, and what it was checked against", async () => {
    const report = await check([{ path: "src/cart.ts", content: repo["src/cart.ts"] }]);
    expect(report.notChecked.join(" ")).toMatch(/type checker/);
    expect(report.checked.length).toBeGreaterThan(5);
    expect(report.basis.commit).toBe("fixture");
  });
});
