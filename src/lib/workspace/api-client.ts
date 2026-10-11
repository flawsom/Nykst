import type { WorkspaceApi } from "@/components/workspace/WorkspaceContext";

class ApiError extends Error {
  constructor(
    message: string,
    public needsKey = false,
    public status = 0,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError("Could not reach Nykst. Check your connection and try again.");
  }
  const body = (await response.json().catch(() => null)) as
    (T & { error?: string; needsKey?: boolean }) | null;
  if (!response.ok) {
    if (response.status === 401)
      throw new ApiError("Your GitHub session expired. Reconnect GitHub.", false, 401);
    throw new ApiError(
      body?.error ?? "Something went wrong. Please try again.",
      Boolean(body?.needsKey),
      response.status,
    );
  }
  return body as T;
}

const post = (url: string, payload: unknown) =>
  call<never>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

export function createWorkspaceApi(repository: string): WorkspaceApi {
  const q = encodeURIComponent(repository);
  return {
    listNotes: async (path) =>
      (
        await call<{ notes: Awaited<ReturnType<WorkspaceApi["listNotes"]>> }>(
          `/api/memory?repository=${q}${path ? `&path=${encodeURIComponent(path)}` : ""}`,
        )
      ).notes,
    addNote: async (input) =>
      (
        (await post("/api/memory", { repository, ...input })) as {
          note: Awaited<ReturnType<WorkspaceApi["addNote"]>>;
        }
      ).note,
    deleteNote: async (id) => {
      await call(`/api/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    findingStates: async () =>
      (
        await call<{ states: Awaited<ReturnType<WorkspaceApi["findingStates"]>> }>(
          `/api/findings?repository=${q}`,
        )
      ).states,
    setDismissed: async (signature, dismissed, note) => {
      await post("/api/findings", { repository, signature, dismissed, note });
    },
    verify: async (edits) =>
      (
        (await post("/api/change", { repository, action: "verify", edits })) as {
          report: Awaited<ReturnType<WorkspaceApi["verify"]>>;
        }
      ).report,
    generate: async (task, paths) =>
      (await post("/api/change", { repository, action: "generate", task, paths })) as Awaited<
        ReturnType<WorkspaceApi["generate"]>
      >,
  };
}

/** Used for the read-only demo: every write explains why it is unavailable. */
export const demoApi: WorkspaceApi = (() => {
  const unavailable = () => Promise.reject(new ApiError("This needs a connected repository."));
  return {
    listNotes: () => Promise.resolve([]),
    addNote: unavailable,
    deleteNote: unavailable,
    findingStates: () => Promise.resolve([]),
    setDismissed: unavailable,
    verify: unavailable,
    generate: unavailable,
  };
})();
