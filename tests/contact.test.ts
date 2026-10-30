import { describe, expect, test } from "bun:test";
import {
  CONTACT_EMAIL,
  CONTACT_TOPICS,
  REPLY_PROMISE,
  mailtoHref,
  replyPromiseText,
} from "../src/lib/contact";
import {
  CONTACT_RATE_LIMIT,
  composeNotification,
  confirmationCopy,
  deliverContactNotification,
  hashNetworkAddress,
  isContactReference,
  newContactReference,
  rateLimitDecision,
  requestNetworkAddress,
  validateContactInput,
} from "../src/lib/contact.server";

const good = {
  name: "Asha",
  email: "Asha@Example.com",
  topic: "Support",
  message: "The map does not open for my repository.",
};

describe("contact surface", () => {
  test("one address, four topics, and a promise per topic", () => {
    expect(CONTACT_EMAIL).toBe("sibaprasadpanda56@gmail.com");
    expect(CONTACT_TOPICS).toHaveLength(4);
    expect(Object.keys(REPLY_PROMISE).sort()).toEqual([...CONTACT_TOPICS].sort());
    expect(replyPromiseText("Partnerships")).toContain("3 business days");
    expect(replyPromiseText("Partnerships")).toContain("10 business days");
    expect(replyPromiseText("Privacy request")).toContain("30 days");
    expect(mailtoHref("Support")).toContain("sibaprasadpanda56@gmail.com");
    expect(mailtoHref("Support").startsWith("mailto:")).toBe(true);
  });
});

describe("contact validation", () => {
  test("accepts a complete message and normalises the address", () => {
    const result = validateContactInput(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("asha@example.com");
      expect(result.value.topic).toBe("Support");
    }
  });

  test("rejects a blank name, a bad address, an unknown topic and a short message", () => {
    expect(validateContactInput({ ...good, name: "  " }).ok).toBe(false);
    expect(validateContactInput({ ...good, email: "not-an-address" }).ok).toBe(false);
    expect(validateContactInput({ ...good, topic: "Sales" }).ok).toBe(false);
    expect(validateContactInput({ ...good, message: "short" }).ok).toBe(false);
  });

  test("a filled honeypot is dropped without revealing which field caught it", () => {
    const result = validateContactInput({ ...good, website: "https://spam.example" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toBe("Please send the form again.");
  });

  test("caps the stored message length", () => {
    const result = validateContactInput({ ...good, message: "x".repeat(9000) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.message.length).toBe(4000);
  });

  test("keeps a name on one line so it cannot forge a mail header", () => {
    const result = validateContactInput({ ...good, name: "Ada\r\nBcc: victim@example.com" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Ada Bcc: victim@example.com");
      expect(result.value.name).not.toMatch(/[\r\n]/);
      const notification = composeNotification({
        reference: "NYKST-ABCDEFGH",
        input: result.value,
        receivedAt: "2026-10-30T00:00:00.000Z",
      });
      expect(notification.subject).not.toMatch(/[\r\n]/);
    }
  });
});

describe("contact rate limit", () => {
  test("allows the first five messages from one sender", () => {
    for (let sent = 0; sent < CONTACT_RATE_LIMIT.maxPerSender; sent += 1) {
      expect(rateLimitDecision({ sender: sent, network: sent }).allowed).toBe(true);
    }
    const blocked = rateLimitDecision({
      sender: CONTACT_RATE_LIMIT.maxPerSender,
      network: 0,
    });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.reason).toContain(CONTACT_EMAIL);
  });

  test("blocks a network that has sent five messages even from new addresses", () => {
    const blocked = rateLimitDecision({
      sender: 0,
      network: CONTACT_RATE_LIMIT.maxPerNetwork,
    });
    expect(blocked.allowed).toBe(false);
  });
});

describe("contact reference and network hash", () => {
  test("references have one readable shape", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const reference = newContactReference();
      expect(isContactReference(reference)).toBe(true);
      expect(reference.startsWith("NYKST-")).toBe(true);
      seen.add(reference);
    }
    expect(seen.size).toBe(200);
    expect(isContactReference("NYKST-ABC")).toBe(false);
    expect(isContactReference("NYKST-ABC0DEFG")).toBe(false);
  });

  test("the raw network address is never the stored value", () => {
    const hash = hashNetworkAddress("203.0.113.9");
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[a-f0-9]+$/);
    expect(hash).not.toContain("203.0.113.9");
    expect(hashNetworkAddress("203.0.113.9")).toBe(hash);
    expect(hashNetworkAddress("203.0.113.10")).not.toBe(hash);
  });

  test("reads the caller address from the standard proxy headers", () => {
    expect(
      requestNetworkAddress(new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" })),
    ).toBe("198.51.100.7");
    expect(requestNetworkAddress(new Headers({ "cf-connecting-ip": "198.51.100.8" }))).toBe(
      "198.51.100.8",
    );
    expect(requestNetworkAddress(new Headers())).toBe("unknown");
  });
});

describe("contact notification", () => {
  const notification = {
    reference: "NYKST-ABCDEFGH",
    input: {
      name: "Asha",
      email: "asha@example.com",
      topic: "Partnerships" as const,
      message: "We would like to integrate Nykst with our review tool.",
    },
    receivedAt: "2026-10-29T10:00:00.000Z",
  };

  test("the owner notification carries the reference and the promise", () => {
    const composed = composeNotification(notification);
    expect(composed.subject).toContain("NYKST-ABCDEFGH");
    expect(composed.replyTo).toBe("asha@example.com");
    expect(composed.text).toContain("3 business days");
    expect(composed.text).toContain("10 business days");
  });

  test("an unconfigured transport is reported as not configured, never as sent", async () => {
    const result = await deliverContactNotification({ env: {}, notification });
    expect(result.status).toBe("not_configured");
    expect(confirmationCopy("Support", result.status)).toContain(CONTACT_EMAIL);
    expect(confirmationCopy("Support", result.status)).not.toContain("with us");
  });

  test("a configured relay receives one message for the single address", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const result = await deliverContactNotification({
      env: {
        CONTACT_MAIL_ENDPOINT: "https://relay.example/send",
        CONTACT_MAIL_TOKEN: "relay-token",
        CONTACT_MAIL_FROM: "Nykst <hello@nykst.example>",
      },
      notification,
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        captured = {
          url: String(url),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        };
        return new Response("ok", { status: 200 });
      }) as typeof fetch,
    });
    expect(result.status).toBe("sent");
    expect(captured!.url).toBe("https://relay.example/send");
    expect(captured!.body["to"]).toBe(CONTACT_EMAIL);
    expect(captured!.body["reference"]).toBe("NYKST-ABCDEFGH");
    expect(captured!.body["topic"]).toBe("Partnerships");
    expect(confirmationCopy("Partnerships", result.status)).toContain("3 business days");
  });

  test("a failing relay is reported as failed and the visitor gets an email action", async () => {
    const result = await deliverContactNotification({
      env: {
        CONTACT_MAIL_ENDPOINT: "https://relay.example/send",
        CONTACT_MAIL_FROM: "Nykst <hello@nykst.example>",
      },
      notification,
      fetchImpl: (async () => new Response("nope", { status: 500 })) as typeof fetch,
    });
    expect(result.status).toBe("failed");
    const copy = confirmationCopy("Support", result.status);
    expect(copy).toContain(CONTACT_EMAIL);
    expect(copy).toContain("did not go through");
  });

  test("a thrown relay request never surfaces its detail to the visitor copy", async () => {
    const result = await deliverContactNotification({
      env: {
        CONTACT_MAIL_ENDPOINT: "https://relay.example/send",
        CONTACT_MAIL_FROM: "Nykst <hello@nykst.example>",
      },
      notification,
      fetchImpl: (async () => {
        throw new Error("relay refused the connection");
      }) as typeof fetch,
    });
    expect(result.status).toBe("failed");
    expect(confirmationCopy("Support", result.status)).not.toContain("refused the connection");
  });
});
