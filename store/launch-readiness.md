# Tide — launch readiness (prepared 2026-09-11)

## Status: one real gate left — the demo video

`plan/verification.md`'s checklist shows almost everything done. I re-verified
the live-site claims just now (unauthenticated, no OAuth click):

- ✅ **tide.naklitechie.com loads** — the Tide connect screen renders correctly
  (dark theme, wordmark, "Connect Google Calendar" button, tagline).
- ✅ **tide.naklitechie.com/privacy loads** — page title "Tide — Privacy Policy".
- ✅ **tide.naklitechie.com/terms loads** — page title "Tide — Terms of Service".
- ✅ **Footer links to both** from the connect screen, as the checklist claims.

I did **not** click "Connect Google Calendar" — that starts a real Google OAuth
grant, which needs your own explicit action, not mine.

**Update 2026-09-11, checked in your logged-in Chrome (at your request):**
clicking Connect went straight through with **no consent screen** — Tide is
already an authorized app on your Google account, so it silently reused the
existing grant. Calendar rendering, multi-account merge (2 accounts), and the
click-to-create-event modal all confirmed working (opened the New Event modal,
cancelled without creating anything).

**⚠️ This blocks the demo video as scripted.** Step 3 needs the actual consent
screen with the scope list visible — an already-authorized account skips it.
Before recording, do ONE of:
- **Revoke Tide's access first**, then record: myaccount.google.com/permissions
  → find Tide → Remove access → then go through the Connect flow fresh on
  tide.naklitechie.com so the real scope-grant screen appears on camera.
- **Use a second Google account** that has never connected to Tide before.

Do this revoke-and-reconnect (or second-account) step **immediately before**
recording, not earlier — if you revoke now and record later, a later app
launch (yours or a test) could silently re-trigger a fresh grant again before
the camera's rolling.

- ✅ **Secrets hygiene checked**: `.dev.vars` is gitignored and not tracked;
  `git grep` for common secret patterns (api key / secret / token literals) in
  tracked files found nothing; the OAuth client secret is set via
  `wrangler secret put GOOGLE_CLIENT_SECRET`, never committed. `wrangler.jsonc`
  only carries the public client ID, which is meant to be public.

## A discrepancy worth flagging

`plan/pending.md` (edited 06-Aug, the newer file) lists "upload
`public/icons/tide-512.png` as the consent-screen app logo" as still
outstanding. `plan/verification.md` (edited 06-Jul, older) already shows
"Branding filled ... — saved" as done, and stops at the demo video as the
**only remaining item**. I can't check the live Google Cloud Console myself
(it needs your authenticated session), so I can't tell which is current.
**Action: when you're in the console for the video, glance at Branding — if
the app logo is already showing, ignore pending.md's line; if it's blank,
upload `store/consent-screen-logo-512.png`** (copied from
`public/icons/tide-512.png`, 512×512, 86KB — well under Google's 1MB limit,
square, no resize needed).

## What I prepared

- `store/consent-screen-logo-512.png` — ready to upload if Branding needs it.
- This file, consolidating the two plan docs into one current picture.

## The `[YOU]` punch-list — everything left before submission

1. **Glance at Auth Platform → Branding** — confirm the app logo is set (see
   discrepancy note above); upload `store/consent-screen-logo-512.png` if not.
2. **Right before recording**: myaccount.google.com/permissions → remove
   Tide's access (or use a second, never-connected Google account) — see the
   09-11 update above. Do this immediately before step 3, not earlier.
3. **Record the demo video** (~1–2 min screen capture, on the real production
   URL — script below, tightened from `plan/verification.md`).
4. **Upload to YouTube as Unlisted.**
5. **Auth Platform → Data Access → Demo video** → paste the YouTube link → Save.
6. **Auth Platform → Verification Center → Prepare for verification → Confirm.**
7. Google review takes a few weeks; they'll email chirag.patnaik@gmail.com
   with any follow-ups.

## Demo video shot list (tightened, copy-paste ready)

Screen-record your whole browser, 1080p if your recorder supports it. Talk
is not required — Google reviews the visuals.

| # | Action | Why it's in the video |
|---|---|---|
| 1 | Show the address bar reading `tide.naklitechie.com` | Proves it's the real production app |
| 2 | Click **Connect Google Calendar** | Starts the OAuth flow |
| 3 | **Only works if Tide's access was just revoked (or on a fresh account) — see punch-list step 2.** Proceed through Google sign-in to the **consent screen**; **hold for 3–4 seconds** on the scope list ("See, edit, share... calendars") | Google checks that the requested scopes are visibly shown and legible. Confirmed 2026-09-11: an already-authorized account skips this screen entirely and goes straight to the calendar. |
| 4 | Click **Continue / Allow** | Completes the grant |
| 5 | Show the **calendar grid populated with real events** | Demonstrates `calendar.readonly` in actual use |
| 6 | **Create an event** — click a time slot, or press `⌘K` and type "coffee tomorrow 3pm", confirm — show it land on the grid | Demonstrates `calendar.events` (write) in actual use |
| 7 | (Optional) Edit or delete the event you just made | Reinforces the write scope |
| 8 | Scroll to and briefly show the **Privacy Policy** link on the connect screen | Ties the video back to the privacy disclosure |

Stop recording, trim dead air at the start/end if your tool makes that easy,
upload to YouTube **Unlisted** (not Private — Google's reviewer needs the
link to work without your account), then follow punch-list steps 4–6 above.
