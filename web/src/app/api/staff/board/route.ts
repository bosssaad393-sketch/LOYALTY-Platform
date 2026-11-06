import { withStaff } from "@/lib/staffApi";
import { readBoard } from "@/lib/table/db";

export async function GET() {
  return withStaff(async (staff) => Response.json(await readBoard(staff.venueId)));
}
