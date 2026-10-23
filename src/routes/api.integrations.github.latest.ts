import { createFileRoute } from "@tanstack/react-router";
import { githubError, githubUser, json, requireGithubToken } from "@/lib/integrations/github";
import { latestIngestion, listIngestedWorkspaces } from "@/lib/integrations/ingestions.server";
import { parseRepoSlug } from "@/lib/code-links";
import { ingestionTopic } from "@/lib/realtime";

/**
 * The workspace endpoint. Without `?repo=` it returns the newest analysis, which
 * is what the page shows on first load. With `?repo=owner/name` (or `?snapshotId=<uuid>`)
 * it returns that repository's newest snapshot, so the switcher can move the whole dashboard.
 */
export const Route = createFileRoute("/api/integrations/github/latest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = requireGithubToken(request);
          const user = await githubUser(token);
          const url = new URL(request.url);
          const requested = parseRepoSlug(url.searchParams.get("repo"))?.slug ?? null;
          const snapshotId = url.searchParams.get("snapshotId")?.trim() || null;
          const [ingestion, repositories] = await Promise.all([
            latestIngestion(String(user.id), requested, snapshotId),
            listIngestedWorkspaces(String(user.id)),
          ]);
          const active = ingestion?.repository_full_name ?? requested ?? null;
          return json({
            ingestion,
            repositories,
            ingestedRepositories: repositories,
            active,
            realtime: { topic: ingestionTopic(user.id) },
          });
        } catch (error) {
          return githubError(error);
        }
      },
    },
  },
});
