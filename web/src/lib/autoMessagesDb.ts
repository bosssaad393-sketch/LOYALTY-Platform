import "server-only";
import { z } from "zod";
import { db } from "./supabase";
import type { Staff } from "./staffAuth";
import { notifyAppleDevices } from "./apns";
import { DEFAULT_MESSAGES, dueBirthdays, dueWinbacks, liveNotice, type AutoGuest, type AutoKind, type AutoSetting, type DueMessage } from "./autoMessages";

// Automatic notices (migration 0022). The daily job (api/cron/daily) writes one message_log row per guest who is due,
// then wakes their Wallet card, which shows the notice on its back and announces it once.

type Raw = Record<string, unknown>;

/** The venue's two notices, with the built-in wording when the owner has not changed anything. Never throws. */
export async function readAutoMessages(venueId: string): Promise<Record<AutoKind, AutoSetting>> {
  const out = { birthday: { ...DEFAULT_MESSAGES.birthday }, winback: { ...DEFAULT_MESSAGES.winback } };
  try {
    const { data, error } = await db().from("auto_messages").select("kind, enabled, text_en, text_ar, days").eq("venue_id", venueId);
    if (error) return out;
    for (const r of (data ?? []) as Raw[]) {
      const kind = r.kind === "birthday" || r.kind === "winback" ? r.kind : null;
      if (!kind) continue;
      out[kind] = { kind, enabled: r.enabled !== false, textEn: String(r.text_en), textAr: typeof r.text_ar === "string" && r.text_ar ? r.text_ar : null, days: Number(r.days) || 14 };
    }
  } catch { /* defaults */ }
  return out;
}

export const AutoMessageInput = z.object({
  kind: z.enum(["birthday", "winback"]),
  enabled: z.boolean(),
  textEn: z.string().trim().min(1).max(200),
  textAr: z.string().trim().max(200).transform((v) => v || null).optional().default(null),
  days: z.number().int().min(1).max(365).default(14),
});

/** Saves one notice of the SIGNED-IN person's venue. Audited. */
export async function saveAutoMessage(staff: Staff, input: z.infer<typeof AutoMessageInput>): Promise<AutoSetting> {
  const row = { venue_id: staff.venueId, kind: input.kind, enabled: input.enabled, text_en: input.textEn, text_ar: input.textAr, days: input.days };
  const { data: old } = await db().from("auto_messages").select("kind").eq("venue_id", staff.venueId).eq("kind", input.kind).maybeSingle();
  const { error } = old
    ? await db().from("auto_messages").update(row).eq("venue_id", staff.venueId).eq("kind", input.kind)
    : await db().from("auto_messages").insert(row);
  if (error) throw error;
  await db().from("audit_log").insert({ venue_id: staff.venueId, actor: staff.id, action: "auto_message_changed", detail: { kind: input.kind, enabled: input.enabled, days: input.days } });
  return { kind: input.kind, enabled: input.enabled, textEn: input.textEn, textAr: input.textAr, days: input.days };
}

async function guestsOf(venueId: string): Promise<AutoGuest[]> {
  const { data, error } = await db().from("cards").select("id, last_visit, member_id, members(name, consent_news, deleted_at, birth_day, birth_month)").eq("venue_id", venueId);
  if (error) throw error;
  return ((data ?? []) as Raw[]).map((c) => {
    const m = (c.members ?? {}) as Raw;
    return {
      cardId: String(c.id),
      firstName: String(m.name ?? "").trim().split(/\s+/)[0] || "",
      consentNews: m.consent_news === true,
      deleted: Boolean(m.deleted_at),
      birthDay: m.birth_day === null || m.birth_day === undefined ? null : Number(m.birth_day),
      birthMonth: m.birth_month === null || m.birth_month === undefined ? null : Number(m.birth_month),
      lastVisit: typeof c.last_visit === "string" ? c.last_visit : null,
    };
  });
}

export type DailyResult = { venues: number; birthday: number; winback: number };

/**
 * The daily job: for every active venue, who is due a birthday or a "we miss you" notice today.
 * Safe to run more than once a day: message_log allows one row per guest, kind and period.
 */
export async function runDailyMessages(now: number = Date.now()): Promise<DailyResult> {
  const result: DailyResult = { venues: 0, birthday: 0, winback: 0 };
  const { data: venues, error } = await db().from("venues").select("id").eq("active", true);
  if (error) throw error;
  for (const v of (venues ?? []) as { id: string }[]) {
    result.venues++;
    const settings = await readAutoMessages(v.id);
    if (!settings.birthday.enabled && !settings.winback.enabled) continue;
    const guests = await guestsOf(v.id);
    const due: DueMessage[] = [...dueBirthdays(guests, settings.birthday, now), ...dueWinbacks(guests, settings.winback, now)];
    for (const d of due) {
      const { data: seen } = await db().from("message_log").select("id").eq("card_id", d.cardId).eq("kind", d.kind).eq("period", d.period).maybeSingle();
      if (seen) continue;
      const { error: e } = await db().from("message_log").insert({ card_id: d.cardId, venue_id: v.id, kind: d.kind, period: d.period, message: d.message, sent_at: new Date(now).toISOString() });
      if (e) continue; // 23505: another run wrote it first
      result[d.kind]++;
      await notifyAppleDevices(d.cardId);
    }
  }
  return result;
}

/** The notice a card shows now (the newest one from the last 7 days), or null. Never throws. */
export async function noticeForCard(cardId: string, now: number = Date.now()): Promise<{ message: string; sent_at: string; kind: AutoKind } | null> {
  try {
    const { data, error } = await db().from("message_log").select("message, sent_at, kind").eq("card_id", cardId).order("sent_at", { ascending: false }).limit(5);
    if (error) return null;
    return liveNotice((data ?? []) as { message: string; sent_at: string; kind: AutoKind }[], now);
  } catch {
    return null;
  }
}

/** When these cards last got a notice, for Apple Wallet's update check. */
export async function noticeStamps(cardIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!cardIds.length) return out;
  try {
    const { data, error } = await db().from("message_log").select("card_id, sent_at").in("card_id", cardIds);
    if (error) return out;
    for (const r of (data ?? []) as Raw[]) {
      const t = Date.parse(String(r.sent_at));
      if (t > (out.get(String(r.card_id)) ?? 0)) out.set(String(r.card_id), t);
    }
  } catch { /* best effort */ }
  return out;
}
