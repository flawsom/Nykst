import { createFileRoute } from "@tanstack/react-router";
import { ticketAnalysis } from "@/lib/connectors/format";
import { addComment, getIssue, recentIssues } from "@/lib/connectors/jira.server";
import { githubError, githubUser, json, requireGithubToken } from "@/lib/integrations/github";
import { loadSnapshot } from "@/lib/mcp.server";

/**
 * GET                       recent tickets
 * POST { key, repository?, comment? }  analyze one ticket against the repository; with
 *                           comment=true also post the analysis on the ticket.
 */
export const Route = createFileRoute("/api/integrations/jira/issues")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await githubUser(requireGithubToken(request));
          return json({ issues: await recentIssues(String(user.id)) });
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof Error && !/GitHub|token/i.test(error.message))
            return json({ error: error.message }, { status: 502 });
          return githubError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await githubUser(requireGithubToken(request));
          const body = (await request.json().catch(() => ({}))) as {
            key?: string;
            repository?: string;
            comment?: boolean;
          };
          const key = (body.key ?? "").trim();
          if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key))
            return json({ error: "Enter a ticket key like ABC-123." }, { status: 400 });
          const userId = String(user.id);
          const [issue, snapshot] = await Promise.all([
            getIssue(userId, key),
            loadSnapshot(userId, body.repository),
          ]);
          const lines = ticketAnalysis(snapshot, issue.summary, issue.description);
          if (body.comment) await addComment(userId, key, lines);
          return json({ key, summary: issue.summary, lines, commented: Boolean(body.comment) });
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof Error && !/GitHub|token/i.test(error.message))
            return json({ error: error.message }, { status: 502 });
          return githubError(error);
        }
      },
    },
  },
});
