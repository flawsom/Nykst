import { createFileRoute } from "@tanstack/react-router";
import {
  githubError,
  ingestGithubRepository,
  json,
  requireGithubToken,
  saveIngestion,
} from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/github/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = requireGithubToken(request);
          const body = (await request.json()) as { owner?: string; repo?: string };
          if (!body.owner || !body.repo)
            return json({ error: "Repository owner and name are required." }, { status: 400 });
          const payload = await ingestGithubRepository(token, body.owner, body.repo);
          const user = await (await import("@/lib/integrations/github")).githubUser(token);
          const ingestionId = await saveIngestion(user, payload);
          return json({ ingestionId, ...payload });
        } catch (error) {
          return githubError(error);
        }
      },
    },
  },
});
