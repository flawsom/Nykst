import { beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanMemoryPath, noteApplies } from "../src/lib/analysis/memory-match";
import type { Finding } from "../src/lib/analysis/findings";
import { FakeDb } from "./fake-supabase";

const db = new FakeDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
const memory = await import("../src/lib/memory.server");

beforeEach(() => db.tables.clear());

const REPO = "acme/shop";

describe("noteApplies", () => {
  test("repo-wide notes apply everywhere", () => {
    expect(noteApplies("", ["src/a.ts"])).toBe(true);
  });
  test("a note applies to its file, its parent folders and files inside its folder", () => {
    expect(noteApplies("src/lib/a.ts", ["src/lib/a.ts"])).toBe(true);
    expect(noteApplies("src/lib", ["src/lib/a.ts"])).toBe(true);
    expect(noteApplies("src/lib/deep/x.ts", ["src/lib"])).toBe(true); // note inside the folder being viewed
    expect(noteApplies("src/lib", ["src/library/a.ts"])).toBe(false); // not a prefix match on partial names
    expect(noteApplies("src/other", ["src/lib/a.ts"])).toBe(false);
  });
  test("cleanMemoryPath removes traversal and leading slashes", () => {
    expect(cleanMemoryPath("/src/../lib//a.ts")).toBe("src/lib/a.ts");
    expect(cleanMemoryPath("./src/")).toBe("src");
    expect(cleanMemoryPath(42)).toBe("");
  });
});

describe("notes", () => {
  const add = (userId: string, path: string, body: string, source: "user" | "agent" = "user") =>
    memory.addMemory(userId, REPO, { path, kind: "gotcha", body, source });

  test("lists only the notes that apply to the code, newest first", async () => {
    await add("1", "", "repo-wide rule");
    await add("1", "src/billing", "billing folder note");
    await add("1", "src/billing/tax.ts", "tax gotcha", "agent");
    await add("1", "src/auth", "auth note");
    const notes = await memory.listMemory("1", REPO, ["src/billing/tax.ts"]);
    expect(notes.map((n) => n.body).sort()).toEqual([
      "billing folder note",
      "repo-wide rule",
      "tax gotcha",
    ]);
    expect(notes.find((n) => n.body === "tax gotcha")!.source).toBe("agent");
    expect((await memory.listMemory("1", REPO)).length).toBe(4);
  });

  test("keeps users apart", async () => {
    await add("1", "", "mine");
    await add("2", "", "theirs");
    expect((await memory.listMemory("1", REPO)).map((n) => n.body)).toEqual(["mine"]);
  });

  test("rejects empty and oversized notes", async () => {
    await expect(add("1", "", "   ")).rejects.toThrow("empty");
    await expect(add("1", "", "x".repeat(4001))).rejects.toThrow("4000");
  });

  test("only the owner can delete a note", async () => {
    const note = await add("1", "", "keep me");
    await memory.deleteMemory("2", note.id);
    expect((await memory.listMemory("1", REPO)).length).toBe(1);
    await memory.deleteMemory("1", note.id);
    expect((await memory.listMemory("1", REPO)).length).toBe(0);
  });
});

describe("finding lifecycle", () => {
  const finding = (id: string, title = id): Finding => ({
    id,
    kind: "cycle",
    severity: "medium",
    title,
    detail: "",
    why: "",
    fix: "",
    paths: [`src/${id}.ts`],
    evidence: [],
  });
  const states = async () =>
    Object.fromEntries((await memory.listFindingStates("1", REPO)).map((s) => [s.signature, s]));

  test("opens, resolves with the commit, and counts a return as a reopen", async () => {
    let summary = await memory.syncFindings("1", REPO, [finding("a"), finding("b")], "sha1");
    expect(summary).toEqual({ opened: 2, resolved: 0, reopened: 0, stillOpen: 0 });

    summary = await memory.syncFindings("1", REPO, [finding("a")], "sha2");
    expect(summary).toMatchObject({ opened: 0, resolved: 1, stillOpen: 1 });
    let s = await states();
    expect(s["b"]).toMatchObject({ status: "resolved", resolved_commit: "sha2", times_opened: 1 });
    expect(s["a"]).toMatchObject({ status: "open" });

    summary = await memory.syncFindings("1", REPO, [finding("a"), finding("b")], "sha3");
    expect(summary).toMatchObject({ reopened: 1, stillOpen: 1, resolved: 0 });
    s = await states();
    expect(s["b"]).toMatchObject({ status: "open", times_opened: 2, resolved_commit: null });
    expect(s["b"]!.first_seen_at).toBe(s["b"]!.first_seen_at);
  });

  test("a dismissed finding stays dismissed while it is present and is not reported as fixed when it goes", async () => {
    await memory.syncFindings("1", REPO, [finding("a")], "sha1");
    await memory.dismissFinding("1", REPO, "a", "accepted: generated code", true);
    await memory.syncFindings("1", REPO, [finding("a")], "sha2");
    expect((await states())["a"]).toMatchObject({
      status: "dismissed",
      dismissed_note: "accepted: generated code",
    });
    const summary = await memory.syncFindings("1", REPO, [], "sha3");
    expect(summary.resolved).toBe(0);
    expect((await states())["a"]!.status).toBe("dismissed");
  });

  test("tracks repositories separately", async () => {
    await memory.syncFindings("1", REPO, [finding("a")], "sha1");
    const other = await memory.syncFindings("1", "acme/other", [], "sha1");
    expect(other.resolved).toBe(0);
    expect(Object.keys(await states())).toEqual(["a"]);
  });
});
