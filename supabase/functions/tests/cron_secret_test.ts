import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isCronSecretConfigured, verifyCronSecret } from "../_shared/cronAuth.ts";

Deno.test("empty CRON_SECRET is not configured and rejects provided secret", async () => {
  const prev = Deno.env.get("CRON_SECRET");
  Deno.env.delete("CRON_SECRET");
  assertEquals(isCronSecretConfigured(), false);
  assertEquals(await verifyCronSecret("local-dev-cron-secret"), false);
  if (prev) Deno.env.set("CRON_SECRET", prev);
});

Deno.test("configured CRON_SECRET accepts matching header", async () => {
  const prev = Deno.env.get("CRON_SECRET");
  Deno.env.set("CRON_SECRET", "test-secret-value");
  assertEquals(isCronSecretConfigured(), true);
  assertEquals(await verifyCronSecret("test-secret-value"), true);
  assertEquals(await verifyCronSecret("wrong"), false);
  if (prev) Deno.env.set("CRON_SECRET", prev);
  else Deno.env.delete("CRON_SECRET");
});
