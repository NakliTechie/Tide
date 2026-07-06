// Tide Worker — serves the static app (via the ASSETS binding) and provides the
// two OAuth token endpoints the browser can't do itself without leaking a secret.
//
//   POST /api/token    { code, code_verifier, redirect_uri } -> Google token exchange
//   POST /api/refresh  { refresh_token }                     -> Google token refresh
//
// The Google client_secret lives ONLY here (env.GOOGLE_CLIENT_SECRET, a Worker
// secret). No storage, no per-user state — the Worker just proxies the exchange;
// the resulting tokens are returned to the browser, which keeps them in IndexedDB.
// The user's calendar data never touches this Worker.

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

// Notes can get large-ish, but they're plain text — cap to keep KV values sane.
const MAX_NOTE_BYTES = 32 * 1024;

// Only allow token exchanges destined for origins we actually run on. This keeps
// the endpoint from acting as a generic exchange oracle for our client.
const ALLOWED_REDIRECT_HOSTS = new Set([
  "tide.naklitechie.com",
  "localhost",
  "127.0.0.1",
]);

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function redirectAllowed(uri) {
  try { return ALLOWED_REDIRECT_HOSTS.has(new URL(uri).hostname); }
  catch { return false; }
}

async function googleToken(params) {
  const r = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  // Pass Google's JSON (and status) straight back to the browser.
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function handleToken(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { code, code_verifier, redirect_uri } = body || {};
  if (!code || !code_verifier || !redirect_uri) return json({ error: "missing_params" }, 400);
  if (!redirectAllowed(redirect_uri)) return json({ error: "redirect_uri_not_allowed" }, 400);
  if (!env.GOOGLE_CLIENT_SECRET) return json({ error: "server_misconfigured", detail: "GOOGLE_CLIENT_SECRET not set" }, 500);
  return googleToken({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    code_verifier,
    grant_type: "authorization_code",
    redirect_uri,
  });
}

async function handleRefresh(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { refresh_token } = body || {};
  if (!refresh_token) return json({ error: "missing_params" }, 400);
  if (!env.GOOGLE_CLIENT_SECRET) return json({ error: "server_misconfigured", detail: "GOOGLE_CLIENT_SECRET not set" }, 500);
  return googleToken({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token,
    grant_type: "refresh_token",
  });
}

// --- Notes ------------------------------------------------------------------
//
// Private, per-user notes for things that can't (or shouldn't) live on Google:
// notes on read-only/shared events, and per-day scratchpads. The browser proves
// who it is by sending its Google access token; we verify it against Google's
// userinfo endpoint to get the stable `sub`, and namespace every key by that sub
// so one user can never read another's notes. Writable-event notes never reach
// here — the client writes those straight into the Google event description.

// Verify a Google access token and return its `sub` (stable user id), or null.
// A tiny in-isolate cache avoids a userinfo round-trip on every keystroke-save.
const subCache = new Map(); // access_token -> { sub, exp }
async function subForToken(token) {
  if (!token) return null;
  const hit = subCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.sub;
  const r = await fetch(GOOGLE_USERINFO_ENDPOINT, { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) return null;
  const info = await r.json().catch(() => null);
  const sub = info && info.sub;
  if (!sub) return null;
  if (subCache.size > 500) subCache.clear(); // crude bound; isolates are short-lived
  subCache.set(token, { sub, exp: Date.now() + 5 * 60 * 1000 });
  return sub;
}

function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// scope ∈ {evt, day, list}; id is the event id, a YYYY-MM-DD date, or a scratchpad
// list id. Keep keys opaque. `list` holds the sidebar scratchpad (a JSON array).
function noteKey(scope, sub, id) { return `${scope}:${sub}:${id}`; }
function validScope(s) { return s === "evt" || s === "day" || s === "list"; }

async function handleNote(request, env) {
  if (!env.NOTES) return json({ error: "notes_unavailable" }, 501);
  const sub = await subForToken(bearer(request));
  if (!sub) return json({ error: "unauthorized" }, 401);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope"), id = url.searchParams.get("id");
    if (!validScope(scope) || !id) return json({ error: "missing_params" }, 400);
    const text = await env.NOTES.get(noteKey(scope, sub, id));
    return json({ text: text || "" });
  }

  if (request.method === "PUT") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const { scope, id, text, label } = body || {};
    if (!validScope(scope) || !id) return json({ error: "missing_params" }, 400);
    const key = noteKey(scope, sub, id);
    if (typeof text !== "string" || text.trim() === "") {
      await env.NOTES.delete(key);
      return json({ ok: true, empty: true });
    }
    if (new TextEncoder().encode(text).length > MAX_NOTE_BYTES) return json({ error: "note_too_large" }, 413);
    // Store label + updated as KV metadata so the aggregation list (below) can be
    // built from a single list() call without fetching every note's body.
    const updated = new Date().toISOString();
    await env.NOTES.put(key, text, { metadata: { label: (typeof label === "string" ? label : "").slice(0, 200), updated } });
    return json({ ok: true, updated });
  }

  return json({ error: "method_not_allowed" }, 405);
}

// GET /api/notes — aggregate this user's per-event + per-day notes for the "All
// notes" tab. Reads keys + metadata (label/updated) via list(); no body fetch.
async function handleNotesList(request, env) {
  if (!env.NOTES) return json({ error: "notes_unavailable" }, 501);
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const sub = await subForToken(bearer(request));
  if (!sub) return json({ error: "unauthorized" }, 401);

  const out = [];
  for (const scope of ["evt", "day"]) {
    const prefix = `${scope}:${sub}:`;
    let cursor;
    do {
      const page = await env.NOTES.list({ prefix, cursor, limit: 1000 });
      for (const k of page.keys) {
        const md = k.metadata || {};
        out.push({ scope, id: k.name.slice(prefix.length), label: md.label || "", updated: md.updated || "" });
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
  }
  // Newest first; undated (pre-metadata) entries sort last.
  out.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  return json({ notes: out });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/token") return handleToken(request, env);
    if (url.pathname === "/api/refresh") return handleRefresh(request, env);
    if (url.pathname === "/api/note") return handleNote(request, env);
    if (url.pathname === "/api/notes") return handleNotesList(request, env);
    // Clean URLs for the legal pages (linked from the app + the consent screen).
    if ((url.pathname === "/privacy" || url.pathname === "/terms") && env.ASSETS) {
      const u = new URL(request.url); u.pathname = url.pathname + ".html";
      return env.ASSETS.fetch(new Request(u, request));
    }
    // Everything else is a static asset. With `main` + `assets`, matched assets
    // are served before the Worker runs; this fallback only catches unmatched
    // non-API paths.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
