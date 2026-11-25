// The owner's activity log: who did what, in plain words. Pure, so the wording is easy to test.

export type ActivityRow = { id: string | number; action: string; actor: string; branchId: string | null; at: string; detail: Record<string, unknown> };

/** The actions an owner cares about, and how each one reads. Anything else stays out of the list. */
export const ACTIVITY_TEXT: Record<string, string> = {
  visit: "Recorded a visit",
  voucher_redeem: "Used a guest's voucher",
  voucher_void: "Cancelled a voucher",
  voucher_given: "Gave a guest a gift",
  voucher_added: "Added a gift",
  voucher_changed: "Changed a gift",
  branch_added: "Added a branch",
  branch_changed: "Changed a branch",
  staff_added: "Added a team member",
  staff_branch_changed: "Moved a team member to another branch",
  staff_activated: "Switched a team member on",
  staff_deactivated: "Switched a team member off",
  pin_set: "Set a PIN",
  pin_locked: "Sign-in was paused after too many wrong PINs",
  guests_exported: "Downloaded the guest list",
  guest_erased: "Erased a guest",
  auto_message_changed: "Changed an automatic message",
  links_changed: "Changed the venue's links",
  stamp: "Added a stamp",
  redeem: "Gave a reward",
  earn: "Added points",
};

export const ACTIVITY_ACTIONS = Object.keys(ACTIVITY_TEXT);

export type ActivityView = { id: string; what: string; who: string; branch: string | null; at: string; extra: string | null };

export function activityView(row: ActivityRow, staffNames: Map<string, string>, branchNames: Map<string, string>): ActivityView {
  const d = row.detail ?? {};
  const extra = row.action === "visit" && Number(d.vouchers_issued) > 0 ? "A gift was unlocked"
    : row.action === "guests_exported" ? `${Number(d.rows) || 0} guests`
    : typeof d.name === "string" ? d.name
    : typeof d.title === "string" ? d.title : null;
  return {
    id: String(row.id),
    what: ACTIVITY_TEXT[row.action] ?? row.action,
    who: staffNames.get(row.actor) ?? (row.actor === "guest" ? "A guest" : row.actor === "system" ? "The system" : "Someone no longer on the team"),
    branch: row.branchId ? branchNames.get(row.branchId) ?? null : null,
    at: row.at,
    extra,
  };
}
