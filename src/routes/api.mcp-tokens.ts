import { createFileRoute } from "@tanstack/react-router";
import { githubError, githubUser, json, requireGithubToken } from "@/lib/integrations/github";
import { createAccessToken, listAccessTokens, revokeAccessToken } from "@/lib/mcp.server";

export const Route = createFileRoute("/api/mcp-tokens")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await githubUser(requireGithubToken(request));
          return json({ tokens: await listAccessTokens(user.id) });
        } catch (error) {
          if (error instanceof Response) return error;
          return githubError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await githubUser(requireGithubToken(request));
          const body = (await request.json().catch(() => ({}))) as { label?: unknown };
          const label = typeof body.label === "string" ? body.label.trim() : "";
          const { token, record } = await createAccessToken(user, label);
          return json({ token, record });
        } catch (error) {
          if (error instanceof Response) return error;
          return githubError(error);
        }
      },
      DELETE: async ({ request }) => {
        try {
          const user = await githubUser(requireGithubToken(request));
          const id = new URL(request.url).searchParams.get("id") ?? "";
          if (!/^[0-9a-f-]{36}$/i.test(id))
            return json({ error: "A token id is required." }, { status: 400 });
          await revokeAccessToken(user.id, id);
          return json({ revoked: true });
        } catch (error) {
          if (error instanceof Response) return error;
          return githubError(error);
        }
      },
    },
  },
});
