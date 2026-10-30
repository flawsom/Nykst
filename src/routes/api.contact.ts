import { createFileRoute } from "@tanstack/react-router";
import {
  CONTACT_MESSAGE_MAX,
  CONTACT_RATE_LIMIT,
  confirmationCopy,
  deliverContactNotification,
  hashNetworkAddress,
  newContactReference,
  rateLimitDecision,
  requestNetworkAddress,
  validateContactInput,
} from "@/lib/contact.server";
import { CONTACT_EMAIL, REPLY_PROMISE } from "@/lib/contact";
import { deliverContactConfirmation } from "@/lib/email/deliver.server";

/**
 * POST /api/contact
 *
 * One working request path for plans, partnerships, privacy rights and support.
 *
 * Order of operations: validate, rate limit, store, notify.
 * - Validation and the rate limit run before anything is written.
 * - A stored row is not a delivered notification. The response says which one
 *   happened, and the visitor always gets a working email action as well.
 * - Provider detail, database errors and the message body never reach the
 *   browser and are never logged. Only the reference and the outcome are logged.
 */

const MAX_BODY_BYTES = 20_000;

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json(
    { error: message, contactEmail: CONTACT_EMAIL, ...extra },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/** The service-role client, or null when the deployment is missing its keys. */
async function contactStore() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES)
          return fail("That message is too long. Please shorten it and try again.", 413);

        // The content-length header is only a fast reject. The read body is
        // checked too, so a chunked request cannot skip the cap.
        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES)
          return fail("That message is too long. Please shorten it and try again.", 413);

        let body: Record<string, unknown>;
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return fail("We could not read that message. Please try again.", 400);
          body = parsed as Record<string, unknown>;
        } catch {
          return fail("We could not read that message. Please try again.", 400);
        }

        const validation = validateContactInput(body);
        if (!validation.ok) return fail(validation.errors[0] ?? "Please check the form.", 400);
        const input = validation.value;

        const networkHash = hashNetworkAddress(requestNetworkAddress(request.headers));

        const supabase = await contactStore();
        if (!supabase) {
          console.error("Contact storage is not configured.");
          return fail("We could not save your message. Please email us instead.", 503);
        }

        const since = new Date(
          Date.now() - CONTACT_RATE_LIMIT.windowMinutes * 60_000,
        ).toISOString();
        const [senderCount, networkCount] = await Promise.all([
          supabase
            .from("contact_messages")
            .select("id", { count: "exact", head: true })
            .eq("sender_email", input.email)
            .gte("created_at", since),
          supabase
            .from("contact_messages")
            .select("id", { count: "exact", head: true })
            .eq("network_hash", networkHash)
            .gte("created_at", since),
        ]);

        if (senderCount.error || networkCount.error) {
          console.error(
            "Contact rate limit check failed:",
            senderCount.error?.code ?? networkCount.error?.code ?? "unknown",
          );
          return fail("We could not save your message. Please email us instead.", 503);
        }

        const limit = rateLimitDecision({
          sender: senderCount.count ?? 0,
          network: networkCount.count ?? 0,
        });
        if (!limit.allowed) return fail(limit.reason, 429);

        // Reference collisions are practically impossible, but a retry keeps a
        // unique-constraint error from ever reaching the visitor.
        let stored: { reference: string; created_at: string } | null = null;
        for (let attempt = 0; attempt < 3 && !stored; attempt += 1) {
          const reference = newContactReference();
          const { data, error } = await supabase
            .from("contact_messages")
            .insert({
              reference,
              topic: input.topic,
              sender_name: input.name,
              sender_email: input.email,
              message: input.message.slice(0, CONTACT_MESSAGE_MAX),
              network_hash: networkHash,
              status: "stored",
              mail_status: "pending",
            })
            .select("reference, created_at")
            .single();

          if (error) {
            if (error.code === "23505") continue;
            console.error("Contact insert failed:", error.code ?? "unknown");
            return fail("We could not save your message. Please email us instead.", 502);
          }
          if (data) stored = data;
        }

        if (!stored) {
          console.error("Contact reference allocation failed.");
          return fail("We could not save your message. Please email us instead.", 502);
        }

        const notification = {
          reference: stored.reference,
          input,
          receivedAt: stored.created_at,
        };
        const [mail, receipt] = await Promise.all([
          deliverContactNotification({ env: process.env, notification }),
          deliverContactConfirmation({ env: process.env, notification }).catch(() => ({
            status: "failed" as const,
            detail: "The receipt did not send.",
          })),
        ]);

        const { error: updateError } = await supabase
          .from("contact_messages")
          .update({
            status:
              mail.status === "sent" ? "notified" : mail.status === "failed" ? "failed" : "stored",
            mail_status: mail.status,
            mail_detail: mail.detail ?? null,
            notified_at: mail.status === "sent" ? new Date().toISOString() : null,
          })
          .eq("reference", stored.reference);

        if (updateError)
          console.error("Contact status update failed:", updateError.code ?? "unknown");

        // Reference and outcome only. No name, address, message or provider detail.
        console.log(
          `Contact ${stored.reference}: stored, mail ${mail.status}, receipt ${receipt.status}.`,
        );

        return Response.json(
          {
            ok: true,
            reference: stored.reference,
            delivered: mail.status === "sent",
            confirmationDelivered: receipt.status === "sent",
            message: confirmationCopy(input.topic, mail.status),
            replyWithin: mail.status === "sent" ? REPLY_PROMISE[input.topic].acknowledge : null,
            contactEmail: CONTACT_EMAIL,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
