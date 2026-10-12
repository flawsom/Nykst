import { createFileRoute } from "@tanstack/react-router";
import { signState } from "@/lib/connectors/store.server";
import { slackAuthorizeUrl } from "@/lib/connectors/slack.server";
import { githubUser, requireGithubToken } from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/slack/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!process.env["SLACK_CLIENT_ID"])
          return new Response("Slack is not configured on this server yet.", { status: 503 });
        try {
          const user = await githubUser(requireGithubToken(request));
          const redirect = new URL("/api/integrations/slack/callback", request.url).toString();
          return Response.redirect(
            slackAuthorizeUrl(signState(String(user.id), "slack"), redirect),
            302,
          );
        } catch (error) {
          if (error instanceof Response) return error;
          return new Response("Connect GitHub first, then connect Slack.", { status: 401 });
        }
      },
    },
  },
});
