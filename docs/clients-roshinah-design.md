# Al Roshinah: design note (screens, 25 Nov 2026)

Brand guide (research, voice, logo rules, colour and contrast, type, photography, applications, owner questions):
`C:\Users\3amka\Documents\CALABOS\docs\clients\roshinah-brand-guide.html` (one self-contained, print-ready file).

## Settings for this client
```
BRAND_NAME=Al Roshinah
BRAND_DEFAULT_VENUE=roshinah
BRAND_BG="#013220"      # quote the hex values in .env files: unquoted, dotenv reads "#..." as a comment
BRAND_TEXT="#faf8f3"
BRAND_ACCENT="#c9a96e"
BRAND_FONT=oswald       # Oswald capitals (headings, figures) + Hanken Grotesk (text) + Noto Kufi Arabic / Noto Sans Arabic
BRAND_FINISH=matte      # flat: no moving network, no foil, glow or beam; ivory primary buttons; pass in the green itself
BRAND_MARK=type         # no clean logo yet: the name in type inside a thin frame (remove when the logo file arrives)
BRAND_LANGUAGES=en,ar
```
All three new settings are generic (any client can use them) and default to the old look, so Orbyn, Spaloon and the
points sample are unchanged. Tests: `tests/brand.test.ts`.

## Tokens
Their own colours (from their website stylesheet): green `#013220`, text green `#1A2E1E`, gold `#C9A96E`, light gold
`#E0C98A`, ivory `#FAF8F3`. The app derives the rest from the three BRAND colours (`src/lib/brand.ts`, `brandTokens`).
The matte finish adds (`src/app/visit.css`, `.look-matte`): `--ground` (green 74% + black = `#012518`, the page behind
the card), square-ish radii (`--r-sm 3px`, `--r-md 4px`, `--r-xl 8px`, their website's buttons are square), a softer
success colour `#9ccfa9` (8.1:1 on the green). Roles: green = ground and ink on paper; ivory = text and paper; gold =
hairlines, the gift frame and the usable-gift outline at the till. Gold is never text on ivory (2.1:1).

## Type scale (screens)
Libre Baskerville 400 for names, titles and figures: card code 26 to 38 px, page titles 34, section heads 22, names 15
to 21. Jost for everything tapped or read: 16 text, 15.5 buttons and links, 13.5 small, 12 minimum. Noto Naskh Arabic
for Arabic (the serif falls back to it for Arabic letters). Latin digits for codes, visits and dates in both languages.

## What was built
- **Join** (`/join/roshinah`): email and an optional date of birth as two selects, day and month, no year. Why: two
  taps beat scrolling a date wheel back thirty years in a queue; the birthday notice only needs day and month; less
  personal data kept. Half a birthday is caught before sending. `email_required` and `bad_birthday` mark their field.
  `?b=<branch>` is passed on. A venue that sets no `join_fields` gets exactly the old form.
- **Guest card** (visit venues): a flat member card the same shape as the Wallet pass (type mark, code, visits, name,
  member since, last visit, signed QR on an ivory tile); "Your gift" as an ivory ticket with one gold hairline frame
  (ready / used on date / expired), or one line before the first visit naming the gift; "Visit us": each branch with
  Menu, Directions, Call and "Leave a Google review" for every guest (only when the branch has a review link).
- **Staff** (visit venues): branch picker remembered on the phone (localStorage), counter shown with Change; guest
  first name, visits, last visit; one big Record visit (not at a partner counter); gifts with a two-step Redeem
  ("Use ... now? This cannot be undone."), a done state, and "Only at <place>" elsewhere. A guest found by a typed code
  at a staff till cannot spend a gift: the screen asks for a scan instead. The code box also takes a handheld
  scanner's QR text. After a visit that unlocks a gift: one line to tell the guest. No BHD, points or undo wording.
- **Owner** (visit venues): Branches (list, add, edit, switch off; location as "lat, lng" pasted from Google Maps),
  Gifts (counts, trigger, where, expiry), Automatic messages (birthday, we miss you: on/off, EN + AR, days, preview),
  Activity (owner only, by day, filter chips), Works at per team member. Overview, Guests and Rules show no points.
  Tables and menu stay; the points assistant is hidden.
- **Wallet art**: `web/scripts/pass-art-type.mjs` (fonts in `web/passes/_fonts`) made `web/passes/roshinah/*`.
  `walletColors()` with the matte finish puts the pass on `#013220` itself (labels gold 6.35:1, values ivory 13.4:1).

## Placeholders
- The logo: everywhere it would appear, the name is set in type in a frame (`VenueMark`, the pass `logo*.png`,
  `icon*.png` with the initials AR). Replace with the owner's file: `public/venues/roshinah/crest.png` and `icon.png`,
  `passes/roshinah/logo*.png` and `icon*.png`, then remove `BRAND_MARK=type`.
- `public/venues/roshinah/*` (crest monogram, marble, texture) are the generated placeholders from `new-client.mjs`;
  with the matte finish the marble is not shown.

## Open design questions for the owner
1. The original logo file (vector), white and green versions.
2. Official Arabic spelling: الروشنة or الروشينة (and أسماك / أسماق for Asmak).
3. Gold: thin lines only (as built), or more?
4. May the card page use their own photos (garden, breakfast)? Today it uses none.
5. Latin digits in Arabic screens (as built) or Arabic-Indic digits?
6. The line "Where Bahrain Gathers, to Eat, to Share, to Belong" on the join page and table card: yes or no?

## Skills and references used
design-taste-frontend (app-screens rules: colour on data not chrome, one primary per screen, honest empty states,
12 px floor), impeccable (craft floor: no eyebrows on new screens, no nested cards, no gradient text, states),
app-ui-references (scan, then a result sheet; result first, one primary button; motion once), anti-ui-slop (work from
the product's own objects: the gift ticket, the branch list), brand (guide structure: voice chart, logo, colour, type,
imagery), design-md-library `starbucks` (structure only: green tiers by surface role, gold kept for reward ceremony).
premium-frontend-ui was read; its landing-page motion advice does not fit working screens and was not applied.

## Guest pages, 2026-11-25 rework

- Guest hub (home page and till QR): "Welcome to" small, the name large; the real card face (empty before joining, name and visits after, the niche lit while a gift waits); two buttons (card, menu); one glass list of restaurant things only: call, directions, Google review, Wi-Fi, Instagram. A row with nothing set is not drawn.
- The wall moves: `web/public/venues/roshinah/glass-loop.mp4` (0.4 MB, 14 s, plays forward then back so it never jumps), made from the wall picture with Higgsfield (source in `design/roshinah/wall-palm-motion.mp4`). Announced by `"wallLoop": true` in `card.json`. Phones held upright on guest pages only; the still picture stays for reduced motion, data saver, Low Power Mode, wide screens and the staff till.
- A phone that opened its card remembers it (same cookie as table orders), so the hub greets the guest by name; "Not my phone" on the card page undoes it.
- Codes and counts are set in the text face: Marcellus draws its zero as a ring that reads as the letter O.

## Later the same day (Saad's corrections)

- **Lettering follows their own logo.** The logo is square Kufic Arabic with ALROSHINAH in condensed capitals in a frame (file found on their site, 640 x 309 JPG). `web/public/venues/roshinah/wordmark.png` is that logo cleaned to one colour (announced by `"wordmark"` in `card.json`) and replaces the typed stand-in everywhere. Headings are Oswald capitals. The owner should still send the vector file.
- **Colours** (the pairing Saad sent for a watch green): green ground `#013220`, cream ink, warm gold `#c9a96e` as hairline, champagne (a lighter cut of it) as the one filled colour, prices and small signs, warm charcoal `#17140f` for words on champagne and for depth.
- **Our own menu.** `/menu/roshinah` shows their dishes, prices and pictures, copied from their public menu on 2026-11-25 (`web/src/data/menus/roshinah.json`, pictures in `web/public/venues/roshinah/menu/`, seed in `supabase/seeds/roshinah-menu.sql`, needs migration 0023). 90 dishes, 85 pictures. 13 dishes have no Arabic name on their menu. The owner confirms prices before go-live and edits from the owner screen after.
- **Two QR codes.** Till: `/counter/roshinah` goes straight to joining (or to the card a phone already holds). Table: `/t/<table code>` opens the guest page with the table named, after a two-second opening with their logo. Ordering and paying from the phone are not switched on for Roshinah.
