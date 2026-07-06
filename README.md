# Tide

A single-file calendar page. Your Google Calendar — or **several** of them —
rendered fast and keyboard-first, with nothing in between: no app to install, no
account, no server. **Your calendar tokens never leave this browser.**

Tide is one `index.html`: HTML + inline CSS + one inline ES module. It talks
straight to Google using **Google Identity Services (GIS)** — a public client
with **no secret and no backend**. There is no build step.

---

## Sovereignty posture (non-negotiable)

- **No server round-trip for your calendar data or tokens. Ever.** Tide is a
  static file; the OAuth grant is strictly between your browser and Google.
- **No client secret.** Tide uses the GIS token client, which needs no secret —
  so nothing sensitive is shipped to visitors and nothing lands in this repo.
- **No telemetry, no analytics.**
- **Access tokens live only in memory in this tab.** They are never written to
  disk. The only thing persisted (in IndexedDB, the "Vault") is *which accounts*
  you connected — their email/id, so the sidebar can offer a one-click reconnect
  — plus your prefs, per-calendar colours, and a small event cache.
- Different people on the same URL are fully isolated, *because there is no
  server*: Person A's tokens are physically unreachable from Person B's browser.
- **Disconnect erases everything local.** Account & settings → *Disconnect &
  erase all local data* clears the entire IndexedDB.

---

## What it does

- **Multiple Google accounts at once.** Connect as many as you like; their
  calendars merge into one grid. A left sidebar groups calendars per account,
  each with a colour dot + visibility toggle, plus **+ Add account** and a
  per-account remove/reconnect.
- **Per-calendar colours** from a curated 10-colour palette, auto-assigned for
  distinctness and **fully customisable** — click any colour dot to pick a
  palette swatch or a custom colour. Choices persist per calendar.
- **Week** (default) and **Day** views: time grid, current-time line, all-day
  row, auto-contrast event text. On load the grid **auto-scrolls to centre the
  current time**.
- **Command bar** (`⌘K` / `Ctrl+K`): type an event in plain words → it parses →
  **you confirm** → it's written to Google. A deterministic parser is the floor,
  so it works with no model and offline-ish; an optional LLM ladder
  (BYOK → local bridge → WebGPU) sharpens parsing when available.
- **Create / edit / delete** single events; click a slot to create, click an
  event to open it. Writes route to the correct account automatically.
- **Reminders** ride Google's own `reminders` field (so your phone is notified
  whether or not this tab is open). Optional best-effort in-tab nudges while a
  Tide tab is alive.
- **Agent face** — `window.tide.agent` exposes `listEvents`, `createEvent`,
  `findSlots` across all connected accounts (see below).

---

## Auth model & the reconnect tradeoff (read this)

Tide uses the **GIS token client** (`google.accounts.oauth2.initTokenClient`).
This is the only way to talk to Google Calendar from a pure static page with
**no client secret and no backend** — Google's "Web application" OAuth client
*requires* a secret for the classic authorization-code exchange, which would
defeat the no-secret posture on a shared public URL.

The tradeoff: GIS issues **short-lived access tokens and no refresh token**.

- **Within a session** everything is seamless.
- **On a cold page load** (and roughly hourly, when the token expires) Tide tries
  a silent re-grant. Silent renewal relies on third-party cookies to
  `accounts.google.com`, which modern browsers often block — so you may see a
  one-click **Reconnect** in the sidebar. Reconnect uses the lightest prompt, so
  for already-granted scopes it just re-picks the account (no re-consent).
- This friction **eases substantially once the app is published and verified** —
  apps in *Testing* mode get short grants and aggressive re-consent by design.

---

## One-time Google setup (≈5 minutes)

Tide needs a **public OAuth Client ID** of your own. It is meant to live in
source (it is *not* a secret — there is no client secret).

1. In the [Google Cloud Console](https://console.cloud.google.com/), create (or
   pick) a project. **APIs & Services → Library →** enable the **Google Calendar
   API**.
2. **Google Auth Platform (OAuth consent screen):**
   - App name, support email, **audience: External**.
   - **Scopes:** add `https://www.googleapis.com/auth/calendar.events` and
     `https://www.googleapis.com/auth/calendar.readonly` (plus `openid` / `email`,
     which Tide uses only to show which account is connected). These are
     **sensitive** — see *Multi-user* below.
   - While in **Testing**, add every Google account that should be able to
     connect as a **test user** (cap ~100).
3. **Clients → Create client → Web application.** Add your page's origins as
   **Authorized JavaScript origins** (the GIS token client uses origins, **not**
   redirect URIs):
   - Production: e.g. `https://tide.example.com`
   - Local dev: `http://localhost:8788`
   (Registering redirect URIs too does no harm, but GIS doesn't use them.)
4. Copy the **Client ID** into Tide. Either:
   - edit `index.html` and set `GOOGLE_CLIENT_ID`, **or**
   - append `?client_id=YOUR_ID.apps.googleusercontent.com` to the URL, **or**
   - run `localStorage.setItem('tide.clientId', 'YOUR_ID...')` once in the console.

No client secret is ever used or needed.

### Multi-user / "can anyone connect?"

The Client ID is shared by everyone who visits your URL; isolation is per
browser. While the consent screen is in **Testing**, only accounts you've added
as test users can connect. To let arbitrary visitors connect, **publish and
verify** the consent screen — that verification (not the client registration) is
what stands between "I can connect" and "anyone can connect", and it also smooths
the reconnect behaviour above. Because Tide ships **no secret**, it is safe to
serve to arbitrary visitors on a public URL.

---

## Run it

Tide is a static file — serve it with anything, at an origin you registered in
step 3.

```sh
# any static server on port 8788 (must match a registered JS origin)
python3 -m http.server 8788
# then open http://localhost:8788/
```

### Self-host on Cloudflare Pages

```sh
# deploy just the page (don't upload working notes)
mkdir -p .deploy && cp index.html .deploy/
npx wrangler pages deploy .deploy --project-name tide
```

Then attach your custom domain to the Pages project and register that origin as
an **Authorized JavaScript origin** in Google Cloud (step 3).

### Browser support

Target is latest Chromium (Chrome/Edge): WebGPU + IndexedDB. Safari/Firefox
degrade gracefully — no WebGPU, so the command bar uses the deterministic parser
(or BYOK). **The calendar view works fully everywhere.**

---

## Command-bar model (optional)

The deterministic parser is always the floor. To sharpen natural-language
parsing, Tide consumes an Edge-First ladder, tried in this order when available:

- **BYOK:** add an Anthropic or OpenAI-compatible API key under *Account &
  settings → Command-bar model*. The key is stored only in this browser's
  IndexedDB and is sent only to the provider you choose.
- **Local bridge:** if `nakli-local-bridge` / Ollama is running on
  `http://localhost:11434`, Tide will try it (override with
  `localStorage.setItem('tide.bridge', 'http://host:port')`).
- **WebGPU (Transformers.js):** off by default (heavy first load). Enable with
  `localStorage.setItem('tide.l2', 'on')` on a WebGPU browser.

If none are present, the deterministic parser handles it.

---

## Agent face

Tide *is* a schedule API an agent can drive, across every connected account:

```js
await tide.agent.listEvents({ from: '2026-06-09', to: '2026-06-16' });
await tide.agent.createEvent({ title: 'Lunch with Sam', start: '2026-06-10T13:00', end: '2026-06-10T14:00' });
await tide.agent.findSlots({ durationMin: 30, window: { from: '2026-06-09', to: '2026-06-13' } });
tide.accounts();   // which Google accounts are connected
```

Same Google clients as the UI; pure functions over the primitives.

---

## Composition, not welding

Tide shows your week and captures events — that is the whole job. It
deliberately does **not** transcribe, take notes, or summarize. When you want
meeting capture, Tide emits the event and **Steno** records it: two small tools
over shared primitives, never one bloated app.

---

## Clearing all local data

*Account & settings → Disconnect & erase all local data* wipes Tide's entire
IndexedDB (connection identities, prefs, colours, BYOK key, event cache) and
reloads. To also revoke Tide's access on Google's side, visit your
[Google Account permissions](https://myaccount.google.com/permissions).

---

## Security notes

- **Strict CSP** via a `<meta>` tag: `default-src 'none'`, a tight `connect-src`
  allowlist (Google endpoints, optional BYOK hosts, the pinned Transformers.js
  CDN, `localhost` for the bridge), `frame-src` limited to `accounts.google.com`
  (for the GIS iframe), and no inline event handlers.
- The single inline module in `public/index.html` is authorized by its
  **SHA-256 hash** in `script-src` rather than `'unsafe-inline'`. **If you edit
  the script, you must regenerate the hash**, or the browser silently refuses to
  run the whole app (blank connect screen, no console error):

  ```sh
  node scripts/rehash-csp.mjs
  ```

  The deploy runs this automatically (`predeploy`), so a normal `npm run deploy`
  can never ship a stale hash.

---

## Deploys

Tide is a Cloudflare Worker (`worker.js` for the `/api/*` token + notes
endpoints; static app served from `public/` via the `ASSETS` binding).

- **Manual:** `npm run deploy` — rehashes the CSP, then `wrangler deploy`.
- **CI:** pushes to `main` auto-deploy via **Cloudflare Workers Builds**
  (build `npm ci`, deploy `npm run deploy`); other branches get preview builds.

Secrets (`GOOGLE_CLIENT_SECRET`) and bindings (`NOTES` KV) live on the Worker and
persist across deploys — they are not part of the uploaded bundle.

---

## License

See repository. Tide stores nothing of yours anywhere but on your machine.
