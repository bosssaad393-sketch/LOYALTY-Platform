import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { readMenu, setItemPhoto, venueItem } from "@/lib/table/db";
import { parsePhoto, storePhoto } from "@/lib/table/photo";

const Post = z.object({ id: z.uuid(), image: z.string().max(1_000_000) });
const Delete = z.object({ id: z.uuid() });

/** Adds or replaces a menu item's photo. The item must belong to the signed-in person's venue. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Post.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("That photo is too large. Please choose a smaller one.");
    if (!(await venueItem(staff.venueId, parsed.data.id))) return fail("Item not found.", 404);
    const photo = parsePhoto(parsed.data.image);
    if (!photo) return fail("Please choose a JPEG, PNG or WebP photo.");
    await setItemPhoto(staff.venueId, parsed.data.id, await storePhoto(staff.venueId, parsed.data.id, photo));
    return Response.json({ menu: await readMenu(staff.venueId) });
  });
}

export async function DELETE(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Delete.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Check the item.");
    if (!(await setItemPhoto(staff.venueId, parsed.data.id, null))) return fail("Item not found.", 404);
    return Response.json({ menu: await readMenu(staff.venueId) });
  });
}
