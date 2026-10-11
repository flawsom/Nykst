import { describe, expect, test } from "bun:test";
import { computeActivity } from "../src/lib/analysis/activity";
import { computeFindings, findingsForPaths } from "../src/lib/analysis/findings";
import { isFixLike, revertedSha } from "../src/lib/analysis/history-utils";
import { analyzeFixture, commit, historyOf } from "./helpers";

const base = {
  "package.json": JSON.stringify({
    name: "app",
    dependencies: { react: "1" },
    devDependencies: {},
  }),
  "src/a.ts": `import { b } from "./b"; export const a = () => b();`,
  "src/b.ts": `import { a } from "./a"; export const b = () => a();`,
  "src/ok.ts": `export const ok = 1;`,
};

describe("computeFindings", () => {
  test("reports a circular import with the chain and the import line", async () => {
    const findings = computeFindings(await analyzeFixture(base));
    const cycle = findings.find((f) => f.kind === "cycle")!;
    expect(cycle.title).toBe("Circular import between 2 files");
    expect(cycle.detail).toMatch(/^(a|b)\.ts → (a|b)\.ts → (a|b)\.ts$/);
    expect(cycle.paths.sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(cycle.evidence.every((e) => typeof e.line === "number")).toBe(true);
  });

  test("ids are stable between analyses", async () => {
    const one = computeFindings(await analyzeFixture(base)).map((f) => f.id);
    const two = computeFindings(await analyzeFixture(base)).map((f) => f.id);
    expect(one).toEqual(two);
  });

  test("an import cycle that goes through a type-only import is not a runtime cycle", async () => {
    const findings = computeFindings(
      await analyzeFixture({
        ...base,
        "src/a.ts": `import type { b } from "./b"; export const a = 1;`,
      }),
    );
    expect(findings.some((f) => f.kind === "cycle")).toBe(false);
  });

  test("reports imports that do not resolve, per file and specifier", async () => {
    const findings = computeFindings(
      await analyzeFixture({
        ...base,
        "src/c.ts": `import { x } from "./missing"; export const c = x;`,
      }),
    );
    const f = findings.find((item) => item.kind === "unresolved-import")!;
    expect(f.severity).toBe("high");
    expect(f.evidence[0]).toMatchObject({ path: "src/c.ts", line: 1 });
  });

  test("flags secrets read at import time, but not inside functions or public variables", async () => {
    const findings = computeFindings(
      await analyzeFixture({
        ...base,
        "src/server.ts": `const key = process.env.STRIPE_SECRET_KEY;
const pub = process.env.NEXT_PUBLIC_API_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
export function ok() { return process.env.OTHER_SECRET; }
export const x = key + pub + publishable;`,
      }),
    );
    const secrets = findings.filter((f) => f.kind === "module-scope-secret");
    expect(secrets.map((f) => f.title)).toEqual([
      "STRIPE_SECRET_KEY is read when the module loads",
    ]);
    expect(secrets[0]!.evidence[0]!.line).toBe(1);
  });

  test("flags packages that are imported but not declared, and accepts declared ones and @types", async () => {
    const findings = computeFindings(
      await analyzeFixture({
        "package.json": JSON.stringify({
          dependencies: { react: "1" },
          devDependencies: { "@types/express": "1" },
        }),
        "src/x.ts": `import React from "react"; import lodash from "lodash"; import express from "express"; export default [React, lodash, express];`,
      }),
    );
    const undeclared = findings.filter((f) => f.kind === "undeclared-package").map((f) => f.title);
    expect(undeclared).toEqual(['"lodash" is imported but not in package.json']);
  });

  test("finds untested hotspots only when the repo has tests, and none when tests reach the file", async () => {
    const importers = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        `src/user${i}.ts`,
        `import { core } from "./core"; export const u${i} = core;`,
      ]),
    );
    const files = { ...importers, "src/core.ts": `export const core = 1;` };
    // no tests at all, and the repo is too small to judge
    const withoutTests = computeFindings(await analyzeFixture({ ...files, "package.json": "{}" }));
    expect(withoutTests.some((f) => f.kind === "no-tests" || f.kind === "untested-hotspot")).toBe(
      false,
    );
    // a test exists but reaches nothing near core: core is a hotspot used by 6 files
    const unrelated = computeFindings(
      await analyzeFixture({
        ...files,
        "src/x.ts": "export const x = 1;",
        "src/x.test.ts": `import { x } from "./x"; export { x };`,
      }),
    );
    expect(unrelated.find((f) => f.kind === "untested-hotspot")?.paths).toEqual(["src/core.ts"]);
    // a test that imports a user of core reaches core through the import chain
    const indirect = computeFindings(
      await analyzeFixture({
        ...files,
        "src/user0.test.ts": `import { u0 } from "./user0"; export { u0 };`,
      }),
    );
    expect(indirect.some((f) => f.kind === "untested-hotspot")).toBe(false);
    // a test that imports core directly
    const direct = computeFindings(
      await analyzeFixture({
        ...files,
        "src/core.test.ts": `import { core } from "./core"; export { core };`,
      }),
    );
    expect(direct.some((f) => f.kind === "untested-hotspot")).toBe(false);
  });

  test("lists files nothing imports, but not entry points", async () => {
    const findings = computeFindings(
      await analyzeFixture({
        "src/index.ts": `export const main = 1;`,
        "src/util/dead.ts": `export const dead = 1;`,
        "src/util/used.ts": `export const used = 1;`,
        "src/user.ts": `import { used } from "./util/used"; export const u = used;`,
      }),
    );
    const orphans = findings.filter((f) => f.kind === "orphan").map((f) => f.paths[0]);
    expect(orphans).toContain("src/util/dead.ts");
    expect(orphans).not.toContain("src/index.ts");
    expect(orphans).not.toContain("src/util/used.ts");
  });

  test("turns repeated fix commits into churn findings, and ignores chores and bulk edits", async () => {
    const analysis = await analyzeFixture({
      "src/hot.ts": "export const h = 1;",
      "src/cold.ts": "export const c = 1;",
    });
    const history = historyOf([
      commit("fix: crash on empty input", ["src/hot.ts"], "2026-06-01T10:00:00Z"),
      commit("fix: wrong total", ["src/hot.ts", "src/cold.ts"], "2026-07-01T10:00:00Z"),
      commit("Hotfix null pointer", ["src/hot.ts"], "2026-08-01T10:00:00Z"),
      commit("chore: fix lint", ["src/hot.ts", "src/cold.ts"], "2026-08-02T10:00:00Z"),
      commit(
        "fix: rename everywhere",
        Array.from({ length: 30 }, (_, i) => `src/f${i}.ts`).concat("src/cold.ts"),
        "2026-08-03T10:00:00Z",
      ),
    ]);
    const churn = computeFindings(analysis, history).filter((f) => f.kind === "fix-churn");
    expect(churn.map((f) => [f.paths[0], f.title])).toEqual([
      ["src/hot.ts", "hot.ts was fixed 3 times recently"],
    ]);
  });

  test("maps open issues to the files they name, ignoring pull requests and closed issues", async () => {
    const analysis = await analyzeFixture({ "src/lib/billing.ts": "export const b = 1;" });
    const findings = computeFindings(analysis, undefined, [
      {
        number: 7,
        title: "Wrong tax in src/lib/billing.ts",
        body: "",
        state: "open",
        labels: [{ name: "bug" }],
      },
      { number: 8, title: "Also src/lib/billing.ts", state: "closed" },
      { number: 9, title: "src/lib/billing.ts fix", state: "open", pull_request: {} },
      { number: 10, title: "unrelated", body: "no path here", state: "open" },
    ]);
    const issues = findings.filter((f) => f.kind === "issue-mention");
    expect(issues.map((f) => f.id)).toEqual(["issue:7"]);
    expect(issues[0]!.severity).toBe("medium");
  });

  test("findingsForPaths selects by file", async () => {
    const findings = computeFindings(await analyzeFixture(base));
    expect(findingsForPaths(findings, ["src/a.ts"]).some((f) => f.kind === "cycle")).toBe(true);
    expect(findingsForPaths(findings, ["src/ok.ts"]).some((f) => f.kind === "cycle")).toBe(false);
  });
});

describe("history helpers", () => {
  test("isFixLike separates repairs from chores", () => {
    expect(isFixLike("fix: handle null")).toBe(true);
    expect(isFixLike('Revert "add feature"')).toBe(true);
    expect(isFixLike("Hotfix login redirect")).toBe(true);
    expect(isFixLike("chore: fix lint")).toBe(false);
    expect(isFixLike("docs: fix typo")).toBe(false);
    expect(isFixLike("feat: add reports")).toBe(false);
  });
  test("revertedSha reads the standard revert message", () => {
    expect(revertedSha('Revert "x"', "This reverts commit ABCDEF1234567.")).toBe("abcdef1234567");
  });
});

describe("computeActivity", () => {
  test("builds per-author stats and a monthly timeline for the files", () => {
    const history = historyOf([
      commit("feat: a", ["src/x.ts"], "2026-05-03T10:00:00Z", "sam"),
      commit("fix: b", ["src/x.ts"], "2026-05-20T10:00:00Z", "alex"),
      commit("feat: c", ["src/x.ts"], "2026-06-02T10:00:00Z", "alex"),
      commit("feat: unrelated", ["src/y.ts"], "2026-06-03T10:00:00Z", "kim"),
    ]);
    const activity = computeActivity(history, ["src/x.ts"])!;
    expect(activity.authors.map((a) => [a.name, a.commits, a.fixes])).toEqual([
      ["alex", 2, 1],
      ["sam", 1, 0],
    ]);
    expect(activity.timeline.map((m) => [m.month, m.commits, m.fixes])).toEqual([
      ["2026-05", 2, 1],
      ["2026-06", 1, 0],
    ]);
    expect(activity.window.commits).toBe(3);
  });

  test("matches a revert to the commit it undoes, by sha", () => {
    const original = commit("feat: new checkout", ["src/pay.ts"], "2026-05-01T10:00:00Z", "sam");
    const revert = commit(
      'Revert "feat: new checkout"',
      ["src/pay.ts"],
      "2026-05-03T10:00:00Z",
      "alex",
      {
        body: `This reverts commit ${original.sha}.`,
      },
    );
    const activity = computeActivity(historyOf([original, revert]), ["src/pay.ts"])!;
    const episode = activity.episodes[0]!;
    expect(episode.kind).toBe("revert");
    expect(episode.confidence).toBe("explicit");
    expect(episode.relatedTo?.sha).toBe(original.sha);
  });

  test("links a fix to a recent change of the same files, labelled as inferred", () => {
    const change = commit("feat: faster search", ["src/search.ts"], "2026-05-01T10:00:00Z", "sam");
    const fix = commit(
      "fix: search returns nothing",
      ["src/search.ts"],
      "2026-05-04T10:00:00Z",
      "alex",
    );
    const late = commit("fix: much later", ["src/search.ts"], "2026-07-04T10:00:00Z", "alex");
    const episodes = computeActivity(historyOf([change, fix, late]))!.episodes;
    const linked = episodes.filter((e) => e.kind === "fix-after-change");
    expect(linked.map((e) => [e.commit.sha, e.relatedTo?.sha, e.confidence])).toEqual([
      [fix.sha, change.sha, "inferred"],
    ]);
  });

  test("returns null without history", () => {
    expect(computeActivity(undefined)).toBeNull();
    expect(computeActivity(historyOf([]), ["a"])).toBeNull();
  });
});
