import { afterEach, describe, expect, test } from "bun:test";
import { AiKeyError, chatWithUserKey, testProviderKey } from "../src/lib/byok.server";

const originalFetch = globalThis.fetch;
const endpoint = "https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1";
const model = "@cf/qwen/qwen3.8-27b";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Cloudflare Workers AI provider", () => {
  test("tests the selected model with a chat request and parses its code response", async () => {
    const requests: { url: string; body: Record<string, unknown>; authorization: string | null }[] =
      [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return Response.json({
        choices: [{ message: { content: "```ts\nexport const x = 1;\n```" } }],
      });
    }) as typeof fetch;

    await testProviderKey("cloudflare", "test-token", endpoint, model);
    const answer = await chatWithUserKey(
      { provider: "cloudflare", apiKey: "test-token", last4: "oken", apiBaseUrl: endpoint, model },
      "Return code",
      "Use the supplied context",
      { maxTokens: 2400 },
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe(`${endpoint}/chat/completions`);
    expect(requests[0]?.body.model).toBe(model);
    expect(requests[0]?.authorization).toBe("Bearer test-token");
    expect(requests[1]?.body.max_tokens).toBe(2400);
    expect(answer).toContain("export const x = 1");
  });

  test("rejects invalid account endpoints before sending a token", async () => {
    let requested = false;
    globalThis.fetch = (async () => {
      requested = true;
      return new Response();
    }) as typeof fetch;
    for (const url of [
      "",
      "https://example.com/client/v4/accounts/abc123/ai/v1",
      "https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1?x=1",
    ]) {
      await expect(testProviderKey("cloudflare", "test-token", url, model)).rejects.toBeInstanceOf(
        AiKeyError,
      );
    }
    expect(requested).toBe(false);
  });

  test("surfaces a quota error", async () => {
    globalThis.fetch = (async () =>
      Response.json({ error: { message: "quota exhausted" } }, { status: 429 })) as typeof fetch;
    await expect(testProviderKey("cloudflare", "test-token", endpoint, model)).rejects.toThrow(
      /quota/i,
    );
  });
});
