import { createFileRoute } from "@tanstack/react-router";
import { saveConnection, verifyState } from "@/lib/connectors/store.server";
import { exchangeJiraCode } from "@/lib/connectors/jira.server";
import { githubUser, requireGithubToken } from "@/lib/integrations/github";

const back = (request: Request, result: string, reason?: string) => {
  const url = new URL("/graph", request.url);
  url.searchParams.set("connector", result);
  if (reason) url.searchParams.set("reason", reason);
  return Response.redirect(url.toString(), 302);
};

export const Route = createFileRoute("/api/integrations/jira/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get("error"))
          return back(request, "jira-failed", params.get("error") ?? "denied");
        try {
          const user = await githubUser(requireGithubToken(request));
          const owner = verifyState(params.get("state") ?? "", "jira");
          if (!owner || owner !== String(user.id))
            return back(request, "jira-failed", "The sign-in link expired. Try again.");
          const redirect = new URL("/api/integrations/jira/callback", request.url).toString();
          const { tokens, site } = await exchangeJiraCode(params.get("code") ?? "", redirect);
          await saveConnection(owner, {
            kind: "jira",
            externalId: site.id,
            label: site.name,
            meta: { url: site.url },
            secrets: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? "" },
            expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
          });
          return back(request, "jira");
        } catch (error) {
          return back(
            request,
            "jira-failed",
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      },
    },
  },
});
