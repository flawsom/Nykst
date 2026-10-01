import { createFileRoute } from "@tanstack/react-router";

// MCP clients that get a 401 probe /.well-known/oauth-* to look for OAuth sign-in. Nykst uses
// access tokens instead, so answer with JSON, not the site's HTML 404 page, which clients
// report as a confusing parse error.
const notSupported = () =>
  Response.json(
    {
      error: "oauth_not_supported",
      error_description:
        "Nykst uses access tokens, not OAuth. Send 'Authorization: Bearer nyk_…'. Create a token at /mcp.",
    },
    { status: 404 },
  );

export const Route = createFileRoute("/.well-known/$")({
  server: { handlers: { GET: notSupported, POST: notSupported } },
});
