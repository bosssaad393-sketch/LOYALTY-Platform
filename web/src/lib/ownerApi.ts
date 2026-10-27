import "server-only";
import { currentStaff, type Staff } from "./staffAuth";
import { fail } from "./staffApi";
import { roleAllowed } from "./roles";

/** Owner and manager screens. Team management is owner-only (pass ownerOnly). */
export async function withOwner(handler: (staff: Staff) => Promise<Response>, ownerOnly = false): Promise<Response> {
  const staff = await currentStaff();
  if (!staff) return fail("Please sign in again.", 401);
  if (!roleAllowed(staff.role, ownerOnly)) return fail("Only the owner can open this.", 403);
  try {
    return await handler(staff);
  } catch (err) {
    console.error("owner api failed", err instanceof Error ? err.message : err);
    return fail("Something went wrong. Please try again.", 500);
  }
}

const DAY = 86_400_000;
/** Start of today in Bahrain (UTC+3), as epoch ms. */
export function bahrainDayStart(t = Date.now()): number {
  const shifted = t + 3 * 3600_000;
  return shifted - (shifted % DAY) - 3 * 3600_000;
}
export { DAY };
