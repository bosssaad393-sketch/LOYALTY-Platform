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
  /** 0024: extra lock-screen points around this place, so the card comes up from further away (passLocations). */
  wideReach?: boolean;
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
    wideReach: r.wide_reach === true,
    active: r.active !== false,
  };
}

/** Apple allows at most 10 locations on a pass. */
export const MAX_PASS_LOCATIONS = 10;
/**
 * How close a guest must be for the card to come up on the lock screen, in metres. Apple decides the real distance
 * (for a loyalty card "on the order of a hundred meters"); a pass can ask for less, never for more.
 */
export const PASS_RADIUS_M = 100;
/** The wider area: this many extra points in a ring around the place, this far from it (metres). Fewer than 4 is not worth a ring. */
const RING_RADIUS_M: Record<number, number> = { 6: 170, 5: 160, 4: 140 };

export type PassLocation = { latitude: number; longitude: number; relevantText: string };

/** A point `metres` from (lat, lng) in the direction `angle` (radians, 0 = north). Good to a metre at these distances. */
function offset(lat: number, lng: number, metres: number, angle: number) {
  const perDegree = 111_320;
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return { latitude: round(lat + (metres * Math.cos(angle)) / perDegree), longitude: round(lng + (metres * Math.sin(angle)) / (perDegree * Math.cos((lat * Math.PI) / 180))) };
}

/** How far from a place its card can come up, in metres, for a ring of `points` extra points (0 = no ring). Apple's distance is approximate. */
export const reachMetres = (points: number) => (RING_RADIUS_M[points] ?? 0) + PASS_RADIUS_M;

/**
 * Lock-screen locations for the Wallet pass: every active place with coordinates, own branches before partners.
 * Apple fixes the distance at about 100 m and allows ten points. A place set to the wider area uses the points that
 * are left as a ring around it (4 to 6 points), so its card comes up from about 240 to 270 m instead.
 */
export function passLocations(branches: Branch[], venueName: string, env: Record<string, string | undefined> = process.env): PassLocation[] {
  const places = branches
    .filter((b) => b.active && b.lat !== null && b.lng !== null)
    .sort((a, b) => Number(a.kind === "partner") - Number(b.kind === "partner"))
    .slice(0, MAX_PASS_LOCATIONS);
  // BRAND_ARRIVAL_TEXT: the venue's own welcome for its own branches (Saad: "حياك تنورنا يا غالي"), up to 80 characters.
  const own = (env.BRAND_ARRIVAL_TEXT ?? "").trim().slice(0, 80);
  const text = (b: Branch) => (b.kind === "partner" ? `${b.name} is nearby. Your card is ready.` : own || `Welcome to ${venueName}, ${b.name}. Show your card.`);
  const out: PassLocation[] = places.map((b) => ({ latitude: b.lat!, longitude: b.lng!, relevantText: text(b) }));
  let spare = MAX_PASS_LOCATIONS - out.length;
  for (const b of places.filter((p) => p.wideReach)) {
    const points = Math.min(6, spare);
    const radius = RING_RADIUS_M[points];
    if (!radius) break;
    for (let k = 0; k < points; k++) out.push({ ...offset(b.lat!, b.lng!, radius, (2 * Math.PI * k) / points), relevantText: text(b) });
    spare -= points;
  }
  return out;
}

/** How many ring points each wide place gets, by branch id (the same sharing as passLocations), for the owner's screen. */
export function ringPoints(branches: Branch[]): Map<string, number> {
  const places = branches
    .filter((b) => b.active && b.lat !== null && b.lng !== null)
    .sort((a, b) => Number(a.kind === "partner") - Number(b.kind === "partner"))
    .slice(0, MAX_PASS_LOCATIONS);
  const out = new Map<string, number>();
  let spare = MAX_PASS_LOCATIONS - places.length;
  for (const b of places.filter((p) => p.wideReach)) {
    const points = Math.min(6, spare);
    if (!RING_RADIUS_M[points]) break;
    out.set(b.id, points);
    spare -= points;
  }
  return out;
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
