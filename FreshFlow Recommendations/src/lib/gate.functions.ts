import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const unlockSchema = z.object({ password: z.string().min(1) });

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data) => unlockSchema.parse(data))
  .handler(async ({ data }) => {
    const { getGateSession, passwordMatches } = await import("./gate.server");
    const expected = process.env["SITE_PASSWORD"];
    if (!expected) {
      return { ok: false as const, reason: "unconfigured" as const };
    }
    if (!passwordMatches(data.password, expected)) {
      return { ok: false as const, reason: "invalid" as const };
    }
    const session = await getGateSession();
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const isUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  return { unlocked: session.data.unlocked === true };
});

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  await session.clear();
  return { ok: true as const };
});
