# Design templates

Clickable HTML prototypes of every screen (open any `index.html` in a browser). They use fake data and a placeholder brand called "Your Brand". They are the visual specification the real app in `web/` follows.

| Folder | What |
|---|---|
| `guest-app/` | Join, terms, card concepts, "added", Arabic |
| `staff-app/` | Till flow: scan, confirm, add points, undo, welcome-desk flow |
| `owner-app/` | Overview, guests, rules, offers, team, data and privacy |
| `logins/` | The four sign-in looks (owner A/B, staff A/B) |
| `wallet-art/`, `wallet-royal/` | Apple and Google Wallet card art, layout facts and Apple's size rules |
| `join-qr/` | The animated join-QR page and its builder |

To show a client their own version: change the colours at the top of the page, swap `src/brand-logo.png`, `src/brand-icon.png` and `src/marble.jpg` for their files, and rename "Your Brand". The pictures that came with the KAYA designs (logo, marble, AI backgrounds, exported PNGs) are deliberately not in this folder.

Design rule: the work must look made by expert human designers: restrained, strict grid, real typography, no sparkle or glow clichés. See `../DESIGN-GUIDE.md`.
