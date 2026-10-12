import { createFileRoute } from "@tanstack/react-router";
import {
  configured,
  deleteConnection,
  getConnection,
  type ConnectorKind,
} from "@/lib/connectors/store.server";
import { githubError, githubUser, json, requireGithubToken } from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/connectors")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await githubUser(requireGithubToken(request));
          const [slack, jira] = await Promise.all([
            getConnection(String(user.id), "slack").catch(() => null),
            getConnection(String(user.id), "jira").catch(() => null),
          ]);
          return json({
            configured: configured(),
            slack: slack ? { label: slack.label, channel: slack.meta["channel"] ?? "" } : null,
            jira: jira ? { label: jira.label, url: jira.meta["url"] ?? "" } : null,
          });
        } catch (error) {
          return githubError(error);
        }
      },
      DELETE: async ({ request }) => {
        try {
          const user = await githubUser(requireGithubToken(request));
          const kind = new URL(request.url).searchParams.get("kind");
          if (kind !== "slack" && kind !== "jira")
            return json({ error: "Unknown connector." }, { status: 400 });
          await deleteConnection(String(user.id), kind as ConnectorKind);
          return json({ disconnected: true });
        } catch (error) {
          return githubError(error);
        }
      },
    },
  },
});
