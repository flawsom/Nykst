import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/integrations/supabase/types";

function getSupabase() {
  const url = process.env["SUPABASE_URL"] || process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"];

  if (!url || !key) {
    throw new Error("Supabase server configuration is missing. Please contact the Nykst team.");
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptionalText(value: unknown): string | null {
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : null;
}

function buildInsertPayload(input: unknown): TablesInsert<"pre_registration"> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid pre-registration payload.");
  }

  const source = input as Record<string, unknown>;
  const payload: TablesInsert<"pre_registration"> = {
    first_name: cleanText(source["first_name"]),
    role: cleanText(source["role"]) || null,
    company_size: cleanText(source["company_size"]) || null,
    frustration: cleanText(source["frustration"]) || null,
    time_understanding_code: cleanText(source["time_understanding_code"]) || null,
    hardest_parts: Array.isArray(source["hardest_parts"])
      ? source["hardest_parts"]
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 3)
      : [],
    dream_feature: cleanText(source["dream_feature"]) || null,
    would_use: cleanText(source["would_use"]) || null,
    closing_thoughts: cleanText(source["closing_thoughts"]) || null,
    knowledge_location: cleanText(source["knowledge_location"]) || null,
    hard_won_insight: cleanText(source["hard_won_insight"]) || null,
    email: cleanOptionalText(source["email"]),
    linkedin: cleanOptionalText(source["linkedin"]),
    x_account: cleanOptionalText(source["x_account"]),
  };

  if (!payload.first_name) {
    throw new Error("Please provide your name.");
  }

  if (!payload.email && !payload.linkedin && !payload.x_account) {
    throw new Error("Please provide at least one contact method.");
  }

  return payload;
}

export const Route = createFileRoute("/api/pre-registration")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const input = await request.json();
          const payload = buildInsertPayload(input);
          const { error } = await getSupabase().from("pre_registration").insert(payload);

          if (error) {
            console.error("Supabase pre-registration insert failed:", error.message);
            return Response.json(
              { error: "Could not save your request. Please try again." },
              { status: 400 },
            );
          }

          return Response.json({ ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not save your request.";
          const status =
            message.startsWith("Please provide") || message.startsWith("Invalid") ? 400 : 500;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
