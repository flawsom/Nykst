import { createFileRoute } from "@tanstack/react-router";
import {
  createOauthState,
  githubAuthorizeUrl,
  oauthCookieOptions,
} from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/github/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { value, state } = createOauthState();
          const location = githubAuthorizeUrl(state, request);
          return new Response(null, {
            status: 302,
            headers: {
              Location: location,
              "Set-Cookie": `nykst_github_oauth_state=${encodeURIComponent(value)}; Path=/; ${oauthCookieOptions.join("; ")}`,
            },
          });
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : "GitHub OAuth is not configured",
            { status: 503 },
          );
        }
      },
    },
  },
});
