// Who may call what in the owner app. Pure, so it can be tested without a session or a database.

export type Role = "staff" | "manager" | "owner" | "developer";

/** Owner-only actions need the owner. Everything else on the owner screens is open to owner and manager. */
export function roleAllowed(role: Role, ownerOnly: boolean): boolean {
  return ownerOnly ? role === "owner" : role === "owner" || role === "manager";
}

/**
 * Access level of the actions added for offers and privacy (true = owner only).
 * A manager can look at offers, but cannot send or withdraw them, erase a guest, read the deletion requests or edit the terms.
 */
export const ACCESS = {
  offersView: false,
  offersSend: true,
  offersWithdraw: true,
  privacyView: true,
  privacyErase: true,
  guestErase: true,
  termsEdit: true,
} as const;
