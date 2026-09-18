import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeGithubWebhook, verifyGithubWebhookSignature } from "@/lib/production-signals";

export const Route = createFileRoute("/api/webhooks/github")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        if (!verifyGithubWebhookSignature(rawBody, request.headers.get("x-hub-signature-256")))
          return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Webhook payload must be valid JSON." }, { status: 400 });
        }
        const signal = normalizeGithubWebhook(
          request.headers.get("x-github-event"),
          request.headers.get("x-github-delivery"),
          payload,
        );
        const { error } = await supabaseAdmin.from("production_signals").upsert(signal, {
          onConflict: "source,delivery_id",
          ignoreDuplicates: true,
        });
        if (error) {
          console.error("[production-signals] insert failed", error.message);
          return Response.json({ error: "Could not persist webhook signal." }, { status: 500 });
        }
        return Response.json({ accepted: true, deliveryId: signal.delivery_id });
      },
    },
  },
});
