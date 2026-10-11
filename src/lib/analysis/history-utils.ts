/** Small, dependency-free helpers for reading commit messages. Safe on server and client. */

const NOT_A_BUG_FIX =
  /^(docs|style|chore|ci|build|test|tests|refactor|perf|feat|feature|deps|release)(\(.+\))?!?:/i;
const FIX_WORDS =
  /\b(fix|fixes|fixed|fixing|bugfix|hotfix|bug|regression|patch|revert|reverts|reverted)\b/i;

/** True for commits that repair something: "fix: …", "Revert …", "hotfix …", "… bug …". */
export function isFixLike(message: string) {
  const subject = message.split("\n", 1)[0] ?? "";
  if (NOT_A_BUG_FIX.test(subject.trim())) return false;
  return FIX_WORDS.test(subject);
}

export function isRevert(message: string) {
  return /^revert\b/i.test((message.split("\n", 1)[0] ?? "").trim());
}

/** Original commit sha named by "This reverts commit <sha>", if any. */
export function revertedSha(message: string, body = "") {
  const match = /this reverts commit ([0-9a-f]{7,40})/i.exec(`${message}\n${body}`);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Subject a revert commit quotes: Revert "feat: add x" -> "feat: add x". */
export function revertedSubject(message: string) {
  const match = /^revert\s+"(.+)"\s*$/i.exec((message.split("\n", 1)[0] ?? "").trim());
  return match?.[1]?.trim() ?? null;
}

export function monthOf(isoDate: string) {
  return isoDate.slice(0, 7) || "unknown";
}

export function daysBetween(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

/** 32-bit FNV-1a, enough to make short stable ids out of long strings. */
export function shortHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
