const defaultDeadlineMs = 15_000;

/**
 * Gives one browser request its own deadline while retaining caller cancellation.
 * Mutations intentionally receive no retry behavior: timeout does not reveal whether
 * the server completed the write.
 */
export function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit = {},
  deadlineMs = defaultDeadlineMs,
) {
  const deadline = AbortSignal.timeout(deadlineMs);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  return fetch(input, { ...init, signal });
}

/** A bounded, transport-agnostic timeout check suitable for concise UI feedback. */
export function isFetchDeadlineExceeded(error: unknown) {
  return error instanceof DOMException && error.name === "TimeoutError";
}
