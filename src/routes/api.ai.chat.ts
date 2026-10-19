import { createFileRoute } from "@tanstack/react-router";
import {
  AiKeyError,
  chatWithUserKey,
  currentUserId,
  loadUserKey,
  platformKey,
} from "@/lib/byok.server";

const SYSTEM = [
  "You are Nykst, a software intelligence system navigator.",
  "You explain software architecture: domains, services, modules, files, dependencies and blast radius.",
  "You are not a coding assistant and not an IDE. Be concise, concrete and evidence-led.",
].join(" ");
const CODE_SYSTEM = [
  "You are Nykst Virtual Code, a cautious code-generation engine operating inside a software intelligence system.",
  "Generate reviewable TypeScript only when asked, use the supplied graph context, preserve existing contracts, and never claim that code was applied or deployed.",
  "Return concise code with no markdown fences unless the user explicitly asks for explanation.",
].join(" ");

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await currentUserId(request);
        const personalKey = userId ? await loadUserKey(userId) : null;
        const key = personalKey ?? platformKey();
        if (!key)
          return Response.json(
            {
              error: userId
                ? "Add your AI provider key in API Settings to run code intelligence and chat."
                : "Connect your organization or configure a provider key to use AI features.",
              needsKey: Boolean(userId),
            },
            { status: userId ? 428 : 401 },
          );

        try {
          const body = (await request.json()) as Record<string, unknown>;
          const prompt = typeof body["prompt"] === "string" ? body["prompt"].trim() : "";
          const context = typeof body["context"] === "string" ? body["context"] : "";
          const mode = body["mode"] === "code" ? "code" : "navigator";
          if (!prompt) return Response.json({ error: "Ask a question first." }, { status: 400 });

          const answer = await chatWithUserKey(
            key,
            mode === "code" ? CODE_SYSTEM : SYSTEM,
            context ? `Graph context:\n${context}\n\nQuestion: ${prompt}` : prompt,
          );
          return Response.json({
            answer,
            provider: key.provider,
            platformFallback: !personalKey,
          });
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
