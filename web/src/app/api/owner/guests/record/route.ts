import { z } from "zod";
import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { addGuestNote, guestRecord, removeGuestNote, setGuestTags } from "@/lib/guestCrmDb";
import { MAX_TAG_LENGTH, MAX_TAGS } from "@/lib/guestCrm";

const NOT_READY = "Notes and labels are not switched on for this venue yet. Ask Orbyn.";

/** One guest's record: where they stand, their labels, and the story of their card. Owner and manager. */
export async function GET(request: Request) {
  return withOwner(async (staff) => {
    const cardId = new URL(request.url).searchParams.get("cardId") ?? "";
    if (!z.uuid().safeParse(cardId).success) return fail("Guest missing.");
    const record = await guestRecord(staff.venueId, cardId);
    return record ? Response.json({ record }) : fail("Guest not found.", 404);
  });
}

const Change = z.discriminatedUnion("do", [
  z.object({ do: z.literal("note"), cardId: z.uuid(), body: z.string().trim().min(1).max(600) }),
  z.object({ do: z.literal("remove_note"), cardId: z.uuid(), noteId: z.uuid() }),
  z.object({ do: z.literal("tags"), cardId: z.uuid(), tags: z.array(z.string().max(MAX_TAG_LENGTH * 2)).max(MAX_TAGS * 2) }),
]);

/** Adds or removes a note, or sets the labels. Answers with the fresh record so the screen shows what was saved. */
export async function POST(request: Request) {
  return withOwner(async (staff) => {
    const parsed = Change.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Write a note of up to 600 characters, or choose up to 8 labels.");
    const c = parsed.data;
    if (c.do === "note") {
      const r = await addGuestNote(staff, c.cardId, c.body);
      if (r === "no_card") return fail("Guest not found.", 404);
      if (r === "not_ready") return fail(NOT_READY, 409);
    } else if (c.do === "remove_note") {
      if (!(await removeGuestNote(staff, c.noteId))) return fail("Note not found.", 404);
    } else {
      const r = await setGuestTags(staff, c.cardId, c.tags);
      if (r === "no_card") return fail("Guest not found.", 404);
      if (r === "not_ready") return fail(NOT_READY, 409);
    }
    const record = await guestRecord(staff.venueId, c.cardId);
    return record ? Response.json({ record }) : fail("Guest not found.", 404);
  });
}
