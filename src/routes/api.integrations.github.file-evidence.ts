import { createFileRoute } from "@tanstack/react-router";
import {
  githubError,
  githubFileEvidence,
  githubToken,
  githubUser,
  json,
} from "@/lib/integrations/github";
import {
  isSafeEvidencePath,
  isSelfRepository,
  parseRepoSlug,
  withoutContent,
} from "@/lib/code-links";
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

          if (!slug || !path || path.includes("..") || !isSafeEvidencePath(path)) {
            return json(
              { error: "A safe source or documentation file path is required." },
              { status: 400 },
            );
          }

          const self = isSelfRepository(slug.slug);
          if (!token && !self) {
            return json(
              { error: "Connect GitHub to read source for this repository." },
              { status: 401 },
            );
          }

          const wantsFull = url.searchParams.get("full") === "1";
          if (wantsFull && !token) {
            return json({ error: "Connect GitHub to preview the full file." }, { status: 401 });
          }
          if (wantsFull && token) {
            try {
              // A cookie is not proof of a working connection. Validate the token
              // before the self-workspace path can return a full file body.
              await githubUser(token);
            } catch {
              return json({ error: "Connect GitHub to preview the full file." }, { status: 401 });
            }
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
          const wantsHistory = line === null || wantsFull;
          let history: Partial<Awaited<ReturnType<typeof githubFileEvidence>>> = {};
          if (wantsHistory && token && !self) {
            try {
              history = await githubFileEvidence(token, slug.owner, slug.repo, path, ref || "main");
            } catch {
              // The source window above is already real evidence; history is additive.
            }
          }

          return json({
            evidence: {
              ...history,
              ...(wantsFull && token ? evidence : withoutContent(evidence)),
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
