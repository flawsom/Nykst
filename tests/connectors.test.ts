import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, test } from "bun:test";
import { analyzeRepository, wantsContent } from "../src/lib/analysis/engine.server";
import {
  adfText,
  answerCommand,
  keywords,
  mentionedPaths,
  resolveFiles,
  ticketAnalysis,
  toAdf,
} from "../src/lib/connectors/format";
import { verifySlackSignature } from "../src/lib/connectors/slack.server";
import type { RepoAnalysis } from "../src/lib/analysis/types";

const FILES: Record<string, string> = {
  "src/billing/invoice.ts": "export function createInvoice(total: number) { return total; }\n",
  "src/routes/checkout.tsx":
    'import { createInvoice } from "../billing/invoice";\nexport default function C() { return createInvoice(1); }\n',
  "src/auth/login.ts": "export function login() {}\n",
};
let analysis: RepoAnalysis;
const snapshot = () => ({ repository_full_name: "acme/shop", analysis, history: undefined });

beforeAll(async () => {
  const contents = new Map<string, string>();
  for (const [path, text] of Object.entries(FILES))
    if (wantsContent(path, text.length)) contents.set(path, text);
  analysis = await analyzeRepository({ ref: "abcdef1234567", paths: Object.keys(FILES), contents });
});

describe("slack signature", () => {
  const secret = "s3cret";
  const body = "team_id=T1&text=impact+x";
  const sign = (ts: string) =>
    `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;
  const now = Date.UTC(2026, 9, 12, 12, 0, 0);
  const ts = String(now / 1000);
  test("accepts a valid, fresh signature", () => {
    expect(verifySlackSignature(secret, ts, sign(ts), body, now)).toBe(true);
  });
  test("rejects a wrong secret, a changed body, a stale timestamp and missing headers", () => {
    expect(verifySlackSignature("other", ts, sign(ts), body, now)).toBe(false);
    expect(verifySlackSignature(secret, ts, sign(ts), `${body}x`, now)).toBe(false);
    const old = String(now / 1000 - 600);
    expect(verifySlackSignature(secret, old, sign(old), body, now)).toBe(false);
    expect(verifySlackSignature(secret, null, null, body, now)).toBe(false);
    expect(verifySlackSignature("", ts, sign(ts), body, now)).toBe(false);
  });
});

describe("finding files from text", () => {
  test("paths named in a ticket win, including bare file names", () => {
    const known = new Set(Object.keys(FILES));
    expect(mentionedPaths("see src/auth/login.ts and invoice.ts", known).sort()).toEqual([
      "src/auth/login.ts",
      "src/billing/invoice.ts",
    ]);
  });
  test("a folder prefix and free-text keywords resolve to real files", () => {
    expect(resolveFiles(analysis, "src/billing")).toEqual(["src/billing/invoice.ts"]);
    expect(resolveFiles(analysis, "Customers get charged twice during invoice creation")[0]).toBe(
      "src/billing/invoice.ts",
    );
    expect(resolveFiles(analysis, "something unrelated entirely")).toEqual([]);
  });
  test("keywords drop filler words", () => {
    expect(keywords("Fix the invoice bug when checkout fails")).toEqual([
      "invoice",
      "checkout",
      "fails",
    ]);
  });
});

describe("answers", () => {
  test("/nykst impact reports real dependents and says what it is based on", () => {
    const text = answerCommand(snapshot(), "impact src/billing/invoice.ts");
    expect(text).toContain("src/routes/checkout.tsx");
    expect(text).toContain("Based on acme/shop at abcdef1");
  });
  test("unknown targets and commands are explained, not invented", () => {
    expect(answerCommand(snapshot(), "impact nothing/here.ts")).toContain(
      "No analyzed file matches",
    );
    expect(answerCommand(snapshot(), "")).toContain("/nykst impact");
    expect(answerCommand(snapshot(), "impact")).toContain("Usage");
  });
  test("a ticket is tied to files through its text, or says it could not be", () => {
    const hit = ticketAnalysis(snapshot(), "Invoice total wrong", "createInvoice rounds badly");
    expect(hit.join("\n")).toContain("src/billing/invoice.ts");
    const miss = ticketAnalysis(snapshot(), "Update the logo", "make it blue");
    expect(miss[0]).toContain("could not tie");
  });
});

describe("Atlassian document format", () => {
  test("round trips lines to paragraphs and back to text", () => {
    const doc = toAdf(["one", "two"]);
    expect(doc.content).toHaveLength(2);
    expect(adfText(doc).trim()).toBe("one\ntwo");
    expect(adfText(null)).toBe("");
  });
});
