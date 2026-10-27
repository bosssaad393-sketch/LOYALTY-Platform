/**
 * Turns an owner's chat message into ONE proposed action. Plain rules, no AI model: predictable, free, testable.
 * An AI planner can be plugged in later with the same output type (`Planner`); whatever it proposes still goes through
 * the same validation, the same role check and the same "reply yes to confirm" step.
 * Nothing here touches a database. Guests are named or numbered; they are looked up (inside the owner's own venue) by the service.
 */

export const MAX_ADJUST = 1000;

export type GuestRef = { code?: string; name?: string };

export type Proposal =
  | { type: "set_points_rate"; pointsPerBhd: number }
  | { type: "set_reward"; rewardGoal?: number; rewardText?: string }
  | { type: "send_offer"; message: string }
  | { type: "adjust_points"; guest: GuestRef; delta: number; reason: string };

export type Parsed =
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "help" }
  | { kind: "greeting" }
  | { kind: "action"; action: Proposal }
  | { kind: "clarify"; question: string }
  | { kind: "unsupported"; why: "unsupported" | "limit" };

export type Planner = (text: string) => Parsed | Promise<Parsed>;

const WORD = String.raw`[\p{L}\p{N}'’.\- ]`;
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const stripEnd = (s: string) => tidy(s.replace(/[\s.!?؟,;:]+$/u, "").replace(/^["'“”‘’]+|["'“”‘’]+$/gu, ""));
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const CONFIRM = /^(yes|yep|yeah|y|confirm|confirmed|ok|okay|sure|go ahead|do it|please do|approve|نعم|اي|أيوه)[\s.!]*$/iu;
const CANCEL = /^(no|nope|cancel|stop|never ?mind|dont|don'?t|abort|لا|الغاء|إلغاء)[\s.!]*$/iu;
const HELP = /^(help|what can you do\??|options|menu|commands|مساعدة)[\s.!?]*$/iu;
const GREETING = /^(hi|hello|hey|salam|good (morning|evening|afternoon)|السلام عليكم|مرحبا)\b[^\n]{0,24}$/iu;

const SET_VERB = String.raw`(?:change|set|make|update|edit|switch|modify)`;

function pointsRate(t: string): Parsed | null {
  const m =
    t.match(new RegExp(String.raw`\b(\d{1,4})\s+points?\s+(?:per|for\s+(?:every|each)|for)\s+(?:1\s+|one\s+)?(?:bhd|bd|dinar|dinars)\b`, "iu")) ||
    t.match(new RegExp(String.raw`\b(?:points?|rate)\b[^\d\n]{0,40}\bper\s+(?:bhd|bd|dinar|dinars)\b[^\d\n]{0,20}?(\d{1,4})\b`, "iu")) ||
    t.match(new RegExp(String.raw`\bpoints?\s+rate\b[^\d\n]{0,20}?(\d{1,4})\b`, "iu"));
  if (!m) return null;
  if (!new RegExp(String.raw`\b${SET_VERB}\b|\bgive\b|\bearn\b|\bper\b|\bwant\b|\bneed\b|\bwould like\b`, "iu").test(t)) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 100) return { kind: "clarify", question: "Points per BHD can be anywhere from 1 to 100. Which number would you like?" };
  return { kind: "action", action: { type: "set_points_rate", pointsPerBhd: n } };
}

function reward(t: string): Parsed | null {
  if (!/\b(reward|prize|gift)\b/iu.test(t) || !new RegExp(String.raw`\b${SET_VERB}\b|\bnew reward\b|\binstead\b`, "iu").test(t)) return null;
  let goal: number | undefined;
  let text: string | undefined;
  const goalMatch = t.match(/\b(?:at|for|after|when|once|goal(?:\s+(?:to|at|of))?|needs?|need|reach(?:es)?|with)\s+(\d{2,6})\s*points?\b/iu) || t.match(/\b(\d{2,6})\s*points?\b/iu);
  if (goalMatch) goal = Number(goalMatch[1]);
  const textMatch =
    t.match(new RegExp(String.raw`\b(?:reward|prize)(?:\s+text)?\s*(?:to|=|:|is|should be|becomes|into)\s+(.+)$`, "iu")) ||
    t.match(new RegExp(String.raw`\b(?:the\s+)?(?:reward|prize)\s+((?:a|an|free|one|two|1|2)\b.+)$`, "iu"));
  if (textMatch) {
    let x = textMatch[1];
    x = x.replace(/\s*(?:,|\.|\band\b)?\s*(?:at|for|after|when|once|with|needs?|need|reach(?:es)?)\s+\d{2,6}\s*points?.*$/iu, "");
    x = x.replace(/^\d{2,6}\s*points?\.?$/iu, "");
    x = stripEnd(x);
    if (x && /\p{L}{2,}/u.test(x)) text = cap(x);
  }
  if (goal === undefined && text === undefined) return { kind: "clarify", question: "What should the reward be, and at how many points? For example: change the reward to a free dessert at 300 points." };
  if (goal !== undefined && (goal < 10 || goal > 100000)) return { kind: "clarify", question: "The reward goal can be from 10 to 100,000 points. Which number would you like?" };
  if (text !== undefined && text.length > 120) return { kind: "clarify", question: "The reward text is too long: keep it under 120 characters." };
  return { kind: "action", action: { type: "set_reward", ...(goal !== undefined ? { rewardGoal: goal } : {}), ...(text !== undefined ? { rewardText: text } : {}) } };
}

function offer(t: string): Parsed | null {
  const wants =
    /\bsend\b[^\n]{0,40}\b(notification|notifications|message|messages|offer|update|alert|push|announcement|promo|promotion)\b/iu.test(t) ||
    /\b(notify|tell|message|text)\b[^\n]{0,30}\b(all|every(?:one|body)|guests|customers|members|clients)\b/iu.test(t) ||
    /\bpush\b[^\n]{0,20}\b(notification|message)\b/iu.test(t);
  if (!wants) return null;
  let body: string | undefined;
  const quoted = t.match(/["“”«]([^"“”»]{2,})["“”»]/u);
  if (quoted) body = quoted[1];
  if (!body) body = t.match(/\b(?:saying|says?|that says|which says|with the (?:text|message)|with|text|message|that)\s*[:\-]?\s+(.+)$/iu)?.[1];
  if (!body) body = t.match(/:\s*(.+)$/u)?.[1];
  if (body) body = stripEnd(body.replace(/^(?:that|saying|:)\s+/iu, ""));
  if (!body || body.length < 2 || /^(to )?(all|everyone|guests|customers|members)$/iu.test(body)) {
    return { kind: "clarify", question: "What should the notification say? Write the exact words, for example: send a notification saying Double points this Friday." };
  }
  return { kind: "action", action: { type: "send_offer", message: cap(body) } };
}

function guestFrom(segment: string): GuestRef {
  const code = segment.match(/(?:\b(?:card|code)\b\s*#?\s*|#)\s*(\d{4})\b/iu)?.[1] || segment.match(/\b(\d{4})\b/u)?.[1];
  if (code) return { code };
  const name = stripEnd(
    segment
      .replace(/\b(?:the\s+)?(?:guest|customer|member|client|card|account)\b/giu, " ")
      .replace(/\b(?:because|since|as|reason|for|due to)\b.*$/iu, "")
      .replace(/^(?:to|from|off|of|for)\s+/iu, ""),
  );
  return name ? { name } : {};
}

function adjust(t: string): Parsed | null {
  let delta = 0;
  let segment = "";
  let m = t.match(/\b(?:add|give|award|grant|credit|top up)\s+(\d{1,6})\s+(?:bonus\s+|extra\s+)?points?\s+(?:to|for|on)\s+(.+)$/iu);
  if (m) { delta = Number(m[1]); segment = m[2]; }
  if (!m) {
    m = t.match(/\b(?:remove|take|deduct|subtract|reduce|delete|minus)\s+(\d{1,6})\s+points?\s+(?:from|off|of|on)\s+(.+)$/iu);
    if (m) { delta = -Number(m[1]); segment = m[2]; }
  }
  if (!m) {
    m = t.match(/\bgive\s+(.+?)\s+(\d{1,6})\s+(?:bonus\s+|extra\s+)?points?\b(.*)$/iu);
    if (m) { delta = Number(m[2]); segment = m[1] + " " + m[3]; }
  }
  if (!m) return null;
  if (Math.abs(delta) > MAX_ADJUST) return { kind: "unsupported", why: "limit" };
  const guest = guestFrom(segment);
  if (!guest.code && !guest.name) return { kind: "clarify", question: "Which guest? Give me the 4-digit code on their card, or their full name." };
  const reason = stripEnd(t.match(/\b(?:because|since|reason:?|due to)\s+(.+)$/iu)?.[1] || "") || "Owner request via the assistant";
  return { kind: "action", action: { type: "adjust_points", guest, delta, reason: reason.slice(0, 200) } };
}

/** The built-in planner. */
export const parseRequest = (raw: string): Parsed => {
  const t = tidy(raw || "");
  if (!t) return { kind: "greeting" };
  if (t.length <= 40) {
    if (CONFIRM.test(t)) return { kind: "confirm" };
    if (CANCEL.test(t)) return { kind: "cancel" };
    if (HELP.test(t)) return { kind: "help" };
    if (GREETING.test(t)) return { kind: "greeting" };
  }
  // Order matters: adjust and offer have the most specific phrasing, then rate and reward.
  return adjust(t) || offer(t) || pointsRate(t) || reward(t) || { kind: "unsupported", why: "unsupported" };
};
