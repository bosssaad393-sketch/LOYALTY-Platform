import { fail } from "@/lib/staffApi";
import { withOwner } from "@/lib/ownerApi";
import { ACCESS } from "@/lib/roles";
import { TermsInput, TERMS_MAX_CHARS, TERMS_MIN_CHARS } from "@/lib/terms";
import { saveTerms } from "@/lib/termsDb";

/** Saves the venue's own terms. The guest terms page shows them instead of the built-in clauses. Owner only. */
export async function PUT(request: Request) {
  return withOwner(async (staff) => {
    const parsed = TermsInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail(`The terms must be between ${TERMS_MIN_CHARS} and ${TERMS_MAX_CHARS} characters.`);
    await saveTerms(staff, parsed.data.text);
    return Response.json({ ok: true });
  }, ACCESS.termsEdit);
}
