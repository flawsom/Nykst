import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { analyzeFixture } from "./helpers";

const FILES: Record<string, string> = {
  "src/billing/invoice.ts":
    "export function createInvoice(total: number) {\n  return { total };\n}\n",
  "src/app.ts":
    'import { createInvoice } from "./billing/invoice";\nexport const x = createInvoice(5);\n',
  "package.json": JSON.stringify({ name: "shop", dependencies: {} }),
};
const analysis = await analyzeFixture(FILES);

let headFiles: Record<string, string> = {};
let prFiles: { filename: string; status: string; previous_filename?: string }[] = [];

mock.module("@/lib/mcp.server", () => ({
  loadSnapshot: async () => ({
    repository_full_name: "acme/shop",
    created_at: "2026-10-01T00:00:00Z",
    analysis,
    history: undefined,
  }),
}));
mock.module("@/lib/integrations/github", () => ({
  githubContent: async (_t: string, _o: string, _r: string, path: string) => {
    const text = headFiles[path];
    if (text === undefined) throw new Error("404");
    return {
      type: "file",
      encoding: "base64",
      content: Buffer.from(text).toString("base64"),
      sha: "s",
      path,
    };
  },
}));

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  if (url.includes("/pulls/7/files")) return reply(prFiles);
  if (url.endsWith("/pulls/7"))
    return reply({
      number: 7,
      title: "A change",
      html_url: "https://github.com/acme/shop/pull/7",
      updated_at: "2026-10-02T00:00:00Z",
      user: { login: "sam" },
      head: { sha: "headsha" },
      base: { ref: "main", sha: "basesha" },
    });
  if (url.includes("/pulls?state=open"))
    return reply([
      {
        number: 7,
        title: "A change",
        html_url: "u",
        updated_at: "2026-10-02T00:00:00Z",
        user: { login: "sam" },
        head: { sha: "h" },
        base: { ref: "main" },
        draft: true,
      },
    ]);
  if (url.includes("/compare/")) return reply({ ahead_by: 3, status: "ahead" });
  if (url.endsWith("/repos/acme/shop")) return reply({ default_branch: "main" });
  return reply({ message: "Not Found" }, 404);
}) as typeof fetch;

const { checkPull, listOpenPulls, freshness } = await import("../src/lib/pulls.server");
const input = { userId: "1", token: "t", repository: "acme/shop", number: 7 };

afterAll(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  headFiles = {};
  prFiles = [];
});

describe("checkPull", () => {
  test("renaming an export another file imports is blocked", async () => {
    headFiles["src/billing/invoice.ts"] =
      "export function makeInvoice(total: number) {\n  return { total };\n}\n";
    prFiles = [{ filename: "src/billing/invoice.ts", status: "modified" }];
    const result = await checkPull(input);
    expect(result.report.verdict).toBe("blocked");
    expect(result.report.issues.some((i) => i.check === "removed-export")).toBe(true);
    expect(result.filesChecked).toBe(1);
    expect(result.analysisCommit).toBe("fixture");
  });

  test("a docs-only pull request checks nothing and says why", async () => {
    prFiles = [{ filename: "README.md", status: "modified" }];
    const result = await checkPull(input);
    expect(result.filesChecked).toBe(0);
    expect(result.skipped[0]?.path).toBe("README.md");
    expect(result.report).toBeDefined();
  });

  test("a removed file that is still imported is blocked", async () => {
    prFiles = [{ filename: "src/billing/invoice.ts", status: "removed" }];
    const result = await checkPull(input);
    expect(result.report.verdict).toBe("blocked");
  });

  test("an oversize file is skipped with a reason", async () => {
    headFiles["src/billing/invoice.ts"] = "export const a = 1;\n".repeat(20_000);
    prFiles = [{ filename: "src/billing/invoice.ts", status: "modified" }];
    const result = await checkPull(input);
    expect(result.filesChecked).toBe(0);
    expect(result.skipped[0]?.reason).toContain("Larger than");
  });

  test("an unreadable pull request gives a human error", async () => {
    await expect(checkPull({ ...input, number: 99 })).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("could not read this pull request"),
    });
  });
});

describe("listing and freshness", () => {
  test("lists open pulls and reports how far the analysis is behind", async () => {
    const pulls = await listOpenPulls("t", "acme/shop");
    expect(pulls[0]).toMatchObject({ number: 7, author: "sam", draft: true });
    expect(await freshness("t", "acme/shop", "abc")).toMatchObject({
      behindBy: 3,
      defaultBranch: "main",
    });
  });
});
