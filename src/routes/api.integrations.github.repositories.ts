import { createFileRoute } from "@tanstack/react-router";
import {
  githubAccessibleRepositories,
  githubError,
  githubRepositories,
  githubToken,
  githubUser,
} from "@/lib/integrations/github";
import { listIngestedWorkspaces } from "@/lib/integrations/ingestions.server";

function clean(value: string | null, max: number) {
  return (value ?? "").trim().slice(0, max);
}

type RepoLike = {
  id?: number;
  name?: string;
  full_name?: string;
  private?: boolean;
  default_branch?: string;
  description?: string | null;
  html_url?: string;
  updated_at?: string;
  owner?: { login?: string };
};

export const Route = createFileRoute("/api/integrations/github/repositories")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = githubToken(request);
          if (!token)
            return new Response(JSON.stringify({ error: "Connect GitHub first." }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
          const url = new URL(request.url);
          const org = clean(url.searchParams.get("org"), 100);
          const query = clean(url.searchParams.get("q"), 100).toLowerCase();
          const user = await githubUser(token);
          const [ingested, available] = await Promise.all([
            listIngestedWorkspaces(String(user.id)),
            org ? githubRepositories(token, org) : githubAccessibleRepositories(token),
          ]);
          const repositories = (available as RepoLike[])
            .map((repository) => ({
              id: repository.id ?? null,
              name: repository.name ?? repository.full_name?.split("/").pop() ?? "",
              full_name: repository.full_name ?? "",
              private: Boolean(repository.private),
              default_branch: repository.default_branch ?? "main",
              description: repository.description ?? null,
              html_url: repository.html_url ?? null,
              updated_at: repository.updated_at ?? null,
              owner: repository.owner?.login ?? repository.full_name?.split("/")[0] ?? "",
            }))
            .filter((repository) => repository.full_name)
            .filter(
              (repository) =>
                !query ||
                repository.full_name.toLowerCase().includes(query) ||
                (repository.description ?? "").toLowerCase().includes(query),
            )
            .sort((a, b) => a.full_name.localeCompare(b.full_name));
          return Response.json({ repositories, ingested, ingestedRepositories: ingested });
        } catch (error) {
          return githubError(error);
        }
      },
    },
  },
});
