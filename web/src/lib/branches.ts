// Branches (migration 0022): one business, one card, several places. Pure helpers; branchesDb.ts does the reads.

export type Branch = {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  /** 'partner' = a counter that only redeems vouchers (a sister restaurant): no visits are recorded there. */
  kind: "branch" | "partner";
  address: string | null;
  phone: string | null;
  mapsUrl: string | null;
  reviewUrl: string | null;
  menuUrl: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
};

type Raw = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function toBranch(r: Raw): Branch {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    nameAr: text(r.name_ar),
    kind: r.kind === "partner" ? "partner" : "branch",
    address: text(r.address),
    phone: text(r.phone),
    mapsUrl: text(r.maps_url),
    reviewUrl: text(r.review_url),
    menuUrl: text(r.menu_url),
    lat: num(r.lat),
    lng: num(r.lng),
    active: r.active !== false,
  };
}

/** Apple allows at most 10 locations on a pass. */
export const MAX_PASS_LOCATIONS = 10;
/** How close a guest must be for the card to come up on the lock screen, in metres. */
export const PASS_RADIUS_M = 100;

export type PassLocation = { latitude: number; longitude: number; relevantText: string };

/** Lock-screen locations for the Wallet pass: every active place with coordinates, own branches before partners. */
export function passLocations(branches: Branch[], venueName: string): PassLocation[] {
  return branches
    .filter((b) => b.active && b.lat !== null && b.lng !== null)
    .sort((a, b) => Number(a.kind === "partner") - Number(b.kind === "partner"))
    .slice(0, MAX_PASS_LOCATIONS)
    .map((b) => ({
      latitude: b.lat!,
      longitude: b.lng!,
      relevantText: b.kind === "partner" ? `${b.name} is nearby. Your card is ready.` : `Welcome to ${venueName}, ${b.name}. Show your card.`,
    }));
}

/**
 * Where a staff member is working. A person tied to one branch always works there; everyone else (owner, manager,
 * staff with no branch) must say which, unless the venue has no branches (null) or exactly one place to choose.
 * "choose" = the screen has to ask; "forbidden" = that place is not theirs.
 */
export function workingBranch(staffBranchId: string | null, asked: string | null, branches: Branch[]): string | null | "choose" | "forbidden" {
  const active = branches.filter((b) => b.active);
  if (active.length === 0) return null;
  if (staffBranchId) {
    if (asked && asked !== staffBranchId) return "forbidden";
    return active.some((b) => b.id === staffBranchId) ? staffBranchId : "forbidden";
  }
  if (asked) return active.some((b) => b.id === asked) ? asked : "forbidden";
  return active.length === 1 ? active[0].id : "choose";
}
