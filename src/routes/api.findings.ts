import { createFileRoute } from "@tanstack/react-router";
import { failure, repositoryParam, requireUser } from "@/lib/api-auth.server";
import { dismissFinding, listFindingStates } from "@/lib/memory.server";

/** Lifecycle of findings (open, resolved, dismissed, times they came back). The findings
 * themselves are part of the analysis snapshot. */
export const Route = createFileRoute("/api/findings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { userId } = await requireUser(request);
          const repository = repositoryParam(new URL(request.url).searchParams.get("repository"));
          return Response.json({ states: await listFindingStates(userId, repository) });
        } catch (error) {
          return failure(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const { userId } = await requireUser(request);
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const repository = repositoryParam(body["repository"]);
          const signature = typeof body["signature"] === "string" ? body["signature"] : "";
          if (!signature)
            return Response.json({ error: "A finding id is required." }, { status: 400 });
          const note = typeof body["note"] === "string" ? body["note"] : "";
          await dismissFinding(userId, repository, signature, note, body["dismissed"] !== false);
          return Response.json({ ok: true });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
