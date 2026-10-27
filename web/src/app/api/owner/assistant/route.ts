import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { createRateLimiter } from "@/lib/rateLimit";
import { handleMessage, recentRequests } from "@/lib/assistant/service";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
const Input = z.object({ message: z.string().min(1).max(2000) });

/** The owner's chat. The business and the person come from the sign-in; the message can only ask for what the assistant is built to do. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    if (!limiter.allow(staff.id)) return fail("You are sending messages very quickly. Please wait a moment.", 429);
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Write a message first.");
    return Response.json(await handleMessage(staff, parsed.data.message));
  });
}

/** The requests passed to the development team from this business, with their status. */
export async function GET() {
  return withOwner(async (staff) => Response.json({ requests: await recentRequests(staff) }));
}
