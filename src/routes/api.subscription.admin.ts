import { createFileRoute } from "@tanstack/react-router";
import { listPendingPayments, reviewPayment } from "@/lib/subscription.server";

export const Route = createFileRoute("/api/subscription/admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return Response.json({ submissions: await listPendingPayments(request) });
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Could not load payment reviews." },
            { status: 400 },
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            submission_id?: unknown;
            decision?: unknown;
            note?: unknown;
          };
          if (
            typeof body.submission_id !== "string" ||
            (body.decision !== "approve" && body.decision !== "reject")
          )
            return Response.json(
              { error: "Submission and review decision are required." },
              { status: 400 },
            );
          return Response.json(
            await reviewPayment(
              request,
              body.submission_id,
              body.decision,
              typeof body.note === "string" ? body.note : undefined,
            ),
          );
        } catch (error) {
          if (error instanceof Response) return error;
          return Response.json(
            { error: error instanceof Error ? error.message : "Could not review payment." },
            { status: 400 },
          );
        }
      },
    },
  },
});
