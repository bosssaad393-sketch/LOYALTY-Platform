# "Join our rewards" print files (N10)

The QR code on every file opens: https://loyalty-platform-steel.vercel.app/join/n10

## Which file for what

| You want | Send the printer | Size |
|---|---|---|
| A5 poster or table card, printed and then cut | `poster-A5-bleed3mm.pdf` | 148 x 210 mm (the file is 154 x 216 mm: 3 mm extra on each side for cutting) |
| A5 printed on your own printer, no cutting | `poster-A5.pdf` | 148 x 210 mm |
| A4 poster, printed and then cut | `poster-A4-bleed3mm.pdf` | 210 x 297 mm (the file is 216 x 303 mm) |
| A4 printed on your own printer, no cutting | `poster-A4.pdf` | 210 x 297 mm |
| Sticker or plate for the door, the tables or the NFC plates | `sticker-100mm.png` | 100 x 100 mm |

- Use the **PDF** when the printer accepts it. The PNG files are the same designs as pictures at 300 dpi, for printers or apps that want an image.
- **"Bleed"** means the dark marble goes 3 mm past the cutting line, so there is no white edge after cutting. Tell the printer: "3 mm bleed, cut to A5" (or A4).
- **Paper:** a thick matt or silk paper, about 250 to 350 gsm, for posters and table cards. Matt cuts reflections, so the code scans better under lights. For the sticker, use matt vinyl. Ask the printer about a lamination that is not glossy.

## Before you print many

1. **Order ONE test print first.**
2. **Scan it with two different phones, an iPhone and an Android**, using the normal camera app, from about an arm's length. It must open the join page.
3. Only then print the rest.

## Things to know

- **Colours look different on paper.** Screens show RGB colours; on paper the same file usually comes out darker and duller. Gold can look brownish.
- **Dark backgrounds can look muddy on cheap printers.** The marble may turn into flat dark grey and the fine gold frame line may fade. A professional print shop does better than an office printer.
- **The QR points to the live web address.** The site must stay online at that address, or every printed code stops working. If the address ever changes (for example a new domain), the files must be made again and reprinted.
- Do not stretch, crop or recolour the code, and do not put stickers or text on the light square around it.
- The crest image (256 px) and the marble photo (1100 px) are small for large prints. They look fine at A5. At A4, ask for larger originals if the crest or marble looks soft on the test print.

## Size of the code on paper

| File | Light square (with margin) | Black code area |
|---|---|---|
| A5 | 75.4 mm | 63.1 mm |
| A4 | 107 mm | 89.6 mm |
| Sticker | 56 mm | 46.9 mm |

## For the developer

Made by `web/scripts/poster.mjs` (run it in `web/`). To use another address: `node scripts/poster.mjs --url=https://...` or set `JOIN_URL`. Scan results and measurements: `report.json`. HTML sources: `src/`.
