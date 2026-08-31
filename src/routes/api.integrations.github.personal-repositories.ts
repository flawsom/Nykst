import { createFileRoute } from "@tanstack/react-router";
import {
  githubError,
  githubUserRepositories,
  json,
  requireGithubToken,
} from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/github/personal-repositories")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = requireGithubToken(request);
          return json({ repositories: await githubUserRepositories(token) });
        } catch (error) {
          if (error instanceof Response) return error;
          return githubError(error);
        }
      },
    },
  },
});
