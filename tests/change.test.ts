import { beforeEach, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "./fake-supabase";
import { analyzeFixture } from "./helpers";

const FILES: Record<string, string> = {
  "src/billing/invoice.ts":
    "export function createInvoice(total: number) {\n  return { total };\n}\n",
  "src/app.ts":
    'import { createInvoice } from "./billing/invoice";\nexport const x = createInvoice(5);\n',
  "package.json": JSON.stringify({ name: "shop", dependencies: {} }),
};
const analysis = await analyzeFixture(FILES);

let answers: string[] = [];
const prompts: string[] = [];
mock.module("@/lib/byok.server", () => ({
  loadUserKey: async () => ({
    provider: "openai",
    apiKey: "k",
    model: "m",
    last4: "k",
    apiBaseUrl: null,
  }),
  platformGeminiKey: () => null,
  chatWithUserKey: async (_key: unknown, _system: string, prompt: string) => {
    prompts.push(prompt);
    return answers.shift() ?? "";
  },
}));
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
    const text = FILES[path];
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
const db = new FakeDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
const { addMemory } = await import("../src/lib/memory.server");
const { generateChange, ChangeError } = await import("../src/lib/workspace.server");

const base = { userId: "1", githubToken: "t", repository: "acme/shop" };
const block = (path: string, body: string) => `<<<FILE ${path}>>>\n${body}\n<<<END>>>`;
const summary = (text: string) => `<<<SUMMARY>>>\n${text}\n<<<END>>>`;

beforeEach(async () => {
  db.tables.clear();
  await addMemory("1", "acme/shop", {
    path: "src/billing",
    kind: "gotcha",
    body: "Totals are in cents.",
    source: "user",
  });
  answers = [];
  prompts.length = 0;
});

describe("generateChange", () => {
  test("a compatible change comes back clear, with a git-apply patch and notes in the prompt", async () => {
    answers = [
      "src/billing/invoice.ts",
      [
        summary("Adds a currency."),
        block(
          "src/billing/invoice.ts",
          "export function createInvoice(total: number, currency = 'USD') {\n  return { total, currency };\n}",
        ),
      ].join("\n"),
    ];
    const result = await generateChange({ ...base, task: "add currency to invoice creation" });
    expect(result.report.verdict).not.toBe("blocked");
    expect(result.repairs).toBe(0);
    expect(result.files[0]).toMatchObject({ path: "src/billing/invoice.ts", status: "modified" });
    expect(result.patch).toContain("diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts");
    expect(prompts.at(-1)).toContain("Totals are in cents.");
  });

  test("a breaking first draft is repaired once using the checker's findings", async () => {
    answers = [
      "src/billing/invoice.ts",
      [
        summary("Renames."),
        block(
          "src/billing/invoice.ts",
          "export function makeInvoice(total: number) {\n  return { total };\n}",
        ),
      ].join("\n"),
      [
        summary("Keeps the old name."),
        block(
          "src/billing/invoice.ts",
          "export function createInvoice(total: number) {\n  return { total };\n}",
        ),
      ].join("\n"),
    ];
    const result = await generateChange({ ...base, task: "rename invoice creation function" });
    expect(result.repairs).toBe(1);
    expect(prompts.at(-1)).toContain("src/app.ts");
    expect(result.report.verdict).not.toBe("blocked");
  });

  test("a change that is still broken after the repair stays blocked", async () => {
    const broken = [
      summary("Renames."),
      block(
        "src/billing/invoice.ts",
        "export function makeInvoice(total: number) {\n  return { total };\n}",
      ),
    ].join("\n");
    answers = ["src/billing/invoice.ts", broken, broken];
    const result = await generateChange({ ...base, task: "rename invoice creation function" });
    expect(result.report.verdict).toBe("blocked");
    expect(result.repairs).toBe(1);
  });

  test("files the model was not shown cannot be rewritten", async () => {
    answers = [
      "src/billing/invoice.ts",
      [
        summary("x"),
        block("src/app.ts", "export const x = 1;"),
        block("src/billing/invoice.ts", FILES["src/billing/invoice.ts"]!),
      ].join("\n"),
    ];
    const result = await generateChange({ ...base, task: "touch the invoice file please" });
    expect(result.files.map((f) => f.path)).toEqual(["src/billing/invoice.ts"]);
    expect(result.warnings.join(" ")).toContain("src/app.ts");
  });

  test("short tasks and unknown repositories are rejected with clear errors", async () => {
    await expect(generateChange({ ...base, task: "fix" })).rejects.toBeInstanceOf(ChangeError);
    await expect(
      generateChange({ ...base, repository: "nope", task: "a long enough task" }),
    ).rejects.toBeInstanceOf(ChangeError);
  });
});
