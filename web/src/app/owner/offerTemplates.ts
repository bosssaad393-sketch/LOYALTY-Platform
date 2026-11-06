// Message templates for the owner's "Send an update" screen (Offers tab).
//
// Pure data and one small helper, no imports. Written for a high-end venue: warm, brief, understated,
// like a hotel concierge and not like a supermarket flyer. House rules, enforced by tests/offerTemplates.test.ts:
//  - no exclamation marks, no emojis, no ALL CAPS words, no pressure words ("hurry", "last chance"), no mention of alcohol;
//  - nothing about the venue is stated as fact: prices, dish names, hours, discounts and events are always {placeholders};
//  - the examples below only show the shape of a message, they are NOT real offers;
//  - a template filled with its examples is 200 characters or fewer (the Wallet notification limit), and so is
//    the worst case where every field is filled to its maxLength, so the field limits alone keep a message valid;
//  - the first 40 characters carry the point, because a lock screen cuts the rest.
//
// For the screen: when a field is left empty fillTemplate uses its example, so show the preview and make it clear
// which parts are still examples before the owner sends. fillTemplate does not shorten anything; the screen still
// checks the 200-character limit on the final text.

export type OfferField = { key: string; label: string; example: string; maxLength: number };
export type OfferTemplate = {
  id: string; // kebab-case, unique
  title: string; // short name on the chip, 2 to 4 words
  when: string; // one line: when an owner would use it
  text: string; // the message with {key} placeholders, 200 characters or fewer AFTER filling the examples
  fields: OfferField[]; // every {key} used in text, in the order the owner fills them
  sample?: boolean; // true for the sample message
};

/** Sample sender name. Only used by the "Today's update" sample; it is not a real person at the venue. */
export const DEFAULT_SIGNED_BY = "the manager";

export const OFFER_TEMPLATES: OfferTemplate[] = [
  {
    id: "todays-update",
    title: "Today's update",
    when: "A short daily note. Replace the examples with your own offers.",
    text: "Update from {from}: today's reward is {reward}. Today's bonus is {bonus}.",
    fields: [
      { key: "from", label: "From", example: DEFAULT_SIGNED_BY, maxLength: 30 },
      { key: "reward", label: "Today's reward", example: "a complimentary dessert with any main", maxLength: 60 },
      { key: "bonus", label: "Today's bonus", example: "double points until midnight", maxLength: 50 },
    ],
    sample: true,
  },
  {
    id: "weekend-invitation",
    title: "Weekend invitation",
    when: "A day or two before the weekend, to invite guests to dine with you.",
    text: "Join us {when}. {detail} We would be glad to welcome you.",
    fields: [
      { key: "when", label: "Which evening", example: "this Friday evening", maxLength: 40 },
      { key: "detail", label: "A line about the evening", example: "A calm evening with good food and good company.", maxLength: 100 },
    ],
  },
  {
    id: "new-on-the-menu",
    title: "New on the menu",
    when: "When a dish or a menu is new and you would like regular guests to hear first.",
    text: "New on the menu: {dish}. {detail} We would love you to be among the first to try it.",
    fields: [
      { key: "dish", label: "The dish or menu", example: "a new seasonal dish", maxLength: 50 },
      { key: "detail", label: "A line about it", example: "Ask our team about it on your next visit.", maxLength: 70 },
    ],
  },
  {
    id: "event-evening",
    title: "Music or event night",
    when: "To announce live music, a tasting or another event, with the day and time.",
    text: "{event} on {date}. {detail} We would be pleased to see you there.",
    fields: [
      { key: "event", label: "The event", example: "An evening of live music", maxLength: 50 },
      { key: "date", label: "Day and time", example: "Thursday at 8 pm", maxLength: 30 },
      { key: "detail", label: "A line of detail", example: "Reservations are welcome.", maxLength: 70 },
    ],
  },
  {
    id: "thank-you",
    title: "Thank you",
    when: "A quiet thank-you to every guest after a busy period or at the end of a season.",
    text: "Thank you for being one of our guests {period}. {note} We look forward to welcoming you again.",
    fields: [
      { key: "period", label: "Period", example: "this season", maxLength: 30 },
      { key: "note", label: "A personal line", example: "It was a pleasure to have you at our tables.", maxLength: 80 },
    ],
  },
  {
    id: "we-miss-you",
    title: "We miss you",
    when: "After a quiet spell, to invite guests back. It reaches everyone who agreed, so the wording stays general.",
    text: "We have missed seeing you. {note} Whenever you are ready, we would be glad to welcome you back.",
    fields: [{ key: "note", label: "A line from us", example: "Your card is always welcome with us.", maxLength: 100 }],
  },
  {
    id: "reward-ready",
    title: "Reward ready",
    when: "To remind guests that a reward can be enjoyed. Each card shows its own points, so this suits everyone.",
    text: "A reward may be waiting on your card. {reward} is yours to enjoy on your next visit. Just show your card to our team.",
    fields: [{ key: "reward", label: "The reward", example: "A complimentary dessert", maxLength: 60 }],
  },
  {
    id: "birthday-month",
    title: "Birthday month",
    when: "At the start of a month. Cards hold no birthdays, so the wording invites those who celebrate to speak up.",
    text: "If your birthday falls in {month}, we would love to celebrate with you. {gift}",
    fields: [
      { key: "month", label: "Month", example: "October", maxLength: 20 },
      { key: "gift", label: "What you offer", example: "Mention it when you reserve and we will be delighted to mark the evening.", maxLength: 100 },
    ],
  },
  {
    id: "group-and-private-dining",
    title: "Group and private dining",
    when: "To invite a larger party. Use it only if you take group or private bookings.",
    text: "Planning {occasion}? Our team would be pleased to arrange the evening for your group. {how}",
    fields: [
      { key: "occasion", label: "Occasion", example: "a family celebration", maxLength: 40 },
      { key: "how", label: "How to enquire", example: "Message us with the date and the number of guests.", maxLength: 80 },
    ],
  },
  {
    id: "seasonal-greeting",
    title: "Seasonal greeting",
    when: "For Ramadan, Eid, National Day or the new year. A greeting only: no offer, no sales language.",
    text: "{greeting} from all of us. {wish} We are grateful to have you with us.",
    fields: [
      { key: "greeting", label: "Greeting", example: "Ramadan Kareem", maxLength: 40 },
      { key: "wish", label: "A wish", example: "May this season bring you peace, health and time with those you love.", maxLength: 100 },
    ],
  },
  {
    id: "quiet-midweek",
    title: "Quiet midweek",
    when: "To invite guests on a slower weekday, without any pressure.",
    text: "Midweek, unhurried. {day} evenings are a calm time to dine with us. {detail} We would be glad to see you.",
    fields: [
      { key: "day", label: "Day or days", example: "Tuesday", maxLength: 30 },
      { key: "detail", label: "A line of detail", example: "Reservations are welcome.", maxLength: 70 },
    ],
  },
];

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

const tidy = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * Fills a template. Each {key} becomes the owner's value (trimmed, line breaks and runs of spaces collapsed to one
 * space). A missing or blank value falls back to the field's example. A double full stop that appears because an owner
 * ended a value with a full stop is reduced to one; an ellipsis (three dots) is kept, four become three. The result is
 * trimmed and never shortened.
 */
export function fillTemplate(t: OfferTemplate, values: Record<string, string>): string {
  const examples = new Map(t.fields.map((f) => [f.key, f.example]));
  const filled = t.text.replace(PLACEHOLDER, (whole: string, key: string) => {
    const given = Object.prototype.hasOwnProperty.call(values, key) && typeof values[key] === "string" ? tidy(values[key]) : "";
    if (given) return given;
    return examples.has(key) ? tidy(examples.get(key) as string) : whole;
  });
  return tidy(filled).replace(/\.{2,}/g, (dots) => (dots.length === 2 ? "." : dots.length === 3 ? dots : "..."));
}
