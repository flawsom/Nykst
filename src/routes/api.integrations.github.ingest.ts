import { createFileRoute } from "@tanstack/react-router";
import {
  githubError,
  githubUser,
  ingestGithubRepository,
  json,
  requireGithubToken,
  saveIngestion,
  type IngestStage,
} from "@/lib/integrations/github";

/**
 * Streams newline-delimited JSON so the browser can show what is really happening:
 *   {"type":"progress","stage":"source","detail":"412 files"}
 *   {"type":"done","ingestionId":"…","summary":{…}}
 *   {"type":"error","error":"…"}
 */
export const Route = createFileRoute("/api/integrations/github/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let token: string;
        let owner: string | undefined;
        let repo: string | undefined;
        try {
          token = requireGithubToken(request);
          const body = (await request.json()) as { owner?: string; repo?: string };
          owner = body.owner;
          repo = body.repo;
          if (!owner || !repo)
            return json({ error: "Repository owner and name are required." }, { status: 400 });
        } catch (error) {
          return githubError(error);
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: Record<string, unknown>) =>
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            try {
              const user = await githubUser(token);
              const payload = await ingestGithubRepository(
                token,
                owner!,
                repo!,
                (stage: IngestStage, detail?: string) =>
                  send({ type: "progress", stage, ...(detail ? { detail } : {}) }),
              );
              send({ type: "progress", stage: "saving" });
              const ingestionId = await saveIngestion(user, payload);
              send({
                type: "done",
                ingestionId,
                repository: payload.repository.full_name,
                summary: {
                  ...payload.summary,
                  analyzed_files: payload.analysis.stats.analyzedFiles,
                  import_edges: payload.analysis.stats.internalEdges,
                  findings: payload.findings.length,
                },
              });
            } catch (error) {
              const message =
                error instanceof Response
                  ? ((await error.json().catch(() => null)) as { error?: string } | null)?.error
                  : error instanceof Error
                    ? error.message
                    : undefined;
              send({ type: "error", error: message ?? "Analysis failed. Please try again." });
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
