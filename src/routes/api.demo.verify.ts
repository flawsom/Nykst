import { createFileRoute } from "@tanstack/react-router";
import { safeEditPath } from "@/lib/analysis/generate";
import type { RepoAnalysis } from "@/lib/analysis/types";
import { verifyChange, type ProposedEdit } from "@/lib/analysis/verify.server";

/** Runs the real checker against the public example snapshot. No sign-in, nothing is stored. */
let cached: Promise<RepoAnalysis> | null = null;
function demoAnalysis() {
  // Bundled with the server: a Worker cannot fetch its own public origin.
  cached ??= import("../../public/demo/snapshot.json").then(
    (module) =>
      (module.default as unknown as { payload: { analysis: RepoAnalysis } }).payload.analysis,
  );
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
          const analysis = await demoAnalysis();
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
