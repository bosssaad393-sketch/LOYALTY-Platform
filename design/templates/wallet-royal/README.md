# Your Brand Apple Wallet card: black and gold

**The main card is design 1 (store card, all iPhones).** The poster (design 2) is an optional extra, off by default. Both are in `web/passes/brand/` already (this branch). Sample data in the pictures; `mockups.png` is an illustration, Apple draws the real card.

| | Style | Who sees it | Status |
|---|---|---|---|
| 1 **MAIN** | **Store card**, new strip: gold Your Brand on black marble with gold-leaf veins; POINTS printed on the left of the strip | every iPhone | live path, only the strip and logo images changed |
| 2 optional | **Poster** (Apple "Poster Generic"): the marble is the whole card, gold Your Brand up top; Wallet prints MEMBER, the name, POINTS under it, progress beside it, the code in the footer | iOS 27 and newer | **off** until `APPLE_POSTER_PASS=1`; the pass then carries both styles, so older iPhones get card 1 |

## Files and Apple sizes (all PNG)

| File | Size | Apple spec |
|---|---|---|
| `strip.png`, `@2x`, `@3x` | 375x144, 750x288, 1125x432 | store card strip, 375 x 144 pt (Apple: HIG and Pass Designer; the old 375 x 123 file was stretched and cropped). Card artwork only, transparent around it. Source: `strip-card.html`, made by `render-strip.mjs`. Facts and sources: `APPLE-PASS-LAYOUT-FACTS.md`. Preview: `wallet-new-mock.png` |
| `logo.png`, `@2x`, `@3x` | 43x42, 85x84, 128x126 | logo, max 160 x 50 pt. Now the crest only; the Your Brand lettering is in the strip |
| `artwork.png`, `@2x`, `@3x` | 358x448, 716x896, 1074x1344 | poster artwork, 358 x 448 pt (from the HIG as reported by secondary sources: confirm in Pass Designer) |
| `primaryLogo.png`, `@2x`, `@3x` | 30, 60, 90 px tall | poster logo, 30 pt tall, 30 to 126 pt wide |
| `icon*.png` | unchanged | 29 pt |

The pass is about 0.9 MB without the poster files and 2.8 MB with them.

Sources: `strip.html`, `poster.html` (rendered at 3x with headless Edge, exact crops), `src/marble.png` (made with Higgsfield, gpt_image_2_5, 2K: real-looking black marble with gold veins; no text, logo or people). The gold lettering is live text (Georgia, foil gradient), the same look as the member card in the web app.

## Fields (code in `web/src/lib/appleWallet.ts`)

- Store card: primary POINTS, secondary MEMBER and TO YOUR REWARD, auxiliary YOUR CODE, back fields as before. `backgroundColor` is now `rgb(14, 12, 10)`.
- Poster: primary MEMBER (name), POINTS, TO YOUR REWARD; footer YOUR CODE (only the first footer field is shown). Same field keys in both styles so updates and change messages work in either.
- QR and `altText` unchanged.
- `passkit-generator` 3.6.1 already supports both styles in one pass (`pass.types`). Checked offline with a throwaway certificate: both style keys are written, files are packed, no errors. **Not yet checked on a real iOS 27 iPhone.**

## What Apple's rules mean for this card

Checked against Apple's Wallet developer guide, the "Add to Apple Wallet" guidelines and the WWDC26 Wallet session.

1. **The white box under the QR is Apple's.** Wallet draws every barcode on white. It cannot be coloured, so the cream ticket slip from the app is not possible on the pass.
2. **Artwork rules we follow:** exact image sizes; no barcode, no Apple logo or Wallet icon, nothing imitating Apple's interface inside the art; opaque artwork; high-contrast text (cream on near-black, gold labels).
3. **Wallet draws fonts and spacing.** We control colours, images and field content only. No animation.
4. **The "Add to Apple Wallet" button must be Apple's own badge** (SVG, outline version on dark backgrounds). Custom buttons are not allowed, and the small Apple-logo character inside our current button text must go. The card page (`web/src/app/card/[cardId]/page.tsx`) still uses a custom black button: **replace it with Apple's official badge** (download from developer.apple.com/wallet/add-to-apple-wallet-guidelines, needs whoever holds the developer account to accept Apple's terms).
5. **Poster needs iOS 27+.** Apple asks for a fallback style in the same pass. We ship the store card as the fallback; Apple's own example uses `generic`, so verify on an iOS 26 phone that the fallback renders, and switch the fallback to `generic` if it does not.
6. **Pass Type ID and brand.** Apple's agreement ties a Pass Type ID to your own brand, with a limited "service provider" exception. LOYALTY signs passes that carry Your Brand's brand. **Confirm in the live agreement (Attachment 5, Additional Terms for Passes), or ask counsel**, whether Your Brand should hold its own Pass Type ID, or LOYALTY qualifies as a service provider. This is the main risk, and it is not a design issue.
7. **Notifications:** keep `changeMessage` to factual messages (points updated). No advertising text in notifications.
8. Your Brand's logo, wordmark and name are used with Your Brand's permission as their client.

## To test

1. Store card: nothing to switch on. Add a pass on an iPhone and look.
2. Poster: set `APPLE_POSTER_PASS=1` on a preview deployment, add a pass on an iPhone with iOS 27, then add one on an older iPhone. Also open it in Apple's Pass Designer (Mac) to check the field positions.
3. If the poster field positions differ from `mockups.png`, adjust the artwork (the gold Your Brand sits at about one fifth from the top) or the fields.
