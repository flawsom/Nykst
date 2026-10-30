import { createFileRoute } from "@tanstack/react-router";
import {
  exchangeGithubCode,
  githubIsApp,
  githubCookieOptions,
  githubRedirectUri,
  githubUser,
  githubUserEmail,
  GITHUB_RETURN_TO_COOKIE,
  oauthCookieOptions,
  readCookie,
  safeGithubReturnTo,
  verifyOauthState,
} from "@/lib/integrations/github";
import { deliverGithubSignIn } from "@/lib/email/deliver.server";

export const Route = createFileRoute("/api/integrations/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const setupAction = url.searchParams.get("setup_action");
        // GitHub App installs: an org owner still has to approve the request.
        if (githubIsApp() && setupAction === "request")
          return new Response(null, { status: 302, headers: { Location: "/?github=requested" } });
        // Returning from choosing repositories on GitHub. The redirect carries a code only when
        // the app asks for user authorization during installation; otherwise sign in now.
        const fromInstall =
          githubIsApp() && (setupAction === "install" || setupAction === "update");
        if (fromInstall && !code)
          return new Response(null, {
            status: 302,
            headers: { Location: "/api/integrations/github/start" },
          });
        // Usually a refreshed or reopened old callback URL: send the user back to try again
        // instead of leaving them on a dead error page.
        if (!code || (!fromInstall && (!state || !verifyOauthState(state)))) {
          return new Response(null, { status: 302, headers: { Location: "/?github=expired" } });
        }
        try {
          const token = await exchangeGithubCode(code, githubRedirectUri(request));
          const user = await githubUser(token);

          // A security notice is best-effort. The signed-in session must not
          // fail because the mail provider is slow or unconfigured.
          try {
            const email = await githubUserEmail(token, user.email);
            if (email) {
              const delivery = await deliverGithubSignIn({
                env: process.env,
                signIn: {
                  email,
                  user,
                  signedInAt: new Date().toISOString(),
                  userAgent: request.headers.get("user-agent"),
                },
              });
              if (delivery.status === "failed")
                console.warn("[github-signin] notice not sent:", delivery.detail ?? "failed");
            }
          } catch (error) {
            // Never include the address, token or provider payload.
            console.warn(
              "[github-signin] notice skipped:",
              error instanceof Error ? error.name : "unknown",
            );
          }

          const returnTo = safeGithubReturnTo(readCookie(request, GITHUB_RETURN_TO_COOKIE));
          const headers = new Headers({ Location: returnTo ?? "/?github=connected" });
          headers.append(
            "Set-Cookie",
            `nykst_github_token=${encodeURIComponent(token)}; Path=/; ${githubCookieOptions.join("; ")}`,
          );
          headers.append(
            "Set-Cookie",
            `nykst_github_oauth_state=; Path=/; Max-Age=0; ${oauthCookieOptions.join("; ")}`,
          );
          headers.append(
            "Set-Cookie",
            `${GITHUB_RETURN_TO_COOKIE}=; Path=/; Max-Age=0; ${oauthCookieOptions.join("; ")}`,
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
