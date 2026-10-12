import { createFileRoute } from "@tanstack/react-router";
import { saveConnection, verifyState } from "@/lib/connectors/store.server";
import { exchangeSlackCode } from "@/lib/connectors/slack.server";
import { githubUser, requireGithubToken } from "@/lib/integrations/github";

const back = (request: Request, result: string, reason?: string) => {
  const url = new URL("/graph", request.url);
  url.searchParams.set("connector", result);
  if (reason) url.searchParams.set("reason", reason);
  return Response.redirect(url.toString(), 302);
};

export const Route = createFileRoute("/api/integrations/slack/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get("error"))
          return back(request, "slack-failed", params.get("error") ?? "denied");
        try {
          const user = await githubUser(requireGithubToken(request));
          const owner = verifyState(params.get("state") ?? "", "slack");
          if (!owner || owner !== String(user.id))
            return back(request, "slack-failed", "The sign-in link expired. Try again.");
          const redirect = new URL("/api/integrations/slack/callback", request.url).toString();
          const install = await exchangeSlackCode(params.get("code") ?? "", redirect);
          await saveConnection(owner, {
            kind: "slack",
            externalId: install.teamId,
            label: install.teamName,
            meta: { channel: install.channel },
            secrets: { accessToken: install.accessToken, webhookUrl: install.webhookUrl },
          });
          return back(request, "slack");
        } catch (error) {
          return back(
            request,
            "slack-failed",
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      },
    },
  },
});
