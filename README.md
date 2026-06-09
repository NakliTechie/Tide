# Tide

A single-file calendar page. Your Google Calendar, rendered fast and
keyboard-first, with nothing in between — no app to install, no account, no
server. **Your token never leaves your browser.**

Tide is one `index.html`: HTML + inline CSS + one inline ES module. It talks
straight to Google with OAuth PKCE and stores everything it needs (tokens,
prefs, a small event cache) in this browser's IndexedDB. There is no build
step and no backend.

---

## Sovereignty posture (non-negotiable)

- **No server round-trip for your calendar data or tokens. Ever.** Tide is a
  static file; the OAuth grant is strictly between your browser and Google.
- **No telemetry, no analytics, no accounts.**
- Tokens live **only** in IndexedDB (the "Vault"), per-origin, per-browser —
  never in `localStorage`, never in a URL, never on a NakliTechie server.
- Different people on the same URL are fully isolated, *because there is no
  server*: Person A's tokens are physically unreachable from Person B's
  browser.
- **Disconnect erases everything local.** Account & settings → *Disconnect &
  erase all local data* clears the entire IndexedDB.

---

## What it does (v1.0)

- **OAuth PKCE** straight to Google (public client, no secret).
- **Week** (default) and **Day** views: time grid, current-time line, all-day
  row, multi-calendar with per-calendar colors, auto-contrast event text.
- **Command bar** (`⌘K` / `Ctrl+K`): type an event in plain words → it parses →
  **you confirm** → it's written to Google. A deterministic parser is the floor,
  so it works with no model and offline-ish; an optional LLM ladder
  (local bridge → WebGPU → BYOK) sharpens parsing when available.
- **Create / edit / delete** single events; click a slot to create, click an
  event to open it.
- **Reminders** ride Google's own `reminders` field (so your phone is notified
  whether or not this tab is open). Optional best-effort in-tab nudges while a
  Tide tab is alive.
- **Agent face** — `window.tide.agent` exposes `listEvents`, `createEvent`,
  `findSlots` over the same Google client (see below).

---

## One-time Google setup (≈5 minutes)

Tide needs a **public OAuth Client ID** of your own. This is the only setup
step, and the Client ID is meant to live in source (it is not a secret — PKCE
means there is no client secret).

1. In the [Google Cloud Console](https://console.cloud.google.com/), create (or
   pick) a project, then **APIs & Services → Credentials → Create credentials →
   OAuth client ID**, application type **Web application**.
2. Add **Authorized JavaScript origins** and **Authorized redirect URIs** for
   wherever you'll run Tide. The redirect URI must be the *exact* page URL:
   - Production: e.g. `https://tide.example.com/`
   - Local dev: `http://localhost:8788/`
3. **OAuth consent screen → Scopes:** add
   `https://www.googleapis.com/auth/calendar.events` and
   `https://www.googleapis.com/auth/calendar.readonly` (plus `openid` / `email`,
   which Tide uses only to show which account is connected).
   These are **sensitive** scopes — see *Multi-user* below.
4. Copy the **Client ID** and put it into Tide. Either:
   - edit `index.html` and set `GOOGLE_CLIENT_ID`, **or**
   - append `?client_id=YOUR_ID.apps.googleusercontent.com` to the URL, **or**
   - run `localStorage.setItem('tide.clientId', 'YOUR_ID...')` once in the
     console.

No client secret is ever used or needed.

### Multi-user / "can anyone connect?"

The Client ID is shared by everyone who visits your URL; isolation is per
browser. While the consent screen is in **Testing** mode, only Google accounts
you've added as test users can connect (cap ~100). To let arbitrary visitors
connect, **publish and verify** the consent screen. That verification — not the
client registration — is the only thing standing between "I can connect" and
"anyone can connect."

v1 holds **exactly one** connection per browser profile. (Records are keyed by a
connection id so a future version can add a second account; this isn't built in
v1.)

---

## Run it

Tide is a static file — serve it with anything.

```sh
# any static server on port 8788 (must match your registered redirect URI)
python3 -m http.server 8788
# then open http://localhost:8788/
```

### Self-host on Cloudflare Pages

```sh
# from this repo
npx wrangler pages deploy . --project-name tide
```

…or connect the repo via the Cloudflare **Pages → Git integration** (build
command: *none*; output directory: repo root). Then register the deployed origin
+ `/` as an Authorized origin and redirect URI in Google Cloud (step 2 above).

### Browser support

Target is latest Chromium (Chrome/Edge): WebGPU + File System Access +
IndexedDB. Safari/Firefox degrade gracefully — no WebGPU, so the command bar
uses the deterministic parser (or BYOK). **The calendar view works fully
everywhere.**

---

## Command-bar model (optional)

The deterministic parser is always the floor. To sharpen natural-language
parsing, Tide consumes an Edge-First ladder, tried in this order when available:

- **C1 — BYOK:** add an Anthropic or OpenAI-compatible API key under
  *Account & settings → Command-bar model*. The key is stored only in this
  browser's IndexedDB and is sent only to the provider you choose.
- **L1 — local bridge:** if `nakli-local-bridge` / Ollama is running on
  `http://localhost:11434`, Tide will try it (override with
  `localStorage.setItem('tide.bridge', 'http://host:port')` and
  `tide.bridgeModel`).
- **L2 — WebGPU (Transformers.js):** off by default because of a heavy first
  load. Enable with `localStorage.setItem('tide.l2', 'on')` on a WebGPU browser;
  the model is pulled from a pinned CDN.

If none are present or reachable, the deterministic parser handles it.

---

## Agent face

Tide *is* a schedule API an agent can drive. From the console (or any script on
the page):

```js
await tide.agent.listEvents({ from: '2026-06-09', to: '2026-06-16' });
await tide.agent.createEvent({ title: 'Lunch with Sam', start: '2026-06-10T13:00', end: '2026-06-10T14:00' });
await tide.agent.findSlots({ durationMin: 30, window: { from: '2026-06-09', to: '2026-06-13' } });
```

Same Google client as the UI; pure functions over the primitives, no UI
dependency.

---

## Composition, not welding

Tide shows your week and captures events — that is the whole job. It
deliberately does **not** transcribe, take notes, or summarize. When you want
meeting capture, Tide emits the event and **Steno** records it: two small tools
over shared primitives, never one bloated app.

---

## Clearing all local data

*Account & settings → Disconnect & erase all local data* wipes Tide's entire
IndexedDB (tokens, prefs, BYOK key, event cache) and reloads. You can verify
it's empty in DevTools → Application → IndexedDB (the `tide` database is gone /
empty). To also revoke Tide's access on Google's side, visit your
[Google Account permissions](https://myaccount.google.com/permissions).

---

## Security notes

- **Strict CSP** via a `<meta>` tag: `default-src 'none'`, a tight
  `connect-src` allowlist (Google endpoints, optional BYOK hosts, the pinned
  Transformers.js CDN, `localhost` for the bridge), and no inline event handlers
  (everything uses `addEventListener`).
- The single inline module is authorized by its **SHA-256 hash** in
  `script-src` rather than `'unsafe-inline'`. **If you edit the script, you must
  regenerate the hash** and replace it in the CSP meta:

  ```sh
  # extract the <script type="module"> body to script.js first, then:
  printf 'sha256-%s' "$(openssl dgst -sha256 -binary < script.js | openssl base64)"
  ```

  (Tide loads as a single static file with no build step; this is the one manual
  step the no-bundler constraint imposes.)

---

## License

See repository. Tide stores nothing of yours anywhere but on your machine.
