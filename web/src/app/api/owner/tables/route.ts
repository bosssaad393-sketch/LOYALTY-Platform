import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { addTable, listTables, removeTable } from "@/lib/table/db";

const Post = z.object({ label: z.string().trim().min(1).max(20) });
const Delete = z.object({ id: z.uuid() });

export async function GET() {
  return withOwner(async (staff) => Response.json({ tables: await listTables(staff.venueId) }));
}

export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Post.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Give the table a short name, for example 4 or Terrace 2.");
    if ((await addTable(staff.venueId, parsed.data.label)) === "duplicate") return fail("There is already a table with that name.", 409);
    return Response.json({ tables: await listTables(staff.venueId) });
  });
}

export async function DELETE(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Delete.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the table.");
    const r = await removeTable(staff.venueId, parsed.data.id);
    if (r === "not_found") return fail("Table not found.", 404);
    if (r === "open_tab") return fail("This table has an open tab. Close it first.", 409);
    return Response.json({ tables: await listTables(staff.venueId) });
  });
}
