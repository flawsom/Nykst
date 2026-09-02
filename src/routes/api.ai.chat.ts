import { createFileRoute } from "@tanstack/react-router";
import { AiKeyError, chatWithUserKey, currentUserId, loadUserKey } from "@/lib/byok.server";

const SYSTEM = [
  "You are Nykst, a software intelligence system navigator.",
  "You explain software architecture: domains, services, modules, files, dependencies and blast radius.",
  "You are not a coding assistant and not an IDE. Be concise, concrete and evidence-led.",
].join(" ");

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await currentUserId(request);
        if (!userId)
          return Response.json(
            { error: "Connect your organization to use AI features.", needsKey: false },
            { status: 401 },
          );

        const key = await loadUserKey(userId);
        if (!key)
          return Response.json(
            {
              error: "Add your AI provider key in API Settings to run code intelligence and chat.",
              needsKey: true,
            },
            { status: 428 },
          );

        try {
          const body = (await request.json()) as Record<string, unknown>;
          const prompt = typeof body["prompt"] === "string" ? body["prompt"].trim() : "";
          const context = typeof body["context"] === "string" ? body["context"] : "";
          if (!prompt) return Response.json({ error: "Ask a question first." }, { status: 400 });

          const answer = await chatWithUserKey(
            key,
            SYSTEM,
            context ? `Graph context:\n${context}\n\nQuestion: ${prompt}` : prompt,
          );
          return Response.json({ answer, provider: key.provider });
        } catch (error) {
          const status = error instanceof AiKeyError ? error.status : 500;
          const message =
            error instanceof Error && error instanceof AiKeyError
              ? error.message
              : "Nykst could not complete that request. Please try again.";
          return Response.json({ error: message, needsKey: status === 401 }, { status });
        }
      },
    },
  },
});
