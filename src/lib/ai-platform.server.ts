import { createHash } from "node:crypto";

/**
 * Helpers for the platform AI account.
 *
 * The platform account is a free tier with a small requests per minute budget.
 * Two things follow, and both are handled here rather than in the route:
 * a short window limiter so a page that asks about several modules at once does
 * not burn the budget in one burst, and a plain retry message that never repeats
 * a provider error or a provider upsell link back to a customer.
 */

export const PLATFORM_WINDOW_MS = 60_000;
export const PLATFORM_MAX_PER_WINDOW = 6;

export class PlatformLimiter {
  private hits: number[] = [];

  /** Count one call and report whether it fits in the current window. */
  take(now = Date.now()): boolean {
    this.hits = this.hits.filter((at) => now - at < PLATFORM_WINDOW_MS);
    if (this.hits.length >= PLATFORM_MAX_PER_WINDOW) return false;
    this.hits.push(now);
    return true;
  }

  /** Seconds until the oldest call leaves the window, so Retry-After is honest. */
  retryAfterSeconds(now = Date.now()): number {
    const oldest = this.hits[0];
    if (oldest === undefined) return 0;
    return Math.max(1, Math.ceil((PLATFORM_WINDOW_MS - (now - oldest)) / 1000));
  }
}

export const PLATFORM_BUSY_MESSAGE =
  "Nykst is answering a lot of questions right now. Try again in a minute, or use your own AI account in AI settings.";

export const PLATFORM_UNAVAILABLE_MESSAGE =
  "The shared Nykst AI service is not available right now. Try again, or use your own AI account in AI settings.";

/** Customer facing copy for a platform account failure. Never provider text. */
export function platformFailureMessage(status: number): string {
  return status === 429 ? PLATFORM_BUSY_MESSAGE : PLATFORM_UNAVAILABLE_MESSAGE;
}

/**
 * Some small models repeat the whole answer twice. Collapsing an exact
 * repetition is deterministic and never removes content: it only applies when
 * the text is the same block repeated end to end.
 */
function stripSignature(value: string): string {
  return value.replace(/\s*[\u2014\u2013-]\s*Nykst\.?\s*$/i, "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function collapseRepeatedAnswer(text: string): string {
  const value = text.trim();
  if (value.length < 80) return stripSignature(value);
  for (const parts of [2, 3, 4]) {
    if (value.length % parts !== 0) continue;
    const size = value.length / parts;
    if (size < 40) continue;
    const block = value.slice(0, size);
    let same = true;
    for (let index = 1; index < parts; index += 1) {
      if (value.slice(index * size, (index + 1) * size) !== block) {
        same = false;
        break;
      }
    }
    if (same) return stripSignature(block);
  }

  // The model sometimes signs its name, or writes a second parenthetical
  // version, after the first answer. Detect the opening four words appearing
  // again at a sentence or parenthesis boundary and keep the first answer.
  const opening = (value.toLowerCase().match(/[a-z0-9']+/g) ?? []).slice(0, 4);
  if (opening.length === 4) {
    const pattern = new RegExp(opening.map(escapeRegExp).join("[^a-z0-9']+"), "gi");
    const starts: number[] = [];
    for (const match of value.matchAll(pattern)) {
      starts.push(match.index ?? 0);
      if (starts.length === 2) break;
    }
    if (starts.length === 2 && starts[1]! > value.length * 0.25) {
      // Cut at the sentence end before the second opening, so a parenthetical
      // restatement and a signature never survive as a second answer.
      const before = value.slice(0, starts[1]!);
      const cut = Math.max(
        before.lastIndexOf(". "),
        before.lastIndexOf("! "),
        before.lastIndexOf("? "),
      );
      if (cut >= 60) return stripSignature(value.slice(0, cut + 1).trim());
    }
  }
  return stripSignature(value);
}

/**
 * A fixed length cache key for an identical question from the same caller.
 *
 * The caller scope is part of the key so one visitor's repository context can
 * never be served to another visitor, and the whole thing is hashed so a large
 * context cannot become a large in-memory key.
 */
export function platformCacheKey(
  scope: string,
  mode: string,
  system: string,
  context: string,
  prompt: string,
): string {
  return createHash("sha256")
    .update(`${scope}\u0000${mode}\u0000${system}\u0000${context}\u0000${prompt}`, "utf8")
    .digest("hex");
}

export interface CachedAnswer {
  answer: string;
  at: number;
}

/** Small least recently used cache with a time limit. */
export class AnswerCache {
  private entries = new Map<string, CachedAnswer>();

  constructor(
    private readonly limit = 100,
    private readonly ttlMs = 10 * 60_000,
  ) {}

  get(key: string, now = Date.now()): string | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (now - entry.at > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return entry.answer;
  }

  set(key: string, answer: string, now = Date.now()): void {
    if (this.entries.size >= this.limit) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.entries.delete(oldest[0]);
    }
    this.entries.set(key, { answer, at: now });
  }

  get size(): number {
    return this.entries.size;
  }
}
