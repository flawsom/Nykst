import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Billing is opened by the team when a workspace is set up, so this route sends
 * visitors to the one place that can actually start that conversation.
 */
export const Route = createFileRoute("/billing")({
  beforeLoad: () => {
    throw redirect({ to: "/subscribe" });
  },
});
