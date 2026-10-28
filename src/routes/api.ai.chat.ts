import { createFileRoute } from "@tanstack/react-router";
import {
  AiKeyError,
  chatWithUserKey,
  currentUserId,
  loadUserKey,
  platformKey,
} from "@/lib/byok.server";
import { deterministicProposal } from "@/lib/analysis/fallback-generation";

const SYSTEM = [
  "You are Nykst, a software intelligence system navigator.",
  "You explain software architecture: domains, services, modules, files, dependencies and blast radius.",
  "You are not a coding assistant and not an IDE. Be concise, concrete and evidence-led.",
].join(" ");
const CODE_SYSTEM = [
  "You are Nykst Virtual Code, a cautious code-generation engine operating inside a software intelligence system.",
  "Generate reviewable TypeScript only when asked, use the supplied graph context, preserve existing contracts, and never claim that code was applied or deployed.",
  "Follow the requested output format exactly. When asked for a complete replacement file, return the entire file in one fenced code block, without omissions or surrounding prose.",
].join(" ");

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await currentUserId(request);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const prompt = typeof body["prompt"] === "string" ? body["prompt"].trim() : "";
        const context = typeof body["context"] === "string" ? body["context"] : "";
        const mode = body["mode"] === "code" ? "code" : "navigator";
        if (!prompt) return Response.json({ error: "Ask a question first." }, { status: 400 });

        // Stage 2 always has a deterministic, grounded proposal path. When a
        // provider is unavailable this keeps the loop verifiable offline and in
        // CI without pretending that a model produced the file.
        const fallback =
          body["fallback"] && typeof body["fallback"] === "object"
            ? (body["fallback"] as { path?: unknown; content?: unknown })
            : null;
        const fallbackContent =
          typeof fallback?.content === "string" && fallback.content.length <= 60_000
            ? fallback.content
            : null;
        const fallbackPath =
          typeof fallback?.path === "string" && fallback.path.trim()
            ? fallback.path.trim()
            : "src/generated.ts";
        const fallbackResponse = (reason: string) => {
          const proposal = deterministicProposal(prompt, fallbackContent!, fallbackPath);
          const fence = proposal.language === "ts" ? "ts" : "";
          return Response.json({
            answer: `\`\`\`${fence}\n${proposal.content}\n\`\`\``,
            provider: "deterministic",
            platformFallback: false,
            fallback: true,
            fallbackSummary: proposal.summary,
            providerError: reason,
          });
        };

        const personalKey = userId ? await loadUserKey(userId) : null;
        const key = personalKey ?? platformKey();
        if (!key) {
          if (mode === "code" && fallbackContent)
            return fallbackResponse("No AI provider key is configured.");
          return Response.json(
            {
              error: userId
                ? "Add your AI provider key in API Settings to run code intelligence and chat."
                : "Connect your organization or configure a provider key to use AI features.",
              needsKey: Boolean(userId),
            },
            { status: userId ? 428 : 401 },
          );
        }

        try {
          const answer = await chatWithUserKey(
            key,
            mode === "code" ? CODE_SYSTEM : SYSTEM,
            context ? `Graph context:\n${context}\n\nQuestion: ${prompt}` : prompt,
            // A grounded code proposal is a whole function or file, so the code
            // mode needs room to finish it instead of being cut off mid-block.
            mode === "code" ? { maxTokens: 2400 } : undefined,
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
              : error instanceof Error
                ? error.message
                : "Nykst could not complete that request. Please try again.";
          if (mode === "code" && fallbackContent) return fallbackResponse(message);
          return Response.json({ error: message, needsKey: status === 401 }, { status });
        }
      },
    },
  },
});
