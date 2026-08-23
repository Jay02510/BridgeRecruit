// Minimal retry wrapper for Microsoft Graph calls, per the plan's Phase 8
// scope ("basic exponential backoff, not the full idempotent retry queue").
// Retries on 429 (honoring Retry-After) and 5xx; gives up after maxAttempts.
export async function graphFetchWithRetry(
  input: string,
  init: RequestInit,
  maxAttempts = 3
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(input, init);

    if (response.ok || (response.status < 500 && response.status !== 429)) {
      return response;
    }

    lastResponse = response;
    if (attempt === maxAttempts) break;

    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
    const backoffMs = retryAfterMs ?? 2 ** attempt * 250 + Math.random() * 250;

    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  return lastResponse!;
}
