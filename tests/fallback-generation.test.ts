import { describe, expect, test } from "bun:test";
import { deterministicProposal } from "../src/lib/analysis/fallback-generation";

const source = [
  "export function parseRepoSlug(input: string) {",
  '  return input.split("/").pop() ?? input;',
  "}",
  "",
].join("\n");

describe("deterministic Stage 2 fallback", () => {
  test("inserts a requested comment above the first exported declaration", () => {
    const result = deterministicProposal(
      "Add a one-line comment above the first exported function.",
      source,
      "src/lib/code-links.ts",
    );
    expect(result.content).toContain("// Requested change: Add a one-line comment");
    expect(result.content.indexOf("// Requested change")).toBeLessThan(
      result.content.indexOf("export function parseRepoSlug"),
    );
    expect(result.content).toContain("export function parseRepoSlug");
  });

  test("appends one documented export and is idempotent for the same prompt", () => {
    const first = deterministicProposal(
      "Add a helper that records the verified state.",
      source,
      "src/lib/code-links.ts",
    );
    expect(first.content).toMatch(/export const nykstGrounded[0-9a-f]{6} = /);
    const second = deterministicProposal(
      "Add a helper that records the verified state.",
      first.content,
      "src/lib/code-links.ts",
    );
    expect(second.content).toBe(first.content);
    expect(second.summary).toContain("already present");
  });

  test("honors an explicitly requested identifier", () => {
    const result = deterministicProposal(
      "Add a const verifiedBoundary to the module.",
      source,
      "src/lib/code-links.ts",
    );
    expect(result.content).toContain("export const verifiedBoundary = ");
  });

  test("uses language-appropriate comments and never emits TypeScript into Python", () => {
    const python = "def parse_repo_slug(value):\n    return value\n";
    const result = deterministicProposal("Add a helper constant.", python, "src/lib/code_links.py");
    expect(result.content).toContain("# Requested change");
    expect(result.content).not.toContain("export const");
    expect(result.content).toContain("def parse_repo_slug");
  });
});
