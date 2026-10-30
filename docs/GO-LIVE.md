# Go-live plan: LOYALTY's own platform, so Saad can show real clients (30 Oct 2026)

Goal: a real, hosted LOYALTY owner, staff and developer dashboard on Saad's own accounts, with no dependence on Monaim's laptop or Monaim's repo. Not a mock: real database, real sign-in, real phones.

## What "ready to show a client" means (definition of done)
1. A web address Saad can open on any phone (not localhost).
2. A real database behind it (separate from any client's).
3. Owner, staff and developer sign-in work with PINs; the staff screen adds points to a real guest card; the owner sees the numbers change.
4. A guest can join from a QR code on their own phone and gets a card (web card now; Wallet when the accounts exist).
5. Nothing shown is another client's data or branding.

## Who does what
| Step | Saad (accounts, money, secrets) | Claude (code, files, checks) |
|---|---|---|
| 1. Own repo | Create an empty private GitHub repo `loyalty-platform` under his account; sign in to GitHub on the PC | Push the white-label code to it (the code is ready, local commits only so far) |
| 2. Database | Create a free Supabase project `loyalty-showcase`; paste the keys only into Vercel settings, never into chat | Give the exact SQL (migrations 0001 to 0008, then a showcase seed); check it runs |
| 3. Hosting | Create the hosting project from the repo (see the warning below); add the environment settings | List every setting needed and its safe value; check the deploy |
| 4. Logins | Create his own developer login in Supabase (email + password he chooses) | Give the one SQL line that links it; he then gives the owner and staff their PINs in `/dev` |
| 5. Real-phone test | Run the guest, staff and owner flows on an iPhone and an Android phone | Fix what fails; keep a test log |
| 6. Wallet accounts (long pole) | Apple Developer account (US$99 a year) and Google Wallet issuer account (free) | Wire the settings; prepare the pass files |
| 7. First client set-up | Collect the client's logo, colours and reward rules | Run the new-client script; brand it; seed it |

## Hosting: decide before step 3
- **Vercel Hobby** is free, but Vercel's Hobby plan is for personal, non-commercial use (check their current terms). A paid client site belongs on **Vercel Pro** (about US$20 a month per team seat) or another host that allows commercial use.
- One deployment per client, as agreed. Each gets its own Supabase project and its own site address.
- Domain: `loyaltybh.com` looked unregistered on 28 Oct. Confirm at a registrar before relying on it.

## Before the first paying client (not before showing it)
- [ ] Migrations 0005 to 0008 run once on a real Supabase (only tested in a test Postgres so far).
- [ ] PIN lock-out tested across real server instances.
- [ ] Terms and privacy wording reviewed by a professional (Bahrain data rules).
- [ ] Arabic text reviewed by a native speaker.
- [ ] Backups: Supabase backup plan chosen (the free plan has limited backups; export manually).
- [ ] A support route and a "how to ask for a change" in writing.
- [ ] Apple Wallet account-holder question settled in writing (see NEW-CLIENT.md).
- [ ] Next.js security patch already applied here (16.4.3); keep it current.

## Costs to expect (rough, check current prices)
- Supabase free tier to start; paid tier when a client needs daily backups.
- Hosting: free to US$20 a month per project, depending on the plan.
- Apple Developer: US$99 a year. Google Wallet: free.
- Domain: about 10 to 15 USD a year.

## Order I recommend
1. This week: steps 1 to 5 with a **showcase** venue (invented brand "Sol"), so there is one real, working link to show every prospect.
2. Then: step 6 in parallel (the accounts take days).
3. Then: the first client, using `docs/NEW-CLIENT.md`.
