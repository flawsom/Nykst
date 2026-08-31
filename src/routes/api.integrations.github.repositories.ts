import { createFileRoute } from "@tanstack/react-router";
import { githubError, githubRepositories, githubToken } from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/github/repositories")({
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
          const org = new URL(request.url).searchParams.get("org");
          if (!org)
            return new Response(JSON.stringify({ error: "Organization is required." }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
          return Response.json({ repositories: await githubRepositories(token, org) });
        } catch (error) {
          return githubError(error);
        }
      },
    },
  },
});
