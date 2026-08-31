import { createFileRoute } from "@tanstack/react-router";
import { githubError, githubOrganizations, githubToken } from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/github/organizations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = githubToken(request);
          if (!token)
            return new Response(JSON.stringify({ error: "Connect GitHub first." }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
          return Response.json({ organizations: await githubOrganizations(token) });
        } catch (error) {
          return githubError(error);
        }
      },
    },
  },
});
