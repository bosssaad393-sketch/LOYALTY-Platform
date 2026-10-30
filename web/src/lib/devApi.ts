import "server-only";
import { currentStaff, type Staff } from "./staffAuth";
import { fail } from "./staffApi";

/** For the development team's area only (role "developer"). Everyone else gets a plain refusal; the venue always comes from the session. */
export async function withDeveloper(handler: (staff: Staff) => Promise<Response>): Promise<Response> {
  const staff = await currentStaff("dev");
  if (!staff) return fail("Please sign in again.", 401);
  if (staff.role !== "developer") return fail("This area is for the development team.", 403);
  try {
    return await handler(staff);
  } catch (err) {
    console.error("dev api failed", err instanceof Error ? err.message : err);
    return fail("Something went wrong. Please try again.", 500);
  }
}
