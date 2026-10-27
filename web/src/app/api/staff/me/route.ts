import { withStaff } from "@/lib/staffApi";

export async function GET() {
  return withStaff(async (staff) => Response.json({ name: staff.name, role: staff.role, venue: staff.venueName }));
}
