/**
 * Which memory notes apply to the code being looked at. A note is attached to a file, a
 * folder, or the whole repository (empty path). It applies to a target when it covers it
 * (repo-wide, the same path, or a parent folder) or when it sits inside the target folder.
 */
export function noteApplies(notePath: string, targets: string[]) {
  if (!notePath) return true;
  const note = notePath.replace(/\/+$/, "");
  return targets.some((raw) => {
    const target = raw.replace(/\/+$/, "");
    if (!target) return true;
    return target === note || target.startsWith(`${note}/`) || note.startsWith(`${target}/`);
  });
}

export const MEMORY_KINDS = ["note", "decision", "gotcha", "bug-fix", "convention"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface MemoryNote {
  id: string;
  path: string;
  kind: MemoryKind;
  body: string;
  source: "user" | "agent";
  author: string | null;
  commit_sha: string | null;
  created_at: string;
}

export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && (MEMORY_KINDS as readonly string[]).includes(value);
}

/** Normalizes a path coming from a client: no leading "./" or "/", no "..". */
export function cleanMemoryPath(value: unknown) {
  if (typeof value !== "string") return "";
  const parts = value
    .trim()
    .replace(/^\.?\//, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
  return parts.join("/").slice(0, 500);
}
