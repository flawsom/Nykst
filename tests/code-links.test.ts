import { describe, expect, test } from "bun:test";
import {
  SELF_REPOSITORY,
  buildCodeExcerpt,
  describeLine,
  editorFileUrl,
  githubBlobUrl,
  isSelfRepository,
  parseRepoSlug,
} from "../src/lib/code-links";

describe("parseRepoSlug", () => {
  test("accepts owner/name, GitHub URLs and bare names with an owner hint", () => {
    expect(parseRepoSlug("acme/payments")?.slug).toBe("acme/payments");
    expect(parseRepoSlug("https://github.com/acme/payments.git")?.slug).toBe("acme/payments");
    expect(parseRepoSlug("payments", "acme")?.slug).toBe("acme/payments");
    expect(parseRepoSlug("")).toBeNull();
    expect(parseRepoSlug("not a repo")).toBeNull();
  });

  test("recognises the live workspace repository", () => {
    expect(isSelfRepository(SELF_REPOSITORY)).toBe(true);
    expect(isSelfRepository("https://github.com/flawsom/nykst")).toBe(true);
    expect(isSelfRepository("acme/payments")).toBe(false);
  });
});

describe("githubBlobUrl", () => {
  test("points at the exact line and honours the snapshot ref", () => {
    expect(
      githubBlobUrl({
        repository: "acme/payments",
        ref: "9f1c2ad",
        path: "src/routes/api.ai.chat.ts",
        line: 34,
      }),
    ).toBe("https://github.com/acme/payments/blob/9f1c2ad/src/routes/api.ai.chat.ts#L34");
  });

  test("defaults to main and omits the anchor without a line", () => {
    expect(githubBlobUrl({ repository: "acme/payments", path: "src/a.ts" })).toBe(
      "https://github.com/acme/payments/blob/main/src/a.ts",
    );
    expect(githubBlobUrl({ repository: null, path: "src/a.ts" })).toBeNull();
  });
});

describe("editorFileUrl", () => {
  test("builds a vscode:// line link that keeps the colon", () => {
    expect(editorFileUrl("src/routes/api.ai.chat.ts", 34, "/home/me/nykst")).toBe(
      "vscode://file/home/me/nykst/src/routes/api.ai.chat.ts:34",
    );
  });
});

describe("buildCodeExcerpt", () => {
  const source = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join("\n");

  test("returns twenty lines of context around the clicked line", () => {
    const excerpt = buildCodeExcerpt(source, 34);
    expect(excerpt.line).toBe(34);
    expect(excerpt.start).toBe(14);
    expect(excerpt.end).toBe(54);
    expect(excerpt.lines).toHaveLength(41);
    expect(excerpt.lines.find((item) => item.number === 34)?.text).toBe("line 34");
  });

  test("clamps at the start and end of the file", () => {
    expect(buildCodeExcerpt("a\nb\nc", 1, 20)).toMatchObject({ start: 1, end: 3, line: 1 });
    expect(buildCodeExcerpt("a\nb\nc", 99, 20)).toMatchObject({ start: 1, end: 3, line: 3 });
  });
});

describe("describeLine", () => {
  test("names the kind of statement on the clicked line", () => {
    expect(describeLine("import { x } from './x';", 1)).toContain("direct dependent");
    expect(describeLine("  const rows = await db.from('users').select('id');", 1)).toContain(
      "database resource",
    );
  });
});
