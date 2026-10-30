import { describe, expect, test } from "bun:test";
import {
  AnswerCache,
  collapseRepeatedAnswer,
  PLATFORM_BUSY_MESSAGE,
  PLATFORM_MAX_PER_WINDOW,
  PlatformLimiter,
  platformCacheKey,
  platformFailureMessage,
} from "../src/lib/ai-platform.server";

describe("platform AI budget", () => {
  test("allows a plain page load and refuses the seventh call in one minute", () => {
    const limiter = new PlatformLimiter();
    const now = 1_000_000;
    for (let index = 0; index < PLATFORM_MAX_PER_WINDOW; index += 1) {
      expect(limiter.take(now + index * 100)).toBe(true);
    }
    expect(limiter.take(now + 700)).toBe(false);
    const retryAfter = limiter.retryAfterSeconds(now + 700);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  test("the window resets, so the next minute works again", () => {
    const limiter = new PlatformLimiter();
    const now = 2_000_000;
    for (let index = 0; index < PLATFORM_MAX_PER_WINDOW; index += 1) limiter.take(now);
    expect(limiter.take(now + 500)).toBe(false);
    expect(limiter.take(now + 60_001)).toBe(true);
  });

  test("customer copy never repeats a provider quota message or an upsell link", () => {
    for (const status of [400, 401, 402, 403, 404, 500, 502, 504, 429]) {
      const message = platformFailureMessage(status);
      expect(message).not.toContain("provider");
      expect(message).not.toContain("quota");
      expect(message).not.toContain("top up");
      expect(message).not.toContain("http");
      expect(message).not.toContain("rate limit");
      expect(message.length).toBeGreaterThan(30);
    }
    expect(platformFailureMessage(429)).toBe(PLATFORM_BUSY_MESSAGE);
    expect(PLATFORM_BUSY_MESSAGE).toContain("Try again in a minute");
  });
});

describe("repeated answers", () => {
  test("an answer repeated end to end is returned once", () => {
    const block =
      "Check the twelve files that use this one first, because a change to its interface reaches them immediately. Then read the three tests that check it.";
    expect(collapseRepeatedAnswer(`${block}${block}`)).toBe(block);
    expect(collapseRepeatedAnswer(`${block}${block}${block}`)).toBe(block);
  });

  test("a signed answer that repeats the opening is cut back to one answer", () => {
    const block =
      "A dependency map shows how software components are connected by their dependencies, revealing which parts rely on others and how a change could propagate.";
    const answer = `${block} (That is the short version.) \u2014 Nykst.${block}`;
    expect(collapseRepeatedAnswer(answer)).toBe(block);
  });

  test("a parenthetical second and third answer are removed", () => {
    const first =
      "A dependency map shows how software components (services, modules, files) relate to and rely on each other, revealing the blast radius of changes.";
    const answer = `${first} (A dependency map shows the directional relationships between components and how changes ripple through the system.) (A dependency map visually illustrates the same dependencies so a developer can trace a change.)`;
    expect(collapseRepeatedAnswer(answer)).toBe(first);
  });

  test("a normal answer is left exactly as written", () => {
    const answer =
      "Check the files that use this file first. Then read the tests that check it, because they describe the behaviour other code expects.";
    expect(collapseRepeatedAnswer(answer)).toBe(answer);
    expect(collapseRepeatedAnswer("Short answer.")).toBe("Short answer.");
  });
});

describe("answer cache", () => {
  test("identical questions are served from the cache inside the window", () => {
    const cache = new AnswerCache(10, 1_000);
    const key = platformCacheKey("user-1", "navigator", "system", "context", "question");
    expect(cache.get(key, 0)).toBeNull();
    cache.set(key, "answer", 0);
    expect(cache.get(key, 500)).toBe("answer");
    expect(cache.get(key, 1_500)).toBeNull();
  });

  test("the cache evicts the oldest entry instead of growing without limit", () => {
    const cache = new AnswerCache(2, 60_000);
    cache.set("a", "1", 1);
    cache.set("b", "2", 2);
    cache.set("c", "3", 3);
    expect(cache.size).toBe(2);
    expect(cache.get("a", 3)).toBeNull();
    expect(cache.get("c", 3)).toBe("3");
  });

  test("different context or mode is a different key", () => {
    expect(platformCacheKey("user-1", "navigator", "s", "one", "q")).not.toBe(
      platformCacheKey("user-1", "navigator", "s", "two", "q"),
    );
    expect(platformCacheKey("user-1", "navigator", "s", "", "q")).not.toBe(
      platformCacheKey("user-1", "code", "s", "", "q"),
    );
  });

  test("one caller's private context is not another caller's cache hit", () => {
    expect(platformCacheKey("user-1", "navigator", "s", "private repo", "q")).not.toBe(
      platformCacheKey("user-2", "navigator", "s", "private repo", "q"),
    );
    expect(platformCacheKey("anonymous", "navigator", "s", "", "q")).not.toBe(
      platformCacheKey("user-1", "navigator", "s", "", "q"),
    );
  });

  test("the key is fixed length even for a very large context", () => {
    const key = platformCacheKey("user-1", "navigator", "s", "x".repeat(24_000), "q");
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
