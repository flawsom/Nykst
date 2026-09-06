import { createFileRoute } from "@tanstack/react-router";
import {
  getSubscriptionStatus,
  isSubscriptionPlan,
  submitPayment,
} from "@/lib/subscription.server";

export const Route = createFileRoute("/api/subscription")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return Response.json(await getSubscriptionStatus(request));
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            {
              error: error instanceof Error ? error.message : "Could not load subscription status.",
            },
            { status: 400 },
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            plan?: unknown;
            transaction_reference?: unknown;
            payer_note?: unknown;
          };
          if (!isSubscriptionPlan(body.plan))
            return Response.json({ error: "Choose a monthly or annual plan." }, { status: 400 });
          if (typeof body.transaction_reference !== "string")
            return Response.json({ error: "Transaction reference is required." }, { status: 400 });
          return Response.json(
            await submitPayment(
              request,
              body.plan,
              body.transaction_reference,
              typeof body.payer_note === "string" ? body.payer_note : undefined,
            ),
          );
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Could not submit payment." },
            { status: 400 },
          );
        }
      },
    },
  },
});
