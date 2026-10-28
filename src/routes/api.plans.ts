import { createFileRoute } from "@tanstack/react-router";
import { planRegistry } from "@/lib/pricing.server";

/**
 * GET /api/plans
 *
 * The public plan registry. Price, period, trial and refund terms are visible
 * without signing in; checkout state is computed on the server and no plan id,
 * key or secret is ever returned.
 */
export const Route = createFileRoute("/api/plans")({
  server: {
    handlers: {
      GET: () =>
        Response.json(planRegistry(), {
          headers: { "cache-control": "no-store" },
        }),
    },
  },
});
