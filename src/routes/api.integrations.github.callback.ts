import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import {
  exchangeGithubCode,
  githubCookieOptions,
  githubRedirectUri,
  githubUser,
  oauthCookieOptions,
  readCookie,
} from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const savedState = readCookie(request, "nykst_github_oauth_state");
        if (
          !code ||
          !state ||
          !savedState ||
          createHash("sha256").update(savedState).digest("hex") !== state
        ) {
          return new Response("Invalid or expired GitHub OAuth state.", { status: 400 });
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
          return new Response(
            error instanceof Error ? error.message : "GitHub authorization failed.",
            { status: 502 },
          );
        }
      },
    },
  },
});
