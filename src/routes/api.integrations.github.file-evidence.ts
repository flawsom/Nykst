import { createFileRoute } from "@tanstack/react-router";
import { githubError, githubFileEvidence, json, requireGithubToken } from "@/lib/integrations/github";

function clean(value: string | null, max: number) {
  return (value ?? "").trim().slice(0, max);
}

export const Route = createFileRoute("/api/integrations/github/file-evidence")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = requireGithubToken(request);
          const url = new URL(request.url);
          const owner = clean(url.searchParams.get("owner"), 100);
          const repo = clean(url.searchParams.get("repo"), 100);
          const path = clean(url.searchParams.get("path"), 300);
          const branch = clean(url.searchParams.get("branch"), 100) || "main";
          if (!owner || !repo || !path || path.includes("..")) {
            return json({ error: "A safe GitHub repository file path is required." }, { status: 400 });
          }
          return json({ evidence: await githubFileEvidence(token, owner, repo, path, branch) });
        } catch (error) {
          return githubError(error);
        }
      },
    },
  },
});
