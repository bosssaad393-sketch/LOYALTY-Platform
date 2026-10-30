import { fail } from "@/lib/staffApi";
import { withDeveloper } from "@/lib/devApi";
import { createRateLimiter } from "@/lib/rateLimit";
import { listMessages, MessageInput, postMessage } from "@/lib/devChat";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/** The developer's chat with CALABOS: read the conversation. */
export async function GET() {
  return withDeveloper(async (staff) => Response.json({ messages: await listMessages(staff) }, { headers: { "cache-control": "no-store" } }));
}

/** Send CALABOS a message. It is picked up the next time CALABOS (on the developer's PC) checks in. */
export async function POST(request: Request) {
  return withDeveloper(async (staff) => {
    if (!limiter.allow(staff.id)) return fail("You are sending messages very quickly. Please wait a moment.", 429);
    const parsed = MessageInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Write a message first (up to 2000 characters).");
    return (await postMessage(staff, parsed.data.message)) ? Response.json({ ok: true }) : fail("CALABOS has several messages waiting already. Give it a little time to answer them.", 429);
  });
}
