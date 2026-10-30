import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { CONTACT_EMAIL } from "../src/lib/contact";
import { deliverContactNotification } from "../src/lib/contact.server";
import {
  fetchReceivedEmail,
  parseResendEvent,
  referenceFromSubject,
  sendResendEmail,
  verifyResendWebhook,
} from "../src/lib/resend.server";

const FROM = "Nykst <contact@nykst.example>";
const KEY = "re_test_fixture";

function sign(body: string, id = "msg_fixture", timestamp = String(Math.floor(Date.now() / 1000))) {
  const secret = Buffer.from("fixture-signing-secret").toString("base64");
  const signature = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return {
    headers: { id, timestamp, signature: `v1,${signature}` },
    secret: `whsec_${secret}`,
  };
}

describe("resend sending", () => {
  test("an unconfigured key is not_configured, never sent", async () => {
    const result = await sendResendEmail({ env: {}, subject: "Hi", body: "There" });
    expect(result.status).toBe("not_configured");
  });

  test("sends one plain text mail to the single product address", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init };
      return Response.json({ id: "email_fixture" });
    }) as typeof fetch;

    const result = await sendResendEmail({
      env: { RESEND_API_KEY: KEY, CONTACT_MAIL_FROM: FROM },
      subject: "[NYKST-ABCDEFGH] Support from Ada",
      body: "Message body",
      replyTo: "ada@example.com",
      fetchImpl,
    });

    expect(result.status).toBe("sent");
    expect(seen!.url).toBe("https://api.resend.com/emails");
    const headers = new Headers(seen!.init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(seen!.init?.body)) as Record<string, unknown>;
    expect(body["to"]).toEqual([CONTACT_EMAIL]);
    expect(body["from"]).toBe(FROM);
    expect(body["reply_to"]).toEqual(["ada@example.com"]);
    expect(body["text"]).toBe("Message body");
  });

  test("a provider refusal is failed and carries no body", async () => {
    const result = await sendResendEmail({
      env: { RESEND_API_KEY: KEY, CONTACT_MAIL_FROM: FROM },
      subject: "Hi",
      body: "There",
      fetchImpl: (async () =>
        new Response("invalid api key re_should_not_leak", { status: 401 })) as typeof fetch,
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toBe("Resend responded 401.");
    expect(JSON.stringify(result)).not.toContain("re_should_not_leak");
  });

  test("the contact path prefers Resend over the generic relay", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return Response.json({ id: "email_fixture" });
    }) as typeof fetch;

    const result = await deliverContactNotification({
      env: {
        RESEND_API_KEY: KEY,
        CONTACT_MAIL_FROM: FROM,
        CONTACT_MAIL_ENDPOINT: "https://relay.example/send",
      },
      notification: {
        reference: "NYKST-ABCDEFGH",
        input: {
          name: "Ada",
          email: "ada@example.com",
          topic: "Support",
          message: "Something is not quite right here.",
        },
        receivedAt: new Date().toISOString(),
      },
      fetchImpl,
    });

    expect(result.status).toBe("sent");
    expect(urls).toEqual(["https://api.resend.com/emails"]);
  });
});

describe("resend webhook verification", () => {
  const body = JSON.stringify({ type: "email.received", data: { email_id: "abc" } });

  test("accepts a correct signature and rejects a tampered body", () => {
    const { headers, secret } = sign(body);
    expect(verifyResendWebhook({ rawBody: body, headers, secret })).toBe(true);
    expect(verifyResendWebhook({ rawBody: `${body} `, headers, secret })).toBe(false);
    expect(verifyResendWebhook({ rawBody: body, headers, secret: null })).toBe(false);
    expect(
      verifyResendWebhook({
        rawBody: body,
        headers: { ...headers, signature: "v1,bm90aGluZw==" },
        secret,
      }),
    ).toBe(false);
  });

  test("rejects an old timestamp so a captured request cannot be replayed", () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const { headers, secret } = sign(body, "msg_fixture", old);
    expect(verifyResendWebhook({ rawBody: body, headers, secret })).toBe(false);
    expect(verifyResendWebhook({ rawBody: body, headers, secret, toleranceSeconds: null })).toBe(
      true,
    );
  });
});

describe("resend inbound mail", () => {
  test("parses the event and keeps the reference from the subject", () => {
    const event = parseResendEvent(
      JSON.stringify({
        type: "email.received",
        created_at: "2026-10-29T10:00:00.000Z",
        data: { email_id: "abc", subject: "Re: [NYKST-ABCDEFGH] Support" },
      }),
    );
    expect(event.type).toBe("email.received");
    expect(referenceFromSubject(event.data["subject"] as string)).toBe("NYKST-ABCDEFGH");
    expect(referenceFromSubject("Re: hello")).toBeNull();
  });

  test("fetches the body and reduces an HTML only mail to text", async () => {
    const email = await fetchReceivedEmail({
      env: { RESEND_API_KEY: KEY },
      emailId: "abc",
      fetchImpl: (async () =>
        Response.json({
          id: "abc",
          from: "ada@example.com",
          to: ["contact@nykst.example"],
          subject: "Re: [NYKST-ABCDEFGH] Support",
          text: null,
          html: "<p>Hello <strong>there</strong></p>",
          message_id: "<1@example.com>",
          created_at: "2026-10-29T10:00:00.000Z",
        })) as typeof fetch,
    });
    expect(email?.text).toBe("Hello there");
    expect(email?.from).toBe("ada@example.com");
  });

  test("drops style and script content and decodes entities from an HTML only mail", async () => {
    const email = await fetchReceivedEmail({
      env: { RESEND_API_KEY: KEY },
      emailId: "abc",
      fetchImpl: (async () =>
        Response.json({
          id: "abc",
          from: "ada@example.com",
          to: ["contact@nykst.example"],
          subject: "Re: [NYKST-ABCDEFGH] Support",
          text: null,
          html: "<style>.hidden{display:none}</style><script>alert('x')</script><p>Hello &amp; welcome</p>",
        })) as typeof fetch,
    });
    expect(email?.text).toBe("Hello & welcome");
  });

  test("a refused body fetch returns null instead of provider detail", async () => {
    const email = await fetchReceivedEmail({
      env: { RESEND_API_KEY: KEY },
      emailId: "abc",
      fetchImpl: (async () => new Response("nope", { status: 500 })) as typeof fetch,
    });
    expect(email).toBeNull();
  });
});
