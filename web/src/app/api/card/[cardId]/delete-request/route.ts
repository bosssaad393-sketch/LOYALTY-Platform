import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { createDeleteRequest } from "@/lib/privacyDb";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";

// Public endpoint: no login. The unguessable card id is the credential.
// Abuse protection: a per-caller limit here (best effort, per server instance) and, in the database,
// one pending request per card. The answer never contains personal data.
const limiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

export async function POST(request: Request, ctx: RouteContext<"/api/card/[cardId]/delete-request">) {
  if (!limiter.allow(clientKey(request.headers))) return fail("Too many requests. Please try again later.", 429);

  const { cardId } = await ctx.params;
  if (!z.uuid().safeParse(cardId).success) return fail("Card not found.", 404);

  try {
    // "created" and "exists" look the same to the guest: asking twice is fine.
    if ((await createDeleteRequest(cardId)) === "unknown") return fail("Card not found.", 404);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("delete request failed", err instanceof Error ? err.message : err);
    return fail("Something went wrong. Please try again.", 500);
  }
}
