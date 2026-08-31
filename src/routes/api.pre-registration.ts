import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/integrations/supabase/types";

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase server configuration is missing. Please contact the Nykst team.");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/pre-registration")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = (await request.json()) as TablesInsert<"pre_registration">;
          if (!payload.first_name || (!payload.email && !payload.linkedin && !payload.x_account)) {
            return Response.json(
              { error: "Please provide your name and at least one contact method." },
              { status: 400 },
            );
          }
          const { error } = await getSupabase().from("pre_registration").insert(payload);
          if (error) return Response.json({ error: error.message }, { status: 400 });
          return Response.json({ ok: true });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Could not save your request." },
            { status: 500 },
          );
        }
      },
    },
  },
});
