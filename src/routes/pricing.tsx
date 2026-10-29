import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old shared links to /pricing land on the current plans page, never a 404. */
export const Route = createFileRoute("/pricing")({
  beforeLoad: () => {
    throw redirect({ to: "/subscribe" });
  },
});
