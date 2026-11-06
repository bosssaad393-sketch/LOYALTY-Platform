# Loyalty / {{CLIENT}} Rewards — design guide

> **Update, 6 Nov 2026:** the default look is now Orbyn: deep teal `#04191D`, light text `#EAF7F5`, cyan accent `#14F1E9`, success green `#2BE39A`, font Outfit with Tajawal for Arabic. The token names (`--gold` and friends) stayed, so read them as "accent". The gold, serif look below remains possible for a client through `BRAND_BG`, `BRAND_TEXT`, `BRAND_ACCENT` and `BRAND_FONT=classic`. Logo files: `web/public/orbyn-mark.svg`, `web/public/orbyn-logo-horizontal.svg`.

**Decision (Sir, 12 Oct 2026):** the real product copies the look and feel of the template demo exactly: colours, fonts, feel, UI. This applies to the guest page, the Apple / Google Wallet card, and the staff and owner app.

**Reference source:** `design/templates/` (the original template demo, kept as clickable HTML prototypes). When in doubt, open those pages and match them.

## Feel
- Dark, warm and premium: a fine-dining or members-club feel. Black-brown, not pure black or blue.
- Gold is the accent colour: thin gold borders, gold labels, gold buttons, soft gold glows.
- Calm and spacious. Big serif numbers, small uppercase spaced-out labels.
- Mobile-first, one column, large touch targets (50–60 px).
- Subtle motion only: the card rises in, a slow sheen passes over it, the coin logo flips, sparkles twinkle. Animation turns off when the user turns on reduced motion.

## Colours
| Token | Hex | Use |
|---|---|---|
| bg | `#141210` | page background (warm near-black) |
| surface | `#1F1C18` | panels, cards in the app |
| surface2 | `#2A2621` | buttons, keys |
| line | `#3D372F` | borders, dividers |
| text | `#F3E9D2` | main text (warm cream) |
| muted | `#D9C9A8` | labels, secondary text |
| dim | `#9A8C74` | notes, timestamps |
| gold | `#CDA55B` | main accent |
| gold2 | `#E3C07E` | light gold (gradients, highlights) |
| gold-dim | `#8A6F3A` | dark gold (borders, chart bars) |
| ok | `#8DBF8E` | success |
| bad | `#E58B79` | errors, delete |
| on-gold text | `#1A1410` | text on gold buttons |

Background glow: two soft radial gradients, gold at the top right (`rgba(205,165,91,.14–.16)`) and brown at the bottom left (`rgba(90,70,40,.35)`).

## Type
- **Headings, numbers, brand:** serif — Georgia / "Times New Roman". Weight 600.
  - Brand mark "{{CLIENT}}": gold, letter-spacing 6–8 px.
  - Points on the card: 76 px. Big numbers: 56 px. KPIs: 40 px. Panel titles: 28 px.
- **Body and UI:** system sans — `system-ui, -apple-system, "Segoe UI", Roboto, Arial`. Body 16 px / 1.5.
- **Labels / eyebrows:** 12 px, bold, UPPERCASE, letter-spacing .16–.34 em, muted or gold.

## Components
- **Panel:** surface background, 1 px line border, radius 20–22 px, padding 20–22 px.
- **Primary button:** gold gradient (135°, gold2 → gold), dark text, radius 14 px, height 50 px, soft gold shadow.
- **Secondary button:** surface2, line border, gold-dim border on hover. Ghost and danger (red outline) variants.
- **Input:** height 50–52 px, radius 13–14 px, bg-coloured, line border, gold border on focus.
- **Chip / pill:** fully rounded, uppercase 12 px, gold-dim border, gold text.
- **Progress bar:** 12 px high, dark track `#332C24`, gold gradient fill (gold-dim → gold2).
- **PIN pad:** 4 gold ring dots (filled when typed), 3×3 keypad of 60 px keys, shakes on a wrong PIN.
- **Lists / feeds:** rows split by a 1 px line, timestamps in dim.
- **Owner KPIs:** tiles with a big serif number and a small dim caption; 2 columns on phones, 4 on wider screens.
- **Chart:** bars in gold-dim; today's bar in full gold.
- **Messages:** outlined boxes — green ok, gold warning, red error.

## The rewards card (guest page and Wallet passes)
- Radius 26 px, gradient `#3A3228 → #26211B → #141210` (155°), **1 px gold border**, deep shadow, slow white sheen across.
- Top: {{CLIENT}} mark on the left, LOYALTY coin logo on the right ("{{CLIENT}} × LOYALTY" co-branding).
- Middle: points in a huge serif number + "POINTS" in gold uppercase; gold progress bar to the reward.
- Bottom: QR code on a cream tile (`#F3E9D2`) + the 4-digit code in large serif, letter-spaced, with a "YOUR CODE" gold label.
- Footer everywhere: "{{CLIENT}} Loyalty Rewards · Powered by LOYALTY".
- **Apple / Google Wallet passes** use the same colours: background `#141210`, labels gold `#CDA55B`, values cream `#F3E9D2`, the {{CLIENT}} logo, and the QR in the barcode area.

## Tone of the copy
Short, warm, plain English. Examples from the demo: "Get your digital card in seconds. No app to install." / "Show this QR or your 4-digit code to the staff to get your points."
