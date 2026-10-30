import { createFileRoute } from "@tanstack/react-router";
import { resendConfigured, resendWebhookConfigured } from "@/lib/resend.server";

// Live readiness probe: reports whether Supabase is configured and whether the
// schema Nykst needs is actually present. Every value is measured on request,
// nothing is cached and nothing is assumed.
const TABLES = [
  "pre_registration",
  "advantages_feedback",
  "repository_ingestions",
  "user_ai_keys",
  "nykst_subscriptions",
  "nykst_payment_submissions",
  "production_signals",
  "root_cause_diagnoses",
  "mcp_access_tokens",
  "integration_connections",
  "razorpay_webhook_events",
  "contact_messages",
  "contact_replies",
] as const;

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const environment = {
          SUPABASE_URL: Boolean(process.env["SUPABASE_URL"]),
          SUPABASE_PUBLISHABLE_KEY: Boolean(process.env["SUPABASE_PUBLISHABLE_KEY"]),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]),
        };
        const project = process.env["SUPABASE_URL"]
          ? new URL(process.env["SUPABASE_URL"]).host
          : null;

        const tables: Record<string, boolean> = {};
        let reachable = false;
        let error: string | null = null;
        let billingSchemaReady = false;
        let billingSchemaError: string | null = null;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          reachable = true;
          const { error: billingError } = await supabaseAdmin
            .from("nykst_subscriptions")
            .select("razorpay_subscription_id")
            .limit(1);
          billingSchemaReady = !billingError;
          if (billingError) billingSchemaError = billingError.message.slice(0, 200);
          await Promise.all(
            TABLES.map(async (table) => {
              // A real GET with limit 1: PostgREST answers HEAD with 204 even for a
              // missing table, so HEAD would "prove" a schema that isn't there.
              const { error: tableError } = await supabaseAdmin.from(table).select("*").limit(1);
              tables[table] = !tableError;
              if (tableError && /schema cache|does not exist/i.test(tableError.message)) {
                error ??= `${table}: ${tableError.message}`;
              }
            }),
          );
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
        }

        const missing = TABLES.filter((table) => !tables[table]);
        const configured = Object.values(environment).every(Boolean);
        const status = !configured || !reachable || missing.length ? "degraded" : "ok";

        return new Response(
          JSON.stringify(
            {
              status,
              configured,
              project,
              reachable,
              tables,
              missing,
              error,
              billing: {
                schemaReady: billingSchemaReady,
                ...(billingSchemaError ? { error: billingSchemaError } : {}),
              },
              mail: {
                outbound: resendConfigured(process.env),
                inbound: resendWebhookConfigured(process.env),
              },
              hint: missing.length
                ? "Apply supabase/schema.sql in the Supabase SQL editor to finish provisioning."
                : undefined,
              checkedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
          {
            status: status === "ok" ? 200 : 503,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
