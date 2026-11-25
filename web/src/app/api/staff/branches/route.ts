import { withStaff } from "@/lib/staffApi";
import { listBranches } from "@/lib/branchesDb";

/** The places this person can work at. `fixed` = they belong to one branch and cannot switch. */
export async function GET() {
  return withStaff(async (staff) => {
    const all = await listBranches(staff.venueId);
    const mine = staff.branchId ? all.filter((b) => b.id === staff.branchId) : all;
    return Response.json({
      fixed: Boolean(staff.branchId),
      branches: mine.map((b) => ({ id: b.id, name: b.name, nameAr: b.nameAr, kind: b.kind })),
    });
  });
}
