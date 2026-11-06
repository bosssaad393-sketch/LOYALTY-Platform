import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { addCategory, addItem, editItem, readMenu, removeItem } from "@/lib/table/db";
import { parsePriceFils } from "@/lib/table/rules";

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const Fields = z.object({ nameEn: z.string().trim().min(1).max(80), nameAr: optional(80), noteEn: optional(200), noteAr: optional(200), price: z.string() });
const Post = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("category"), nameEn: z.string().trim().min(1).max(60), nameAr: optional(60) }),
  Fields.extend({ kind: z.literal("item"), categoryId: z.uuid() }),
]);
const Patch = Fields.extend({ id: z.uuid() });
const Delete = z.object({ id: z.uuid() });

const BAD_PRICE = "Enter the price in BHD, for example 1.500.";

export async function GET() {
  return withOwner(async (staff) => Response.json({ menu: await readMenu(staff.venueId) }));
}

export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Post.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Add a name, and a price for an item.");
    const d = parsed.data;
    if (d.kind === "category") {
      await addCategory(staff.venueId, d.nameEn, d.nameAr);
    } else {
      const priceFils = parsePriceFils(d.price);
      if (priceFils === null) return fail(BAD_PRICE);
      if (!(await addItem(staff.venueId, d.categoryId, { ...d, priceFils }))) return fail("Section not found.", 404);
    }
    return Response.json({ menu: await readMenu(staff.venueId) });
  });
}

export async function PATCH(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Patch.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Add a name and a price.");
    const priceFils = parsePriceFils(parsed.data.price);
    if (priceFils === null) return fail(BAD_PRICE);
    if (!(await editItem(staff.venueId, parsed.data.id, { ...parsed.data, priceFils }))) return fail("Item not found.", 404);
    return Response.json({ menu: await readMenu(staff.venueId) });
  });
}

export async function DELETE(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Delete.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the item.");
    if (!(await removeItem(staff.venueId, parsed.data.id))) return fail("Item not found.", 404);
    return Response.json({ menu: await readMenu(staff.venueId) });
  });
}
