import { createFileRoute } from "@tanstack/react-router";
import { buildLoopRun } from "@/lib/analysis/loop.server";
import type { RepoAnalysis, RepoHistory } from "@/lib/analysis/types";
import { githubToken, githubUser, json } from "@/lib/integrations/github";
import { latestIngestion } from "@/lib/integrations/ingestions.server";
import type { RepositorySnapshot } from "@/lib/repository-graph";
import type { LoopScenarioId } from "@/lib/loop";
import { getSelfAnalysis } from "./api.analysis.self";

/**
 * POST /api/loop
 *
 * The server-side entry point of the four-stage closed loop. It loads the real
 * snapshot, runs the real in-memory overlay on the caller's proposal, and
 * returns the bounded envelope, verdict and verified remediation. Nothing is
 * written to disk, git or the database.
 */
export const Route = createFileRoute("/api/loop")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            path?: string;
            repo?: string;
            scenario?: LoopScenarioId;
            content?: string;
            snapshotId?: string;
          };
          const path = body.path?.trim();
          if (!path)
            return json(
              { error: "Pass the repository-relative `path` of an analyzed source file." },
              { status: 400 },
            );

          let repository = "flawsom/nykst";
          let analysis: RepoAnalysis;
          let history: RepoHistory | undefined;
          const token = githubToken(request) ?? null;

          if (token) {
            try {
              const user = await githubUser(token);
              const row = await latestIngestion(
                String(user.id),
                body.repo?.trim() || null,
                body.snapshotId?.trim() || null,
              );
              const payload = (row?.payload ?? null) as RepositorySnapshot | null;
              if (row && payload?.analysis) {
                repository = row.repository_full_name;
                analysis = payload.analysis;
                history = payload.history;
              } else {
                analysis = await getSelfAnalysis();
              }
            } catch {
              analysis = await getSelfAnalysis();
            }
          } else {
            analysis = await getSelfAnalysis();
          }

          const target = analysis.files.find((file) => file.path === path);
          if (!target)
            return json(
              {
                error: `The path ${path} is not an analyzed source file.`,
                suggestions: analysis.files
                  .filter((file) => file.path.includes(path.split("/").pop() ?? path))
                  .slice(0, 8)
                  .map((file) => file.path),
              },
              { status: 400 },
            );

          const run = await buildLoopRun(
            {
              repository_full_name: repository,
              created_at: analysis.generatedAt,
              analysis,
              history,
            },
            {
              path: target.path,
              ...(body.scenario ? { scenario: body.scenario } : {}),
              ...(body.content !== undefined ? { content: body.content } : {}),
              token,
            },
          );
          return json(run, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "The safe-code loop failed." },
            { status: 500 },
          );
        }
      },
    },
  },
});
