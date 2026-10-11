import { createFileRoute } from "@tanstack/react-router";
import { safeEditPath } from "@/lib/analysis/generate";
import type { RepoAnalysis } from "@/lib/analysis/types";
import { verifyChange, type ProposedEdit } from "@/lib/analysis/verify.server";

/** Runs the real checker against the public example snapshot. No sign-in, nothing is stored. */
let cached: Promise<RepoAnalysis> | null = null;
function demoAnalysis(origin: string) {
  cached ??= fetch(`${origin}/demo/snapshot.json`)
    .then((response) => {
      if (!response.ok) throw new Error("The example could not be loaded.");
      return response.json() as Promise<{ payload: { analysis: RepoAnalysis } }>;
    })
    .then((snapshot) => snapshot.payload.analysis)
    .catch((error) => {
      cached = null;
      throw error;
    });
  return cached;
}

export const Route = createFileRoute("/api/demo/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { edits?: unknown };
          const raw = Array.isArray(body.edits) ? (body.edits as Record<string, unknown>[]) : [];
          if (!raw.length || raw.length > 10)
            return Response.json({ error: "Send between 1 and 10 files." }, { status: 400 });
          const edits: ProposedEdit[] = [];
          for (const item of raw) {
            const path = safeEditPath(typeof item["path"] === "string" ? item["path"] : "");
            const content = item["content"];
            if (!path || (content !== null && typeof content !== "string"))
              return Response.json(
                { error: "Every file needs a path and content." },
                { status: 400 },
              );
            if (typeof content === "string" && content.length > 100_000)
              return Response.json(
                { error: `${path} is too large for the demo.` },
                { status: 413 },
              );
            edits.push({ path, content });
          }
          const analysis = await demoAnalysis(new URL(request.url).origin);
          return Response.json({ report: await verifyChange(analysis, edits) });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "The check failed." },
            { status: 500 },
          );
        }
      },
    },
  },
});
