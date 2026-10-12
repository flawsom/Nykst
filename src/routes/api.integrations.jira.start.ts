import { createFileRoute } from "@tanstack/react-router";
import { signState } from "@/lib/connectors/store.server";
import { jiraAuthorizeUrl } from "@/lib/connectors/jira.server";
import { githubUser, requireGithubToken } from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/jira/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!process.env["JIRA_CLIENT_ID"])
          return new Response("Jira is not configured on this server yet.", { status: 503 });
        try {
          const user = await githubUser(requireGithubToken(request));
          const redirect = new URL("/api/integrations/jira/callback", request.url).toString();
          return Response.redirect(
            jiraAuthorizeUrl(signState(String(user.id), "jira"), redirect),
            302,
          );
        } catch (error) {
          if (error instanceof Response) return error;
          return new Response("Connect GitHub first, then connect Jira.", { status: 401 });
        }
      },
    },
  },
});
