/** Helpers for scripts that analyze a local checkout (development and demo-snapshot tooling). */
import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { wantsContent } from "../../src/lib/analysis/engine.server";
import type { HistoryCommit } from "../../src/lib/analysis/types";

export function readRepo(root: string) {
  const paths: string[] = [];
  const contents = new Map<string, string>();
  const sizes = new Map<string, number>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === ".git" || entry === "node_modules") continue;
      const full = join(dir, entry);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(full);
      else {
        const path = relative(root, full);
        paths.push(path);
        sizes.set(path, stat.size);
        if (wantsContent(path, stat.size)) contents.set(path, readFileSync(full, "utf8"));
      }
    }
  };
  walk(root);
  return { paths, contents, sizes };
}

/** Commit history with changed files, from `git log` (no API calls, no rate limits). */
export function gitHistory(root: string, limit = 200): HistoryCommit[] {
  const REC = "\u001e";
  const FIELD = "\u001f";
  const out = execFileSync(
    "git",
    [
      "-C",
      root,
      "log",
      "--no-merges",
      "--no-renames",
      `-n${limit}`,
      "--name-only",
      `--format=${REC}%H${FIELD}%an${FIELD}%aI${FIELD}%s${FIELD}%b${REC}`,
    ],
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
  );
  // Output alternates: "", header, files, header, files, ...
  const parts = out.split(REC);
  const commits: HistoryCommit[] = [];
  for (let i = 1; i + 1 <= parts.length; i += 2) {
    const [sha, author, date, message, body = ""] = (parts[i] ?? "").split(FIELD);
    if (!sha || sha.length !== 40) continue;
    const files = (parts[i + 1] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    commits.push({
      sha,
      author: author ?? "unknown",
      date: date ?? "",
      message: message ?? "",
      ...(body.trim() ? { body: body.trim().slice(0, 600) } : {}),
      files,
    });
  }
  return commits;
}
