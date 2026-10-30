import { createFileRoute } from "@tanstack/react-router";
import {
  AiKeyError,
  chatWithUserKey,
  currentUserId,
  loadUserKey,
  platformKey,
} from "@/lib/byok.server";
import { deterministicProposal } from "@/lib/analysis/fallback-generation";
import {
  AnswerCache,
  collapseRepeatedAnswer,
  PLATFORM_BUSY_MESSAGE,
  PlatformLimiter,
  platformCacheKey,
  platformFailureMessage,
} from "@/lib/ai-platform.server";

const SYSTEM = [
  "You are Nykst, a software intelligence system navigator.",
  "You explain software architecture: domains, services, modules, files, dependencies and blast radius.",
  "You are not a coding assistant and not an IDE. Be concise, concrete and evidence-led.",
  "Do not sign your answer, do not comment on your own wording, and do not repeat yourself.",
].join(" ");
const CODE_SYSTEM = [
  "You are Nykst Virtual Code, a cautious code-generation engine operating inside a software intelligence system.",
  "Generate reviewable TypeScript only when asked, use the supplied graph context, preserve existing contracts, and never claim that code was applied or deployed.",
  "Follow the requested output format exactly. When asked for a complete replacement file, return the entire file in one fenced code block, without omissions or surrounding prose.",
].join(" ");

/** Bounds for an anonymous endpoint: no unbounded prompt, context or body. */
const MAX_BODY_BYTES = 128_000;
const MAX_PROMPT_CHARS = 4_000;
const MAX_CONTEXT_CHARS = 24_000;

/** One budget window per server instance, shared by every platform key request. */
const platformLimiter = new PlatformLimiter();
/** Identical questions cost one call, which keeps module cards inside the free tier. */
const answerCache = new AnswerCache();

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES)
          return Response.json(
            { error: "That request is too long. Please shorten it." },
            { status: 413 },
          );

        const userId = await currentUserId(request);
        const rawBody = await request.text();
        if (rawBody.length > MAX_BODY_BYTES)
          return Response.json(
            { error: "That request is too long. Please shorten it." },
            { status: 413 },
          );
        let body: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(rawBody) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            body = parsed as Record<string, unknown>;
        } catch {
          body = {};
        }
        const prompt = typeof body["prompt"] === "string" ? body["prompt"].trim() : "";
        const context = typeof body["context"] === "string" ? body["context"] : "";
        const mode = body["mode"] === "code" ? "code" : "navigator";
        if (!prompt) return Response.json({ error: "Ask a question first." }, { status: 400 });
        if (prompt.length > MAX_PROMPT_CHARS)
          return Response.json(
            { error: "That question is too long. Please shorten it and try again." },
            { status: 413 },
          );
        if (context.length > MAX_CONTEXT_CHARS)
          return Response.json(
            {
              error: "That project context is too large for one question. Narrow it and try again.",
            },
            { status: 413 },
          );

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

        const system = mode === "code" ? CODE_SYSTEM : SYSTEM;
        const userPrompt = context ? `Graph context:\n${context}\n\nQuestion: ${prompt}` : prompt;
        // The cache is shared by the server, so the caller is part of the key.
        // Without it one visitor's private graph context could answer another.
        const cacheKey = platformCacheKey(userId ?? "anonymous", mode, system, context, prompt);

        if (!personalKey) {
          const cached = answerCache.get(cacheKey);
          if (cached)
            return Response.json({
              answer: cached,
              provider: key.provider,
              platformFallback: true,
            });

          // The shared account has a small minute budget. Refuse honestly here
          // rather than spend a provider error, a quota message or an upsell
          // link on a customer.
          if (!platformLimiter.take()) {
            const retryAfter = platformLimiter.retryAfterSeconds();
            if (mode === "code" && fallbackContent) return fallbackResponse(PLATFORM_BUSY_MESSAGE);
            return Response.json(
              { error: PLATFORM_BUSY_MESSAGE, retryAfterSeconds: retryAfter },
              { status: 429, headers: { "retry-after": String(retryAfter) } },
            );
          }
        }

        try {
          const raw = await chatWithUserKey(
            key,
            system,
            userPrompt,
            // A grounded code proposal is a whole function or file, so the code
            // mode needs room to finish it instead of being cut off mid-block.
            mode === "code" ? { maxTokens: 2400 } : undefined,
          );
          if (!raw.trim() || raw.trim() === "No answer returned.")
            throw new AiKeyError("The AI provider returned no text. Please try again.", 502);
          const answer = collapseRepeatedAnswer(raw);
          if (!personalKey) answerCache.set(cacheKey, answer);
          return Response.json({
            answer,
            provider: key.provider,
            platformFallback: !personalKey,
          });
        } catch (error) {
          const status = error instanceof AiKeyError ? error.status : 500;
          // A personal key keeps its own specific message, because that user can
          // act on it. The shared account only ever gets neutral copy.
          const message = personalKey
            ? error instanceof Error
              ? error.message
              : "Nykst could not complete that request. Please try again."
            : platformFailureMessage(status);
          if (!personalKey) console.error("[ai-platform] request failed", status);
          if (mode === "code" && fallbackContent) return fallbackResponse(message);
          const retryAfter = !personalKey && status === 429 ? 30 : null;
          return Response.json(
            {
              error: message,
              needsKey: personalKey ? status === 401 : false,
              ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}),
            },
            { status, headers: retryAfter ? { "retry-after": String(retryAfter) } : {} },
          );
        }
      },
    },
  },
});
