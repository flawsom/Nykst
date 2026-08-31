import { createFileRoute } from "@tanstack/react-router";
import {
  githubAccessibleRepositories,
  githubError,
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
          return json({ repositories, count: repositories.length });
        } catch (error) {
          if (error instanceof Response) return error;
          return githubError(error);
        }
      },
    },
  },
});
