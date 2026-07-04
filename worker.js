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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/token") return handleToken(request, env);
    if (url.pathname === "/api/refresh") return handleRefresh(request, env);
    // Everything else is a static asset. With `main` + `assets`, matched assets
    // are served before the Worker runs; this fallback only catches unmatched
    // non-API paths.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
