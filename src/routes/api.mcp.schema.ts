import { createFileRoute } from "@tanstack/react-router";
import { TOOLS } from "@/lib/analysis/tools";

/**
 * GET /api/mcp/schema
 *
 * The published half of the MCP contract: the same catalog `/api/mcp`
 * serves from `tools/list`, including every input schema and the read-only
 * annotation. Clients and auditors can diff this without a token.
 */
export const Route = createFileRoute("/api/mcp/schema")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify(
            {
              server: {
                name: "nykst",
                transport: "streamable-http",
                endpoint: "/api/mcp",
                readOnly: true,
              },
              generatedFrom: "src/lib/analysis/tools.ts",
              toolCount: TOOLS.length,
              tools: TOOLS,
            },
            null,
            2,
          ),
          {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "public, max-age=300",
            },
          },
        ),
    },
  },
});
