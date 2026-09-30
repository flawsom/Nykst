import { createFileRoute } from "@tanstack/react-router";
import {
  exchangeGithubCode,
  githubCookieOptions,
  githubRedirectUri,
  githubUser,
  oauthCookieOptions,
  verifyOauthState,
} from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        // Usually a refreshed or reopened old callback URL: send the user back to try again
        // instead of leaving them on a dead error page.
        if (!code || !state || !verifyOauthState(state)) {
          return new Response(null, { status: 302, headers: { Location: "/?github=expired" } });
        }
        try {
          const token = await exchangeGithubCode(code, githubRedirectUri(request));
          await githubUser(token);
          const headers = new Headers({ Location: "/?github=connected" });
          headers.append(
            "Set-Cookie",
            `nykst_github_token=${encodeURIComponent(token)}; Path=/; ${githubCookieOptions.join("; ")}`,
          );
          headers.append(
            "Set-Cookie",
            `nykst_github_oauth_state=; Path=/; Max-Age=0; ${oauthCookieOptions.join("; ")}`,
          );
          return new Response(null, { status: 302, headers });
        } catch (error) {
          const message = error instanceof Error ? error.message : "GitHub authorization failed.";
          return new Response(null, {
            status: 302,
            headers: {
              Location: `/?github=failed&reason=${encodeURIComponent(message.slice(0, 200))}`,
            },
          });
        }
      },
    },
  },
});
