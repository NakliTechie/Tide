# Tide

A fast, keyboard-first calendar for Google Calendar — **one or several accounts
merged into a single grid**, hosted at **[tide.naklitechie.com](https://tide.naklitechie.com)**.

No app to install. Sign in with Google and go. Your Google tokens stay in your
browser; the only thing Tide keeps on its side are your notes and display
preferences, namespaced to your account so they follow you across devices.

Tide runs as a **Cloudflare Worker**: a static single-page app served from
`public/`, plus a tiny API (`worker.js`) that handles the Google token exchange
(so the OAuth secret never reaches the browser) and stores notes/preferences in
Workers KV.

---

## Using Tide

1. Open **[tide.naklitechie.com](https://tide.naklitechie.com)**.
2. Click **Connect Google Calendar** and choose your account.
3. The app is pending Google verification, so you'll see a one-time *"Google
   hasn't verified this app"* screen — click **Continue**.
4. Grant calendar access. You're in. Add more accounts any time with **+ Add
   account**; their calendars merge into one grid.

You stay signed in across reloads and across devices (sign in again on a new
device; your notes are already there).

---

## Data &amp; privacy posture

Tide keeps as little of your data as possible, and most of it never touches
Tide's servers. Full [Privacy Policy](public/privacy.html) — live at `/privacy`.

- **Your calendar data never touches Tide's servers.** Events are fetched
  directly between your browser and Google's API. The Worker never sees or stores
  your calendar contents.
- **Your sign-in tokens stay in your browser.** The one-time OAuth code→token
  exchange runs in the Worker so Google's app secret is never exposed to
  visitors — but the resulting access/refresh tokens are returned to and stored
  only in your browser (IndexedDB, the "Vault"), never retained by the Worker.
- **Notes and preferences are the one thing Tide stores.** Your scratchpad, day
  notes, private event notes, calendar colours, and calendar selections live in
  Cloudflare KV, keyed to your Google account id so they follow you across
  devices. Per-user isolation is enforced server-side by verifying each request's
  Google identity.
- **No telemetry, no analytics, no ads, no data sold or shared.**
- **Delete anything.** Clearing a note removes it from storage; *Account &amp;
  settings → Disconnect &amp; erase all local data* wipes tokens from your browser;
  full server-side deletion on request (see the privacy policy).

---

## What it does

- **Multiple Google accounts at once.** Connect as many as you like; their
  calendars merge into one grid, grouped per account in a left sidebar with a
  colour dot + visibility toggle each.
- **Per-calendar colours** from a curated 10-colour palette, auto-assigned for
  distinctness and fully customisable — click a colour dot to pick a swatch or a
  custom colour. Choices persist per calendar.
- **Week** (default) and **Day** views: time grid, current-time line, all-day
  row, auto-contrast event text, auto-scroll to the current time.
- **A right-hand rail** with a month-calendar navigator and a **Notes** home; open
  an event or day note in the rail without the calendar reflowing.
- **Create / edit / delete** events — click a slot to create, click an event to
  open it in the rail. Writes route to the correct account automatically.
- **Command bar** (`⌘K` / `Ctrl+K`): type an event in plain words → it parses →
  **you confirm** → it's written to Google.
- **Reminders** ride Google's own `reminders` field, so your phone is notified
  whether or not a Tide tab is open.
- **Agent face** — `window.tide.agent` exposes `listEvents`, `createEvent`,
  `findSlots` across all connected accounts.

---

## Notes

Tide has a lightweight notes layer, stored server-side per user (in KV) so it
syncs across your devices:

- **Scratchpad** — a quick checklist in the sidebar's Notes panel. Tick an item
  and it strikes through, sinks to the bottom, and auto-moves to **Archive** after
  a day; archived items stay until you trash them (or restore them).
- **Day notes** — a private note per calendar day (the ✎ on a day header).
- **Event notes** — a note on any event. On events you can edit, the note is
  written into the Google event's description (so it syncs to Google); on
  read-only events it's kept private in Tide.
- **All notes** — one tab that aggregates your day and event notes.

Tide still doesn't transcribe or summarize meetings — that's a separate job.
These notes are jottings tied to your calendar, not a document editor.

---

## Auth model

Tide uses the standard **OAuth 2.0 authorization-code flow with PKCE**. The
browser starts the flow and receives a `?code`; the Worker exchanges that code
(and later refreshes tokens) at Google's token endpoint using the app's client
secret, which lives only in the Worker. Access + refresh tokens are returned to
the browser and stored in IndexedDB. On reload, Tide silently mints a fresh
access token via `/api/refresh` — no reconnect churn.

Scopes requested: `calendar.events` and `calendar.readonly` (to read and write
your events), plus `openid` / `email` (to label the connected account and key
your notes). These calendar scopes are **sensitive**, which is why the app goes
through Google's OAuth verification.

---

## Command bar (optional model ladder)

The deterministic parser is always the floor — the command bar works with no
model at all. To sharpen natural-language parsing, Tide will use, in order when
available:

- **BYOK:** an Anthropic or OpenAI-compatible API key set under *Account &amp;
  settings → Command-bar model*. Stored only in your browser, sent only to the
  provider you choose.
- **Local bridge:** an Ollama-compatible endpoint at `http://localhost:11434`
  (override with `localStorage.setItem('tide.bridge', 'http://host:port')`).
- **WebGPU (Transformers.js):** off by default; enable with
  `localStorage.setItem('tide.l2', 'on')` on a WebGPU browser.

If none are present, the deterministic parser handles it.

---

## Architecture

```
public/index.html    the single-page app (HTML + inline CSS + one inline ES module)
public/privacy.html  privacy policy (served at /privacy)
worker.js            the Worker: /api/token, /api/refresh, /api/note(s), asset fallback
wrangler.jsonc       Worker config: ASSETS binding, NOTES KV, GOOGLE_CLIENT_ID var, route
scripts/rehash-csp.mjs  regenerates the CSP hash for the inline script (runs on deploy)
```

- **Static app** is served via the Worker's `ASSETS` binding.
- **`/api/token` + `/api/refresh`** proxy Google's token endpoint using
  `GOOGLE_CLIENT_SECRET` (a Worker secret).
- **`/api/note` + `/api/notes`** store and list per-user notes in the `NOTES` KV
  namespace, authorising each request by verifying the caller's Google token and
  keying data by the resulting account id.
- **No calendar data flows through the Worker** — the browser calls Google's
  Calendar API directly.

---

## Self-hosting &amp; development

Tide is open to run yourself. You'll need your own Google OAuth client and a
Cloudflare account.

**1. Google Cloud** — create a project, enable the **Google Calendar API**, and
under **Google Auth Platform**:
- Configure the consent screen (app name, support email, audience **External**,
  privacy-policy URL); add the calendar + `openid`/`email` scopes.
- **Clients → Create client → Web application.** Because the token exchange is
  server-side, this needs a **client secret** and **Authorized redirect URIs**
  (Tide redirects back to its own origin/path):
  - `http://localhost:8788/` for local dev
  - `https://your-domain/` for production

**2. Configure** — set the **public Client ID** in both `wrangler.jsonc`
(`vars.GOOGLE_CLIENT_ID`) and the `GOOGLE_CLIENT_ID` constant in
`public/index.html`. Put the **secret** in `.dev.vars` for local dev:

```
GOOGLE_CLIENT_SECRET=your-secret
```

**3. KV** — create the notes namespace and put its id in `wrangler.jsonc`:

```sh
npx wrangler kv namespace create NOTES
```

**4. Run** — install and start the dev server (load it at **localhost:8788**, the
registered redirect origin — not 127.0.0.1):

```sh
npm install
npm run dev          # wrangler dev on :8788
```

**5. Deploy** — set the production secret once, then deploy (or just push, see
below):

```sh
npx wrangler secret put GOOGLE_CLIENT_SECRET
npm run deploy       # rehashes the CSP, then wrangler deploy
```

### Browser support

Target is latest Chromium (Chrome/Edge). Safari/Firefox work for the calendar and
notes; the command bar's WebGPU model tier is Chromium-only (the deterministic
parser and BYOK work everywhere).

---

## Deploys

- **Manual:** `npm run deploy` — rehashes the CSP, then `wrangler deploy`.
- **CI:** pushes to `main` auto-deploy via **Cloudflare Workers Builds**
  (build `npm ci`, deploy `npm run deploy`); other branches get preview builds.

Secrets (`GOOGLE_CLIENT_SECRET`) and bindings (`NOTES` KV) live on the Worker and
persist across deploys — they are not part of the uploaded bundle.

---

## Security notes

- **Strict CSP** via a `<meta>` tag: `default-src 'none'` with a tight
  `connect-src` allowlist (Google endpoints, same-origin `/api`, optional BYOK
  hosts and the pinned Transformers.js CDN), and no inline event handlers.
- The single inline module in `public/index.html` is authorised by its
  **SHA-256 hash** in `script-src` rather than `'unsafe-inline'`. **If you edit
  the script you must regenerate the hash**, or the browser silently refuses to
  run the whole app (blank connect screen, no console error):

  ```sh
  node scripts/rehash-csp.mjs
  ```

  The deploy runs this automatically (`predeploy`), so `npm run deploy` (and CI)
  can never ship a stale hash.
- The Google **client secret** exists only as a Worker secret; per-user note
  access is scoped by verified Google identity.

---

## License

See repository.
