function readCronSecret(): string {
  return Deno.env.get("CRON_SECRET") ?? "";
}

async function digestSecret(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function constantTimeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  if (av.length !== bv.length) return false;
  let diff = 0;
  for (let i = 0; i < av.length; i += 1) diff |= av[i] ^ bv[i];
  return diff === 0;
}

export function isCronSecretConfigured(): boolean {
  return readCronSecret().length > 0;
}

export async function verifyCronSecret(headerValue: string | null): Promise<boolean> {
  const cronSecret = readCronSecret();
  if (!cronSecret) return false;
  const provided = headerValue ?? "";
  const [expectedDigest, providedDigest] = await Promise.all([
    digestSecret(cronSecret),
    digestSecret(provided),
  ]);
  return constantTimeEqual(expectedDigest, providedDigest);
}
