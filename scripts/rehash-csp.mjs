#!/usr/bin/env node
// Recompute the CSP sha256 for the inline <script type="module"> in public/index.html
// and rewrite the script-src hash in place.
//
// WHY THIS EXISTS: the page's Content-Security-Policy authorises the inline module
// by a pinned sha256 hash. If you edit the inline script and DON'T update the hash,
// the browser silently refuses to run the whole script — the app boots to a blank
// connect screen with NO console error. Always run this after editing the script:
//
//     node scripts/rehash-csp.mjs
//
// (Deploys should run it first — see package/deploy notes.)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "public", "index.html");
const html = readFileSync(path, "utf8");

const open = '<script type="module">';
const start = html.indexOf(open);
if (start < 0) { console.error("no <script type=\"module\"> found"); process.exit(1); }
const contentStart = start + open.length;
const end = html.indexOf("</script>", contentStart);
if (end < 0) { console.error("no closing </script> found"); process.exit(1); }

const script = html.slice(contentStart, end);
const b64 = createHash("sha256").update(script, "utf8").digest("base64");
const token = `'sha256-${b64}'`;

const matches = html.match(/'sha256-[A-Za-z0-9+/=]+'/g) || [];
if (matches.length !== 1) { console.error(`expected exactly 1 sha256 token in CSP, found ${matches.length}`); process.exit(1); }
const out = html.replace(/'sha256-[A-Za-z0-9+/=]+'/, token);

if (out === html) { console.log(`CSP hash already correct (${token})`); process.exit(0); }
writeFileSync(path, out);
console.log(`updated CSP hash -> ${token}  (script ${Buffer.byteLength(script, "utf8")} bytes)`);
