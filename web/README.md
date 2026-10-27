# Loyalty web app (guest join page, card page, API)

Next.js 16 + TypeScript. Design tokens in `src/app/globals.css` follow `design/DESIGN-GUIDE.md`.

## Run locally
```bash
cp .env.example .env.local   # fill in the values (never commit .env.local)
npm install
npm run dev                  # http://localhost:3000/join/<slug>
```

## Database
Run `../supabase/migrations/0001_init.sql` in the Supabase SQL editor once.

## What exists (week 1)
- `/join/[venue]`: guest sign-up (name + phone/email + consent)
- `/card/[cardId]`: the rewards card with points, QR and 4-digit code
- `/api/join`: creates member + card (unique 4-digit code per venue)
- `/api/wallet/google/[cardId]`: creates the venue's Google Wallet class if needed, then redirects to "Save to Google Wallet"
- Apple Wallet: pending the Apple Developer renewal
