import { createFileRoute } from "@tanstack/react-router";
import { githubError, githubFileEvidence, githubToken, json } from "@/lib/integrations/github";
import { isSelfRepository, parseRepoSlug } from "@/lib/code-links";
import { loadCodeEvidence } from "@/lib/integrations/evidence.server";

function clean(value: string | null, max: number) {
  return (value ?? "").trim().slice(0, max);
}

/**
 * Source behind every click-to-code citation.
 *
 * `?repo=owner/name&path=src/x.ts&line=34` returns the +/- 20 line window, the
 * exact line, and the GitHub `#L34` and editor deep links. The same endpoint
 * still answers `?owner=&repo=&path=&branch=` with the full history dossier the
 * node inspector renders.
 */
export const Route = createFileRoute("/api/integrations/github/file-evidence")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const token = githubToken(request);
          const slug = parseRepoSlug(
            url.searchParams.get("repo"),
            clean(url.searchParams.get("owner"), 100),
          );
          const path = clean(url.searchParams.get("path"), 300);
          const ref = clean(
            url.searchParams.get("ref") ??
              url.searchParams.get("branch") ??
              url.searchParams.get("sha"),
            100,
          );
          const lineParam = Number.parseInt(clean(url.searchParams.get("line"), 12), 10);
          const line = Number.isFinite(lineParam) && lineParam > 0 ? lineParam : null;
          const radiusParam = Number.parseInt(clean(url.searchParams.get("context"), 4), 10);
          const radius =
            Number.isFinite(radiusParam) && radiusParam > 0 ? Math.min(radiusParam, 80) : 20;

          if (!slug || !path || path.includes("..")) {
            return json(
              { error: "A safe GitHub repository and file path are required." },
              { status: 400 },
            );
          }

          const evidence = await loadCodeEvidence({
            token: token ?? null,
            repository: slug.slug,
            path,
            ref: ref || null,
            line,
            radius,
          });
          if (!evidence) {
            return json(
              {
                error: `Could not read ${slug.slug}/${path}. Connect GitHub for private repositories.`,
              },
              { status: 404 },
            );
          }

          // The full history dossier costs ~40 API calls, so only build it when the
          // caller actually wants the inspector panel and not a single line jump.
          const wantsHistory = line === null || url.searchParams.get("full") === "1";
          let history: Partial<Awaited<ReturnType<typeof githubFileEvidence>>> = {};
          if (wantsHistory && token && !isSelfRepository(slug.slug)) {
            try {
              history = await githubFileEvidence(token, slug.owner, slug.repo, path, ref || "main");
            } catch {
              // The source window above is already real evidence; history is additive.
            }
          }

          return json({
            evidence: {
              ...history,
              ...evidence,
              repository: slug.slug,
              sha: history.sha ?? evidence.sha,
              dependents: history.dependents ?? [],
              commits: history.commits ?? [],
              pullRequests: history.pullRequests ?? [],
              coChange: history.coChange ?? [],
              blindSpots:
                history.blindSpots ??
                (evidence.source === "workspace"
                  ? [
                      "Served from the live workspace checkout; GitHub history is not queried for this file.",
                    ]
                  : []),
            },
          });
        } catch (error) {
          return githubError(error);
        }
      },
    },
  },
});
