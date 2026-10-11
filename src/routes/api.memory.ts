import { createFileRoute } from "@tanstack/react-router";
import { cleanMemoryPath, isMemoryKind } from "@/lib/analysis/memory-match";
import { failure, repositoryParam, requireUser } from "@/lib/api-auth.server";
import { addMemory, deleteMemory, listMemory } from "@/lib/memory.server";

export const Route = createFileRoute("/api/memory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { userId } = await requireUser(request);
          const url = new URL(request.url);
          const repository = repositoryParam(url.searchParams.get("repository"));
          const path = cleanMemoryPath(url.searchParams.get("path"));
          return Response.json({
            notes: await listMemory(userId, repository, path ? [path] : undefined),
          });
        } catch (error) {
          return failure(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const { userId } = await requireUser(request);
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const repository = repositoryParam(body["repository"]);
          const kind = isMemoryKind(body["kind"]) ? body["kind"] : "note";
          const text = typeof body["body"] === "string" ? body["body"] : "";
          const note = await addMemory(userId, repository, {
            path: cleanMemoryPath(body["path"]),
            kind,
            body: text,
            source: "user",
          });
          return Response.json({ note });
        } catch (error) {
          if (error instanceof Error && /empty|at most/.test(error.message))
            return Response.json({ error: error.message }, { status: 400 });
          return failure(error);
        }
      },
      DELETE: async ({ request }) => {
        try {
          const { userId } = await requireUser(request);
          const id = new URL(request.url).searchParams.get("id") ?? "";
          if (!/^[0-9a-f-]{36}$/i.test(id))
            return Response.json({ error: "A note id is required." }, { status: 400 });
          await deleteMemory(userId, id);
          return Response.json({ deleted: true });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
