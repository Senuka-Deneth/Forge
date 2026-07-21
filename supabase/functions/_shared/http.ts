function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const retries = options.retries ?? 1;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timer);

      const shouldRetry = attempt < retries && (
        (response.status >= 500) || response.status === 429
      );
      if (shouldRetry) {
        const retryAfterMs = response.status === 429
          ? parseRetryAfterMs(response.headers.get("Retry-After"))
          : null;
        const backoffMs = retryAfterMs ?? 300 * (attempt + 1);
        lastError = new Error(`Upstream request failed with ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, 5000)));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Log the real error server-side; return a safe public message for clients. */
export function safeError(publicMessage: string, err: unknown): string {
  console.error(publicMessage, err instanceof Error ? err.message : String(err));
  return publicMessage;
}
