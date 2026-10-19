import { supabase } from "@/integrations/supabase/client";

// Repository snapshots are service-role only, so the browser can never subscribe to the
// table itself. Instead the server publishes a "an analysis was stored" signal on a
// Realtime broadcast channel and clients react to it — the payload carries no repository
// data, only the fact that the stored analysis changed.

export const INGESTION_EVENT = "ingestion";

/** One channel per Nykst user, so no one receives someone else's signal. */
export function ingestionTopic(providerUserId: string | number) {
  return `nykst:ingestions:${providerUserId}`;
}

/** Subscribes to real-time ingestion signals. Returns the unsubscribe function. */
export function subscribeToIngestion(topic: string | null, onChange: () => void) {
  if (typeof window === "undefined" || !topic) return () => {};
  const channel = supabase
    .channel(topic, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: INGESTION_EVENT }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
