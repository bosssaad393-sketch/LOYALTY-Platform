import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { ACCESS } from "@/lib/roles";
import { EraseInput } from "@/lib/privacy";
import { eraseRequest } from "@/lib/privacyDb";

/** Erases the guest behind a deletion request (same effect as DELETE /api/owner/guests) and closes the request. Owner only. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = EraseInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Request missing.");
    const result = await eraseRequest(staff, parsed.data.requestId);
    if (result === "unknown") return fail("Request not found.", 404);
    return Response.json({ erased: true });
  }, ACCESS.privacyErase);
}
