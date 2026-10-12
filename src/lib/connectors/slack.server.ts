import { createHmac, timingSafeEqual } from "node:crypto";

const env = (name: string) => process.env[name]?.trim() ?? "";

export function slackAuthorizeUrl(state: string, redirectUri: string) {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", env("SLACK_CLIENT_ID"));
  url.searchParams.set("scope", "commands,incoming-webhook");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export interface SlackInstall {
  teamId: string;
  teamName: string;
  accessToken: string;
  webhookUrl: string;
  channel: string;
}

export async function exchangeSlackCode(code: string, redirectUri: string): Promise<SlackInstall> {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("SLACK_CLIENT_ID"),
      client_secret: env("SLACK_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    access_token?: string;
    team?: { id?: string; name?: string };
    incoming_webhook?: { url?: string; channel?: string };
  } | null;
  if (!data?.ok || !data.team?.id)
    throw new Error(
      `Slack did not accept the sign-in${data?.error ? ` (${data.error})` : ""}. Try connecting again.`,
    );
  if (!data.incoming_webhook?.url)
    throw new Error(
      "Slack did not return a channel. Connect again and choose a channel to post to.",
    );
  return {
    teamId: data.team.id,
    teamName: data.team.name ?? data.team.id,
    accessToken: data.access_token ?? "",
    webhookUrl: data.incoming_webhook.url,
    channel: data.incoming_webhook.channel ?? "",
  };
}

/** Slack signs every request: v0=HMAC_SHA256(secret, "v0:<timestamp>:<body>"). */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
  now = Date.now(),
) {
  if (!signingSecret || !timestamp || !signature) return false;
  const age = Math.abs(now / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;
  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function postToSlack(webhookUrl: string, text: string) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok)
    throw new Error("Slack rejected the message. Reconnect Slack and choose the channel again.");
}
