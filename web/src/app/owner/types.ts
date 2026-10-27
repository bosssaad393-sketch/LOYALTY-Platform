// Shapes of the owner API. They follow docs/OWNER-APP-CONTRACT.md.

export type Me = { name: string; role: string; venue: string };

export type Summary = {
  members: number;
  newThisWeek: number;
  visits7d: number;
  visitsPrev7d: number;
  pointsHeld: number;
  rewards30d: number;
  perDay14: { day: string; visits: number }[];
};

export type Guest = { cardId: string; code: string; name: string; points: number; visits: number; lastVisit: string | null; joined: string };
export type Rules = { pointsPerBhd: number; rewardGoal: number; rewardText: string };
export type Member = { id: string; name: string; role: string; active: boolean; email: string; me: boolean };

export type Audience = "all" | "apple" | "google";
// withdrawnAt is set once the owner has withdrawn the message from the cards (round 3).
export type Offer = { id: string; message: string; audience: Audience; sentAt: string; recipients: number; withdrawnAt: string | null };
// eligibleApple / eligibleGoogle are NOT in the contract yet. The screen shows them if the back end ever adds them.
export type Offers = { eligible: number; total: number; offers: Offer[]; eligibleApple?: number; eligibleGoogle?: number };

export type DeletionRequest = { id: string; cardId: string; label: string; requestedAt: string; status: "pending" | "erased" };
export type Terms = { text: string; updatedAt: string | null; isDefault: boolean };
export type Privacy = { requests: DeletionRequest[]; terms: Terms };

// GET /api/owner/points?range=... (round 2 contract). `from` and `to` are Bahrain calendar days (YYYY-MM-DD), both included.
export type PointsRange = "today" | "7d" | "30d" | "all";
export type PointsDay = { day: string; issued: number; redeemed: number };
export type Points = {
  range: PointsRange;
  from: string;
  to: string;
  issued: number;
  redeemed: number;
  rewards: number;
  visits: number;
  billBhd: number;
  held: number;
  perDay: PointsDay[];
};

export type Tab = "overview" | "guests" | "rules" | "offers" | "team" | "privacy";

export type Res<T> = { ok: true; data: T } | { ok: false; error: string; status: number };
export type Call = <T>(path: string, method?: string, body?: unknown) => Promise<Res<T>>;
export type Note = { kind: "ok" | "bad"; text: string };
