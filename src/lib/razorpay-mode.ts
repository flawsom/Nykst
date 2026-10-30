/** Razorpay key ids are public identifiers; the prefix is the only safe mode signal. */
export type RazorpayKeyMode = "live" | "test" | "unknown";

export function razorpayKeyMode(keyId: string | null | undefined): RazorpayKeyMode {
  const value = keyId?.trim() ?? "";
  if (value.startsWith("rzp_live_")) return "live";
  if (value.startsWith("rzp_test_")) return "test";
  return "unknown";
}
