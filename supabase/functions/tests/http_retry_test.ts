import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const originalFetch = globalThis.fetch;

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

Deno.test("fetchWithTimeout retries on 429 with Retry-After", async () => {
  let calls = 0;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve(new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
    }
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;

  const { fetchWithTimeout } = await import("../_shared/http.ts");
  const response = await fetchWithTimeout("https://example.com", {}, { timeoutMs: 2000, retries: 1 });
  assertEquals(response.status, 200);
  assertEquals(calls, 2);
  restoreFetch();
});
