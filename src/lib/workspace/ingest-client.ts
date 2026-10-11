/** Browser side of /api/integrations/github/ingest, which streams newline-delimited JSON. */

export type IngestStageId = "repository" | "listing" | "source" | "history" | "findings" | "saving";

export const INGEST_STAGES: { id: IngestStageId; label: string; hint: string }[] = [
  { id: "repository", label: "Reading repository", hint: "Name, default branch, visibility" },
  { id: "listing", label: "Listing files, commits and pull requests", hint: "From the GitHub API" },
  {
    id: "source",
    label: "Parsing source code",
    hint: "Imports, exports, call sites with the TypeScript parser",
  },
  {
    id: "history",
    label: "Reading change history",
    hint: "Which files changed in which commits and pull requests",
  },
  {
    id: "findings",
    label: "Looking for problems",
    hint: "Cycles, unresolved imports, secrets, untested hot files",
  },
  { id: "saving", label: "Saving the analysis", hint: "Only the derived graph and history" },
];

export interface IngestDone {
  ingestionId: string;
  repository: string;
  summary: Record<string, number>;
}

export interface IngestUpdate {
  stage: IngestStageId;
  detail?: string;
}

export async function runIngest(
  owner: string,
  repo: string,
  onUpdate: (update: IngestUpdate) => void,
  signal?: AbortSignal,
): Promise<IngestDone> {
  const response = await fetch("/api/integrations/github/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner, repo }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Analysis could not start. Try again.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: IngestDone | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as
      | ({ type: "progress" } & IngestUpdate)
      | ({ type: "done" } & IngestDone)
      | { type: "error"; error: string };
    if (event.type === "progress")
      onUpdate({ stage: event.stage, ...(event.detail ? { detail: event.detail } : {}) });
    else if (event.type === "error") throw new Error(event.error);
    else done = event;
  };
  for (;;) {
    const { value, done: finished } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
    if (finished) break;
  }
  handle(buffer);
  if (!done) throw new Error("The analysis ended early. Try again.");
  return done;
}
