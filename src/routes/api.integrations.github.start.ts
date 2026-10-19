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
          // A missing client secret (or a bad configuration) should land the visitor back on
          // the landing page with a readable notice, not on a bare 503 text response.
          console.error("GitHub OAuth start failed:", error);
          return new Response(null, {
            status: 302,
            headers: { Location: "/?github=failed&reason=oauth_not_configured" },
          });
        }
      },
    },
  },
});
