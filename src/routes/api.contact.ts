import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/integrations/supabase/types";

/**
 * POST /api/contact
 *
 * One working request path for plan enquiries, partnership enquiries and
 * privacy rights requests. It stores the request server side, returns a
 * reference the visitor can keep, and never returns an internal error detail.
 */

const TOPICS = new Set(["Plans and access", "Partnerships", "Privacy request", "Support"]);

function clean(value: unknown, limit = 2000) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function serviceClient() {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Contact storage is not configured.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const name = clean(body["name"], 120);
          const email = clean(body["email"], 200);
          const topic = clean(body["topic"], 60) || "Support";
          const message = clean(body["message"], 4000);

          if (!name) return Response.json({ error: "Please add your name." }, { status: 400 });
          if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
            return Response.json({ error: "Please add a valid email address." }, { status: 400 });
          if (!TOPICS.has(topic))
            return Response.json({ error: "Please choose a topic." }, { status: 400 });
          if (message.length < 10)
            return Response.json(
              { error: "Please add a little detail so we can help." },
              { status: 400 },
            );

          // The request is stored in the existing intake table with an explicit
          // topic label. A dedicated table is the next step; this keeps the live
          // form working without a schema change to the production database.
          const payload: TablesInsert<"pre_registration"> = {
            first_name: name,
            email,
            role: topic,
            closing_thoughts: message,
          };

          const { data, error } = await serviceClient()
            .from("pre_registration")
            .insert(payload)
            .select("id")
            .single();

          if (error || !data) {
            console.error("Contact insert failed:", error?.message ?? "no row returned");
            return Response.json(
              { error: "We could not save your message. Please email us instead." },
              { status: 502 },
            );
          }

          return Response.json({
            ok: true,
            reference: `NYKST-${String(data.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`,
            replyWithin: "2 business days",
          });
        } catch (error) {
          console.error("Contact request failed:", error instanceof Error ? error.message : error);
          return Response.json(
            { error: "We could not save your message. Please email us instead." },
            { status: 500 },
          );
        }
      },
    },
  },
});
