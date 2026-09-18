import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AiKeyError, chatWithUserKey, currentUserId, loadUserKey } from "@/lib/byok.server";

const SYSTEM = `You are Nykst Evidence Engine. Analyze only the supplied evidence. Never claim certainty when the evidence is incomplete. Return strict JSON with this shape: {"title": string, "confidence": "low"|"medium"|"high", "explanation": string, "evidence": [{"source": string, "detail": string}], "dependencies": string[], "recommendedNextSteps": string[]}. Every evidence item must identify its source. If runtime evidence is absent, explicitly say that this is a repository-grounded candidate, not a proven production root cause.`;

function parseJson(answer: string) {
  const cleaned = answer
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const confidence = parsed["confidence"];
  return {
    title:
      typeof parsed["title"] === "string" ? parsed["title"].slice(0, 240) : "Root-cause candidate",
    confidence: confidence === "high" || confidence === "medium" ? confidence : "low",
    explanation:
      typeof parsed["explanation"] === "string"
        ? parsed["explanation"].slice(0, 5000)
        : "Insufficient evidence.",
    evidence: Array.isArray(parsed["evidence"]) ? parsed["evidence"].slice(0, 12) : [],
    dependencies: Array.isArray(parsed["dependencies"])
      ? parsed["dependencies"]
          .filter((item): item is string => typeof item === "string")
          .slice(0, 30)
      : [],
    recommendedNextSteps: Array.isArray(parsed["recommendedNextSteps"])
      ? parsed["recommendedNextSteps"]
          .filter((item): item is string => typeof item === "string")
          .slice(0, 12)
      : [],
  };
}

export const Route = createFileRoute("/api/diagnosis")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await currentUserId(request);
          if (!userId) return Response.json({ error: "Connect GitHub first." }, { status: 401 });
          const body = (await request.json()) as { signalId?: string };
          if (!body.signalId)
            return Response.json({ error: "A signal id is required." }, { status: 400 });
          const key = await loadUserKey(userId);
          if (!key)
            return Response.json(
              { error: "Connect an AI provider before diagnosing a signal." },
              { status: 428 },
            );

          const { data: signal, error: signalError } = await supabaseAdmin
            .from("production_signals")
            .select(
              "id, source, event_type, repository_full_name, occurred_at, severity, title, summary, payload",
            )
            .eq("id", body.signalId)
            .maybeSingle();
          if (signalError || !signal)
            return Response.json({ error: "Signal not found." }, { status: 404 });

          const repository = signal.repository_full_name;
          const { data: ingestion } = repository
            ? await supabaseAdmin
                .from("repository_ingestions")
                .select("repository_full_name, created_at, payload")
                .eq("provider_user_id", userId)
                .eq("repository_full_name", repository)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            : { data: null };
          if (!ingestion)
            return Response.json(
              { error: "Ingest this repository before requesting diagnosis." },
              { status: 409 },
            );

          const payload = (ingestion.payload ?? {}) as Record<string, unknown>;
          const answer = await chatWithUserKey(
            key,
            SYSTEM,
            `Live signal:\n${JSON.stringify(signal)}\n\nRepository snapshot created at ${ingestion.created_at}:\n${JSON.stringify(
              {
                repository: payload["repository"],
                commits: Array.isArray(payload["commits"]) ? payload["commits"].slice(0, 20) : [],
                pull_requests: Array.isArray(payload["pull_requests"])
                  ? payload["pull_requests"].slice(0, 10)
                  : [],
                issues: Array.isArray(payload["issues"]) ? payload["issues"].slice(0, 10) : [],
                files: Array.isArray(payload["files"]) ? payload["files"].slice(0, 80) : [],
                dependency_graph: payload["dependency_graph"] ?? null,
              },
            )}`,
          );
          const diagnosis = parseJson(answer);
          const { data: saved, error: saveError } = await supabaseAdmin
            .from("root_cause_diagnoses")
            .insert({
              signal_id: signal.id,
              repository_full_name: repository,
              status: "candidate",
              confidence: diagnosis.confidence,
              title: diagnosis.title,
              explanation: diagnosis.explanation,
              evidence: diagnosis.evidence,
              dependencies: diagnosis.dependencies,
              recommended_next_steps: diagnosis.recommendedNextSteps,
              model_provider: key.provider,
              model_name: key.model,
            })
            .select(
              "id, signal_id, status, confidence, title, explanation, evidence, dependencies, recommended_next_steps, created_at",
            )
            .single();
          if (saveError || !saved)
            throw new Error("Diagnosis was generated but could not be persisted.");
          return Response.json({ diagnosis: saved });
        } catch (error) {
          const status = error instanceof AiKeyError ? error.status : 400;
          return Response.json(
            { error: error instanceof Error ? error.message : "Diagnosis failed." },
            { status },
          );
        }
      },
    },
  },
});
