import { createFileRoute } from "@tanstack/react-router";
import { failure, repositoryParam, requireUser } from "@/lib/api-auth.server";
import { loadSnapshot } from "@/lib/mcp.server";
import { cleanMemoryPath } from "@/lib/analysis/memory-match";
import { safeEditPath } from "@/lib/analysis/generate";
import { verifyChange, type ProposedEdit } from "@/lib/analysis/verify.server";
import { ChangeError, generateChange } from "@/lib/workspace.server";

/**
 * POST { repository, action: "verify", edits }  checks edits you already have.
 * POST { repository, action: "generate", task, paths? } writes a change, checks it, repairs once.
 */
export const Route = createFileRoute("/api/change")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { userId, token } = await requireUser(request);
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const repository = repositoryParam(body["repository"]);

          if (body["action"] === "verify") {
            const raw = Array.isArray(body["edits"]) ? body["edits"] : [];
            if (!raw.length || raw.length > 40)
              return Response.json({ error: "Send between 1 and 40 file edits." }, { status: 400 });
            const edits: ProposedEdit[] = [];
            for (const item of raw as Record<string, unknown>[]) {
              const path = safeEditPath(typeof item["path"] === "string" ? item["path"] : "");
              const content = item["content"];
              if (!path || (content !== null && typeof content !== "string"))
                return Response.json(
                  { error: "Every edit needs a path and content." },
                  { status: 400 },
                );
              if (typeof content === "string" && content.length > 400_000)
                return Response.json({ error: `${path} is too large to check.` }, { status: 413 });
              edits.push({ path, content });
            }
            const snapshot = await loadSnapshot(userId, repository);
            return Response.json({ report: await verifyChange(snapshot.analysis, edits) });
          }

          if (body["action"] === "generate") {
            const paths = Array.isArray(body["paths"])
              ? (body["paths"] as unknown[]).map(cleanMemoryPath).filter(Boolean).slice(0, 6)
              : [];
            const result = await generateChange({
              userId,
              githubToken: token,
              repository,
              task: typeof body["task"] === "string" ? body["task"] : "",
              paths,
            });
            return Response.json(result);
          }
          return Response.json({ error: "Unknown action." }, { status: 400 });
        } catch (error) {
          if (error instanceof ChangeError)
            return Response.json(
              { error: error.message, needsKey: error.needsKey },
              { status: error.status },
            );
          return failure(error);
        }
      },
    },
  },
});
