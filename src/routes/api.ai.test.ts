import { createFileRoute } from "@tanstack/react-router";
import { AiKeyError, isAiProvider, testProviderKey } from "@/lib/byok.server";

export const Route = createFileRoute("/api/ai/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const provider = body["provider"];
          const apiKey = typeof body["apiKey"] === "string" ? body["apiKey"].trim() : "";
          if (!isAiProvider(provider))
            return Response.json({ error: "Choose a supported AI provider." }, { status: 400 });
          if (!apiKey)
            return Response.json({ error: "Enter your API key first." }, { status: 400 });
          await testProviderKey(provider, apiKey);
          return Response.json({ ok: true });
        } catch (error) {
          const status = error instanceof AiKeyError ? error.status : 400;
          const message = error instanceof Error ? error.message : "Key validation failed.";
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
