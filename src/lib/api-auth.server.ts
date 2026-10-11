import { currentUserId } from "@/lib/byok.server";
import { githubToken } from "@/lib/integrations/github";

/** The signed-in GitHub user's id and token, or a 401 response to return as is. */
export async function requireUser(request: Request) {
  const userId = await currentUserId(request);
  const token = githubToken(request);
  if (!userId || !token) throw Response.json({ error: "Connect GitHub first." }, { status: 401 });
  return { userId, token };
}

export function repositoryParam(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(text))
    throw Response.json({ error: "Pick a repository first." }, { status: 400 });
  return text;
}

export function failure(error: unknown) {
  if (error instanceof Response) return error;
  const detail = error as { status?: unknown; needsKey?: unknown };
  const status = typeof detail.status === "number" ? detail.status : 500;
  return Response.json(
    {
      error: error instanceof Error ? error.message : "Something went wrong.",
      needsKey: Boolean(detail.needsKey),
    },
    { status },
  );
}
