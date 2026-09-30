import { createFileRoute } from "@tanstack/react-router";
import {
  githubAccessibleRepositories,
  githubError,
  githubInstallUrl,
  githubIsApp,
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
          // perRepository: access is granted per repository through the GitHub App.
          // manageUrl (needs the app slug) links to GitHub's repository picker.
          return json({
            repositories,
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
