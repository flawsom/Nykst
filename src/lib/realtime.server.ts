import { INGESTION_EVENT, ingestionTopic } from "@/lib/realtime";

// Publishes a Realtime broadcast after a repository analysis is stored, so open graphs
// refresh from the push instead of waiting for the next poll. This is deliberately
// best-effort: a failed broadcast must never fail the ingestion that already succeeded.

export async function publishIngestion(providerUserId: string | number, ingestionId: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return;

  const topic = ingestionTopic(providerUserId);
  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic,
            event: INGESTION_EVENT,
            payload: { ingestionId, at: new Date().toISOString() },
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error(
        `[realtime] broadcast to ${topic} failed: ${response.status} ${await response.text()}`,
      );
    }
  } catch (error) {
    console.error("[realtime] broadcast failed:", error);
  }
}
