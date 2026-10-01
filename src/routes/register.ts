import { createFileRoute } from "@tanstack/react-router";

// OAuth dynamic client registration probe from MCP clients; see the /.well-known route.
const notSupported = () =>
  Response.json(
    {
      error: "oauth_not_supported",
      error_description: "Nykst uses access tokens, not OAuth. Create a token at /mcp.",
    },
    { status: 404 },
  );

export const Route = createFileRoute("/register")({
  server: { handlers: { GET: notSupported, POST: notSupported } },
});
