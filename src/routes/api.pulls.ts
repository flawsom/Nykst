import { createFileRoute } from "@tanstack/react-router";
import { failure, repositoryParam, requireUser } from "@/lib/api-auth.server";
import { loadSnapshot } from "@/lib/mcp.server";
import { checkPull, freshness, listOpenPulls } from "@/lib/pulls.server";

/**
 * GET ?repository=owner/name -> { pulls, freshness, analysisCommit }
 * POST { repository, number } -> the pull request checked against the stored analysis.
 */
export const Route = createFileRoute("/api/pulls")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { userId, token } = await requireUser(request);
          const repository = repositoryParam(new URL(request.url).searchParams.get("repository"));
          const snapshot = await loadSnapshot(userId, repository).catch(() => null);
          const [pulls, fresh] = await Promise.all([
            listOpenPulls(token, repository),
            snapshot ? freshness(token, repository, snapshot.analysis.ref) : null,
          ]);
          return Response.json({
            pulls,
            freshness: fresh,
            analysisCommit: snapshot?.analysis.ref ?? null,
          });
        } catch (error) {
          return failure(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const { userId, token } = await requireUser(request);
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const repository = repositoryParam(body["repository"]);
          const number = body["number"];
          if (typeof number !== "number" || !Number.isInteger(number) || number < 1)
            return Response.json({ error: "Send a pull request number." }, { status: 400 });
          return Response.json(await checkPull({ userId, token, repository, number }));
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
