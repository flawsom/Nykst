import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reviewPullRequest } from "@/lib/analysis/pr-review.server";
import { ingestPushWebhook } from "@/lib/analysis/push.server";
import { normalizeGithubWebhook, verifyGithubWebhookSignature } from "@/lib/production-signals";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** PR actions that change the diff, so the review comment must be recomputed. */
function shouldReview(action: string) {
  return action === "opened" || action === "synchronize" || action === "reopened";
}

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

        let blastRadius: unknown = null;
        const event = request.headers.get("x-github-event") ?? "";
        const action = typeof payload["action"] === "string" ? payload["action"] : "";
        if (event === "pull_request" && shouldReview(action)) {
          const pull = record(payload["pull_request"]);
          const repository = record(payload["repository"]);
          const number = typeof pull["number"] === "number" ? pull["number"] : 0;
          const fullName =
            typeof repository["full_name"] === "string" ? repository["full_name"] : "";
          const [owner, repo] = fullName.split("/");
          if (owner && repo && number) {
            try {
              blastRadius = await reviewPullRequest({ owner, repo, number });
            } catch (cause) {
              console.error(
                "[pr-review] failed",
                cause instanceof Error ? cause.message : String(cause),
              );
              blastRadius = {
                status: "skipped",
                reason: cause instanceof Error ? cause.message : "Could not post the review.",
              };
            }
          }
        }

        let incremental: unknown = null;
        if (event === "push") {
          try {
            incremental = await ingestPushWebhook(payload);
          } catch (cause) {
            console.error(
              "[push-patch] failed",
              cause instanceof Error ? cause.message : String(cause),
            );
            incremental = {
              status: "skipped",
              reason: cause instanceof Error ? cause.message : "Could not patch the snapshot.",
            };
          }
        }

        return Response.json({
          accepted: true,
          deliveryId: signal.delivery_id,
          blastRadius,
          incremental,
        });
      },
    },
  },
});
