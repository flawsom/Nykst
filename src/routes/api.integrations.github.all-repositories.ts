import { createFileRoute } from "@tanstack/react-router";
import {
  githubAccessibleRepositories,
  githubError,
  githubInstallUrl,
  json,
  requireGithubToken,
} from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/github/all-repositories")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = requireGithubToken(request);
          const repositories = await githubAccessibleRepositories(token);
          // manageUrl is set when access is granted per repository through the GitHub App.
          return json({ repositories, count: repositories.length, manageUrl: githubInstallUrl() });
        } catch (error) {
          if (error instanceof Response) return error;
          return githubError(error);
        }
      },
    },
  },
});
