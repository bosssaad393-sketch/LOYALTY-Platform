// Sample-data mode: the whole product runs on invented guests so it can be shown to a business before they sign up.
// On while developing with LOYALTY_FAKE_DB=1, or on a hosted demo with ORBYN_DEMO=1 (an explicit switch: that deployment
// then never touches a real database, and what people change in it is kept in memory only).

type Env = Record<string, string | undefined>;

export function sampleMode(env: Env = process.env): boolean {
  return env.ORBYN_DEMO === "1" || (env.LOYALTY_FAKE_DB === "1" && env.NODE_ENV !== "production");
}

/** The PINs of the sample owner and the sample staff member. Shown on the sign-in screen in sample mode, and only there. */
export const SAMPLE_OWNER_PIN = "482615";
export const SAMPLE_STAFF_PIN = "4826";

export type SampleNote = { ownerPin: string; staffPin: string } | null;

export function sampleNote(env: Env = process.env): SampleNote {
  return sampleMode(env) ? { ownerPin: SAMPLE_OWNER_PIN, staffPin: SAMPLE_STAFF_PIN } : null;
}
