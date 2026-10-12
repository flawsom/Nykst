import { createFileRoute } from "@tanstack/react-router";
import { analysisFooter, impactLines, resolveFiles } from "@/lib/connectors/format";
import { postToSlack } from "@/lib/connectors/slack.server";
import { getConnection } from "@/lib/connectors/store.server";
import { githubError, githubUser, json, requireGithubToken } from "@/lib/integrations/github";
import { loadSnapshot } from "@/lib/mcp.server";

/** POST { query, repository? }: post what breaks if that code changes to the connected channel. */
export const Route = createFileRoute("/api/integrations/slack/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await githubUser(requireGithubToken(request));
          const body = (await request.json().catch(() => ({}))) as {
            query?: string;
            repository?: string;
          };
          const query = (body.query ?? "").trim();
          if (!query)
            return json({ error: "Say which file or folder to report on." }, { status: 400 });
          const connection = await getConnection(String(user.id), "slack");
          if (!connection) return json({ error: "Connect Slack first." }, { status: 409 });
          const snapshot = await loadSnapshot(String(user.id), body.repository);
          const paths = resolveFiles(snapshot.analysis, query);
          if (!paths.length)
            return json({ error: `No analyzed file matches "${query}".` }, { status: 404 });
          const text = [
            `*Nykst impact report*`,
            ...impactLines(snapshot, paths),
            analysisFooter(snapshot),
          ].join("\n");
          await postToSlack(connection.secrets["webhookUrl"]!, text);
          return json({ posted: true, channel: connection.meta["channel"] ?? "" });
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof Error && !/GitHub|token/i.test(error.message))
            return json({ error: error.message }, { status: 502 });
          return githubError(error);
        }
      },
    },
  },
});
