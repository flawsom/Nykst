import { describe, expect, test } from "bun:test";
import { CONTACT_EMAIL } from "../src/lib/contact";
import {
  composeContactConfirmation,
  composeGithubSignIn,
  describeUserAgent,
} from "../src/lib/email/messages";
import { deliverContactConfirmation, deliverGithubSignIn } from "../src/lib/email/deliver.server";
import { sendResendEmail } from "../src/lib/resend.server";
import { GITHUB_OAUTH_SCOPES, pickGithubEmail } from "../src/lib/integrations/github";

const FROM = "Nykst <contact@nykst.example>";
const KEY = "re_test_fixture";
const RECEIVED_AT = "2026-10-30T06:30:00.000Z";
const REFERENCE = "NYKST-ABCDEFGH";

const contact = {
  reference: REFERENCE,
  input: {
    name: "Asha",
    email: "asha@example.com",
    topic: "Support" as const,
    message: "The map does not open for my repository.",
  },
  receivedAt: RECEIVED_AT,
};

describe("transactional email content", () => {
  test("the form receipt carries the reference, the message and the promise", () => {
    const composed = composeContactConfirmation(contact);
    expect(composed.subject).toContain(REFERENCE);
    expect(composed.text).toContain("The map does not open");
    expect(composed.text).toContain("2 business days");
    expect(composed.text).toContain("30 days");
    expect(composed.html).toContain("<!doctype html>");
    expect(composed.html).toContain(REFERENCE);
    expect(composed.html).toContain("Open Nykst");
    expect(composed.html).toContain("https://nykst.unifies.codes/privacy");
    expect(composed.html).toContain("This is your receipt");
    expect(composed.html).toContain("#A31C1B");
    expect(composed.html).toContain('bgcolor="#C7B99B"');
    expect(composed.html).toContain("color:#06110C");
    expect(composed.html).toContain("border-left:2px solid #A31C1B");
    expect(composed.html).not.toContain("color:#C7B99B");
    expect(composed.html).toContain("know what your next change will touch");
  });

  test("user data is escaped in HTML and remains readable in the text part", () => {
    const composed = composeContactConfirmation({
      ...contact,
      input: {
        ...contact.input,
        name: "Asha <Admin>",
        message: "First line\n<script>alert('x')</script> & details",
      },
    });
    expect(composed.html).toContain("Asha &lt;Admin&gt;");
    expect(composed.html).not.toContain("<script>alert");
    expect(composed.html).toContain("&lt;script&gt;alert");
    expect(composed.html).toContain("First line<br />");
    expect(composed.text).toContain("<script>alert('x')</script>");
  });

  test("the GitHub notice describes the browser without leaking the raw user agent", () => {
    const composed = composeGithubSignIn({
      email: "ada@example.com",
      user: { id: 1, login: "ada", name: "Ada Lovelace" },
      signedInAt: RECEIVED_AT,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    });
    expect(composed.subject).toBe("New sign-in to Nykst");
    expect(composed.text).toContain("Chrome on Windows");
    expect(composed.text).toContain("@ada");
    expect(composed.html).toContain("Review GitHub security settings");
    expect(composed.html).toContain("https://github.com/settings/security");
    expect(composed.html).toContain("If this wasn&#39;t you");
    expect(composed.html).not.toContain("Mozilla/5.0");
    expect(composed.html).not.toContain("Chrome/131");
  });

  test("browser descriptions are coarse, stable and human readable", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0",
      ),
    ).toBe("Microsoft Edge on Windows");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      ),
    ).toBe("Safari on macOS");
    expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/133.0")).toBe(
      "Firefox on Linux",
    );
    expect(describeUserAgent("curl/8.7.1")).toBe("A command-line client");
    expect(describeUserAgent(null)).toBe("Unknown browser");
  });
});

describe("transactional delivery", () => {
  test("the form receipt goes to the sender, with HTML and a stable idempotency key", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const result = await deliverContactConfirmation({
      env: { RESEND_API_KEY: KEY, CONTACT_MAIL_FROM: FROM },
      notification: contact,
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        seen = { url: String(url), init };
        return Response.json({ id: "email_fixture" });
      }) as typeof fetch,
    });

    expect(result.status).toBe("sent");
    expect(seen!.url).toBe("https://api.resend.com/emails");
    const headers = new Headers(seen!.init?.headers);
    expect(headers.get("idempotency-key")).toBe(`contact-receipt-${REFERENCE}`);
    const body = JSON.parse(String(seen!.init?.body)) as Record<string, unknown>;
    expect(body["to"]).toEqual(["asha@example.com"]);
    expect(body["reply_to"]).toEqual([CONTACT_EMAIL]);
    expect(body["text"]).toContain(REFERENCE);
    expect(String(body["html"])).toContain("<!doctype html>");
  });

  test("the GitHub notice goes to the verified address, not the owner fallback", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const result = await deliverGithubSignIn({
      env: { RESEND_API_KEY: KEY, CONTACT_MAIL_FROM: FROM },
      signIn: {
        email: "ada@example.com",
        user: { id: 7, login: "ada", name: "Ada" },
        signedInAt: RECEIVED_AT,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0 Safari/537.36",
      },
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        seen = { url: String(url), init };
        return Response.json({ id: "email_fixture" });
      }) as typeof fetch,
    });

    expect(result.status).toBe("sent");
    const headers = new Headers(seen!.init?.headers);
    expect(headers.get("idempotency-key")).toMatch(/^github-signin-7-\d+$/);
    const body = JSON.parse(String(seen!.init?.body)) as Record<string, unknown>;
    expect(body["to"]).toEqual(["ada@example.com"]);
    expect(body["subject"]).toBe("New sign-in to Nykst");
    expect(body["reply_to"]).toEqual([CONTACT_EMAIL]);
  });

  test("a missing GitHub address skips delivery instead of falling back to the owner", async () => {
    let called = false;
    const result = await deliverGithubSignIn({
      env: { RESEND_API_KEY: KEY, CONTACT_MAIL_FROM: FROM },
      signIn: {
        email: "   ",
        user: { id: 7, login: "ada" },
        signedInAt: RECEIVED_AT,
      },
      fetchImpl: (async () => {
        called = true;
        return Response.json({ id: "unexpected" });
      }) as typeof fetch,
    });
    expect(result.status).toBe("not_configured");
    expect(called).toBe(false);
  });

  test("an invalid recipient fails before any provider request", async () => {
    let called = false;
    const result = await sendResendEmail({
      env: { RESEND_API_KEY: KEY, CONTACT_MAIL_FROM: FROM },
      subject: "Hi",
      body: "There",
      to: "not-an-address",
      fetchImpl: (async () => {
        called = true;
        return Response.json({ id: "unexpected" });
      }) as typeof fetch,
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toBe("A valid recipient email is required.");
    expect(called).toBe(false);
  });

  test("a CRLF subject is flattened before it reaches the provider", async () => {
    let seen: RequestInit | undefined;
    const result = await sendResendEmail({
      env: { RESEND_API_KEY: KEY, CONTACT_MAIL_FROM: FROM },
      subject: "Hello\r\nBcc: victim@example.com",
      body: "There",
      to: "asha@example.com",
      fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
        seen = init;
        return Response.json({ id: "email_fixture" });
      }) as typeof fetch,
    });
    expect(result.status).toBe("sent");
    const body = JSON.parse(String(seen?.body)) as Record<string, unknown>;
    expect(body["subject"]).toBe("Hello Bcc: victim@example.com");
    expect(String(body["subject"])).not.toMatch(/[\r\n]/);
  });
});

describe("GitHub email selection", () => {
  test("prefers a verified primary address and never mails an unverified one", () => {
    expect(
      pickGithubEmail(
        [
          { email: "secondary@example.com", verified: true },
          { email: "primary@example.com", verified: true, primary: true },
        ],
        "public@example.com",
      ),
    ).toBe("primary@example.com");
    expect(
      pickGithubEmail([{ email: "unverified@example.com", verified: false }], "public@example.com"),
    ).toBe("public@example.com");
    expect(pickGithubEmail([], null)).toBeNull();
    expect(pickGithubEmail([], "not-an-address")).toBeNull();
  });

  test("the OAuth app asks for the email scope", () => {
    expect(GITHUB_OAUTH_SCOPES.split(",")).toContain("user:email");
  });
});
