import { createFileRoute } from "@tanstack/react-router";
import { githubError, githubUser, json, requireGithubToken } from "@/lib/integrations/github";

export const Route = createFileRoute("/api/integrations/github/latest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = requireGithubToken(request);
          const user = await githubUser(token);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("repository_ingestions")
            .select(
              "id, provider, provider_username, repository_full_name, status, payload, created_at",
            )
            .eq("provider", "github")
            .eq("provider_user_id", String(user.id))
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw new Error(`Could not load repository snapshot: ${error.message}`);
          return json({ ingestion: data });
        } catch (error) {
          return githubError(error);
        }
      },
    },
  },
});
