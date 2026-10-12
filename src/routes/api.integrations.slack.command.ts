import { createFileRoute } from "@tanstack/react-router";
import { answerCommand } from "@/lib/connectors/format";
import { verifySlackSignature } from "@/lib/connectors/slack.server";
import { connectionByExternalId } from "@/lib/connectors/store.server";
import { loadSnapshot } from "@/lib/mcp.server";

/** Slash command endpoint: Slack posts /nykst … here. Every request must be signed by Slack. */
const reply = (text: string, inChannel = false) =>
  Response.json({ response_type: inChannel ? "in_channel" : "ephemeral", text });

export const Route = createFileRoute("/api/integrations/slack/command")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const ok = verifySlackSignature(
          process.env["SLACK_SIGNING_SECRET"]?.trim() ?? "",
          request.headers.get("x-slack-request-timestamp"),
          request.headers.get("x-slack-signature"),
          raw,
        );
        if (!ok) return new Response("Invalid signature", { status: 401 });
        const form = new URLSearchParams(raw);
        try {
          const connection = await connectionByExternalId("slack", form.get("team_id") ?? "");
          if (!connection)
            return reply(
              "This Slack workspace is not connected to Nykst. Connect it from the Nykst workspace.",
            );
          const text = (form.get("text") ?? "").trim();
          const repoMatch = /^repo:(\S+)\s*/i.exec(text);
          const snapshot = await loadSnapshot(connection.provider_user_id, repoMatch?.[1]);
          return reply(
            answerCommand(snapshot, repoMatch ? text.slice(repoMatch[0].length) : text),
            true,
          );
        } catch (error) {
          return reply(error instanceof Error ? error.message : "Nykst could not answer that.");
        }
      },
    },
  },
});
