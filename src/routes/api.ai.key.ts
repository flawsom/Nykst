import { createFileRoute } from "@tanstack/react-router";
import {
  currentUserId,
  deleteUserKey,
  isAiProvider,
  loadUserKey,
  saveUserKey,
  testProviderKey,
  AiKeyError,
} from "@/lib/byok.server";

function unauthorized() {
  return Response.json(
    { error: "Connect your GitHub organization first so we can store your key securely." },
    { status: 401 },
  );
}

export const Route = createFileRoute("/api/ai/key")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await currentUserId(request);
        if (!userId) return unauthorized();
        const key = await loadUserKey(userId);
        return Response.json({
          configured: Boolean(key),
          provider: key?.provider ?? null,
          last4: key?.last4 ?? null,
        });
      },
      POST: async ({ request }) => {
        const userId = await currentUserId(request);
        if (!userId) return unauthorized();
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const provider = body["provider"];
          const apiKey = typeof body["apiKey"] === "string" ? body["apiKey"].trim() : "";
          const apiBaseUrl =
            typeof body["apiBaseUrl"] === "string" ? body["apiBaseUrl"].trim() : "";
          const model = typeof body["model"] === "string" ? body["model"].trim() : "";
          if (!isAiProvider(provider))
            return Response.json({ error: "Choose a supported AI provider." }, { status: 400 });
          if (apiKey.length < 12)
            return Response.json({ error: "That key looks incomplete." }, { status: 400 });

          await testProviderKey(provider, apiKey, apiBaseUrl, model);
          await saveUserKey(userId, provider, apiKey, apiBaseUrl, model);
          return Response.json({ ok: true, provider, last4: apiKey.slice(-4) });
        } catch (error) {
          const status = error instanceof AiKeyError ? error.status : 400;
          const message =
            error instanceof Error ? error.message : "Could not save your key. Please try again.";
          return Response.json({ error: message }, { status });
        }
      },
      DELETE: async ({ request }) => {
        const userId = await currentUserId(request);
        if (!userId) return unauthorized();
        await deleteUserKey(userId);
        return Response.json({ ok: true });
      },
    },
  },
});
