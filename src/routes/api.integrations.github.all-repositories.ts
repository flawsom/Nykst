import { createFileRoute } from "@tanstack/react-router";
import {
  githubAccessibleRepositories,
  githubError,
  githubInstallUrl,
  githubIsApp,
  githubUser,
  json,
  requireGithubToken,
} from "@/lib/integrations/github";
import { listIngestedWorkspaces } from "@/lib/integrations/ingestions.server";

export const Route = createFileRoute("/api/integrations/github/all-repositories")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = requireGithubToken(request);
          const user = await githubUser(token);
          const [repositories, ingestedRepositories] = await Promise.all([
            githubAccessibleRepositories(token),
            listIngestedWorkspaces(String(user.id)).catch(() => []),
          ]);
          return json({
            repositories,
            ingestedRepositories,
            count: repositories.length,
            perRepository: githubIsApp(),
            manageUrl: githubInstallUrl(),
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return githubError(error);
        }
      },
    },
  },
});
