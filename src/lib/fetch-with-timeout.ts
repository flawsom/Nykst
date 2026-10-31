export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The request did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = "RequestTimeoutError";
  }
}

export class RequestFailedError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RequestFailedError";
  }
}

/**
 * Fetch with a hard upper bound. A screen must never sit on a loading label
 * forever because a worker, proxy or cold start stopped answering.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const callerSignal = init.signal;
  const forwardAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new RequestTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}

export function readableRequestError(error: unknown, fallback: string): string {
  if (error instanceof RequestTimeoutError) {
    return "The server took too long to answer. Try again. If it keeps happening, email us and we will check it.";
  }
  if (error instanceof RequestFailedError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
