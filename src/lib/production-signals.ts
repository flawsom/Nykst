import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Json } from "@/integrations/supabase/types";

export type NormalizedProductionSignal = {
  source: "github";
  event_type: string;
  delivery_id: string;
  repository_full_name: string | null;
  occurred_at: string;
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  summary: string;
  fingerprint: string;
  payload: Json;
};

export function verifyGithubWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env["GITHUB_WEBHOOK_SECRET"]?.trim();
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function repositoryName(payload: Record<string, unknown>) {
  const repository = asObject(payload["repository"]);
  return text(repository["full_name"], "") || null;
}

function eventTime(payload: Record<string, unknown>) {
  const headCommit = asObject(payload["head_commit"]);
  const timestamp = text(headCommit["timestamp"], "");
  return Number.isNaN(Date.parse(timestamp))
    ? new Date().toISOString()
    : new Date(timestamp).toISOString();
}

function summarize(event: string, payload: Record<string, unknown>) {
  const repository = repositoryName(payload) ?? "the repository";
  if (event === "push") {
    const commits = Array.isArray(payload["commits"]) ? payload["commits"].length : 0;
    return `${commits} commit(s) were pushed to ${repository}. Re-ingest the repository to refresh code evidence.`;
  }
  if (event === "issues") {
    const issue = asObject(payload["issue"]);
    return `${text(payload["action"], "updated")} issue #${text(issue["number"], "unknown")} in ${repository}: ${text(issue["title"], "untitled issue")}.`;
  }
  if (event === "pull_request") {
    const pull = asObject(payload["pull_request"]);
    return `${text(payload["action"], "updated")} pull request #${text(pull["number"], "unknown")} in ${repository}: ${text(pull["title"], "untitled pull request")}.`;
  }
  return `GitHub delivered a ${event} event for ${repository}.`;
}

export function normalizeGithubWebhook(
  event: string | null,
  deliveryId: string | null,
  payload: Record<string, unknown>,
): NormalizedProductionSignal {
  const eventName = text(event, "unknown");
  const delivery = text(
    deliveryId,
    createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  );
  const repository = repositoryName(payload);
  const title = `${eventName.replace(/_/g, " ")} signal${repository ? ` · ${repository}` : ""}`;
  const summary = summarize(eventName, payload);
  const fingerprint = createHash("sha256")
    .update(`${eventName}|${repository ?? ""}|${summary}`)
    .digest("hex");
  const severity = eventName === "issues" || eventName === "pull_request" ? "warning" : "info";
  return {
    source: "github",
    event_type: eventName,
    delivery_id: delivery,
    repository_full_name: repository,
    occurred_at: eventTime(payload),
    severity,
    title,
    summary,
    fingerprint,
    payload: payload as Json,
  };
}
