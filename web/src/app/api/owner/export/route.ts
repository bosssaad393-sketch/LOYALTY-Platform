import { db } from "@/lib/supabase";
import { withOwner } from "@/lib/ownerApi";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote everything and neutralise spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};

/** CSV of all guests with contact details. Owner-only, logged. */
export async function GET() {
  return withOwner(async (staff) => {
    const { data, error } = await db()
      .from("cards")
      .select("code, points, visits, rewards_given, last_visit, created_at, members(name, phone, email, consent_news)")
      .eq("venue_id", staff.venueId)
      .order("created_at");
    if (error) throw error;
    const rows = [["name", "phone", "email", "code", "points", "visits", "rewards_given", "last_visit", "joined", "offers_ok"].map(cell).join(",")];
    for (const c of data ?? []) {
      const m = c.members as unknown as { name: string; phone: string | null; email: string | null; consent_news: boolean } | null;
      if (!m) continue;
      rows.push([m.name, m.phone, m.email, c.code, c.points, c.visits, c.rewards_given, c.last_visit, c.created_at, m.consent_news ? "yes" : "no"].map(cell).join(","));
    }
    await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "guests_exported", detail: { rows: rows.length - 1 } });
    return new Response(rows.join("\n") + "\n", {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${staff.venueSlug}-guests.csv"`, "cache-control": "no-store" },
    });
  });
}
