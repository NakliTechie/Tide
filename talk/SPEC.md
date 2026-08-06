# talk — Spec

> **Lifecycle:** `locked` 2026-08-06 — all 6 walkthrough questions closed and folded (A1–A6 below). Design is authoritative; development deferred until after the cross-device (Phase 2/3 identity) track.

## Goal

**Talk** lets you drive Tide's calendar in plain language — *"book lunch with Sam
tomorrow at noon"*, *"find me 30 min with Priya this week"*, *"what's on
tomorrow?"*, *"push my 2pm to 4pm"*, *"clear my afternoon"* — with an on-device
model (Chrome's built-in Prompt API, Gemini Nano). The natural-language string is
parsed **in the browser**: no API key, no server round-trip, works offline, and
nothing about your calendar leaves the machine. Talk is a translator that maps a
phrase to a structured intent, then calls the calendar operations Tide already
exposes at `window.tide.agent` ([public/index.html:2441](../public/index.html)).

Success looks like: open ⌘K, type a sentence, see a staged preview of exactly what
Tide will do, press Enter to commit — create/reschedule/cancel land on Google
Calendar through the same client the keyboard UI uses; query/find-slot answer
inline. And on a machine without the model, Tide is exactly the app it is today —
Talk simply isn't offered.

**v1 scope (locked 2026-08-06):** Full CRUD — `query`, `find_slot`, `create`,
`reschedule`, `cancel`. This means v1 must solve NL→which-event disambiguation and
destructive-op confirmation up front (see Walkthrough Q5).

## Architectural invariants

These are settled posture, not open questions — they frame every decision below.

### I1. Enhancement layer, never a dependency

Tide's identity is a fast, keyboard-first calendar. Talk sits **on top** of a fully
functional app; every calendar operation remains reachable without the model. This
is the deliberate inverse of the sibling project `~/Code/inlay`, which *pivoted* to
make Nano load-bearing ("we are not deterministic-first"). Tide does not pivot.
(Formalized in Q1.)

### I2. Nano is a translator, the agent face is the tool layer

The model's only job is `text → structured intent`. It never touches Google, never
holds a token, never executes. Execution goes exclusively through
`window.tide.agent.*`, which already validates and talks to the Google client. This
keeps the model's blast radius to "proposed a wrong intent," which the preview gate
(I4) catches.

### I3. Event text is untrusted input

Calendar invite titles, descriptions, locations, and attendee names are
**attacker-controllable** — anyone can send you an invite. Any prompt that carries
event text MUST wrap it in explicit untrusted-data delimiters and instruct the model
to treat it as data only, ignoring embedded instructions / role-changes / output
formats (inlay's `readerTrustRules` pattern). Talk is always user-initiated from the
command bar; event content can never auto-trigger a model call or an execution.

### I4. Draft → preview → commit; nothing executes unconfirmed

A parsed phrase becomes a **draft** the user reviews. Mutations (`create`,
`reschedule`, `cancel`) never reach the agent face until the user confirms;
destructive ops (`cancel`) confirm explicitly. Read intents (`query`, `find_slot`)
have no side effect and render their answer directly. (Formalized in Q5.)

## Architectural decisions (walkthrough locks)

All six walkthrough questions locked 2026-08-06.

### A1. Enhancement layer, not load-bearing (Q1)

**Choice:** Talk is one optional way in; the keyboard/UI path is never removed or
gated, and Talk ships behind a pref/flag, default-on only where the model is
`available`. **Why:** protects Tide's keyboard-first identity and layers pure upside
on a working product. **Implication:** every feature must degrade to "Talk simply
isn't offered," never "Tide is broken." Confirms invariant I1.

### A2. NL enters as a ⌘K fallthrough (Q2)

**Choice:** natural language routes through the existing ⌘K input — the command
palette matches first (deterministic fast-path), and on no-match + sentence-like text
the top action becomes "Ask Tide: ‹text›". A leading-prefix override forces NL
explicitly. **Why:** one surface users already hit; the palette stays instant and acts
as the perf cache. **Implication:** need an "is this NL?" test (no palette match +
contains a space/verb + above N chars); the prefix is the escape hatch if it misfires.

### A3. Intent contract via structured output (Q3)

**Choice:** a discriminated union on `intent`
(`create | query | find_slot | reschedule | cancel`) returned via Chrome's
`responseConstraint` JSON-schema (137+), with `extractJson` + `normalizeIntent`
behind it as belt-and-suspenders. `reschedule`/`cancel` carry `match` *hints only* —
resolution is the app's job (A5). **Why:** the schema constraint does most of the
reliability work a small model otherwise fumbles. **Implication:** every intent still
passes a normalization/validation gate; the schema is the first defense, not the only
one.

### A4. Relative time — model-first, deterministic recovery (Q4)

**Choice:** the parse prompt carries `buildTimeContext()` (local wall-time + numeric
UTC offset + IANA zone + instant) and *demands* an offset-bearing ISO datetime back;
on miss/misformat, a ported `resolveDue()` recovers explicit cases; still null → the
New-Event form is prefilled for the user to set the time. No date-parsing dependency
in v1. **Why:** reliability where a calendar can't tolerate silent errors, with the
model covering natural phrasing; the offset-bearing-ISO rule kills the classic
"local time, no zone" bug. **Implication:** port inlay's `reminderTime.js` (+ its 3
tests); widen the hand-rolled parser before ever reaching for a library
(→ DEFERRED trigger).

### A5. Safe mutation pipeline — app resolves, then confirm (Q5)

**Choice:** for `reschedule`/`cancel`, the app filters `listEvents` by time then
title (deterministic); 0 candidates → honest miss, 1 → staged, >1 → a user pick-list.
The model supplies hints only, never picks the event. Every mutation stages a
preview → confirm before touching the agent face; `cancel` requires an explicit
(non-default) confirm. **Why:** keeps the destructive path deterministic and
injection-resistant (I3) and always shows the user exactly which event moves/dies.
**Implication:** small app-side matching code over an array Tide already holds;
commit routes through `window.tide.agent.*`. Realizes invariant I4.

### A6. Availability — probe → progressive affordance (Q6)

**Choice:** `probeAvailability()` on load drives a 4-state affordance in ⌘K
(`available` → live; `downloadable` → an "Enable on-device AI" action that acquires
the model from a user-activation handler with progress; `downloading` → progress;
`unavailable` → dimmed status line). **Why:** honest about state, download only on
explicit action (Chrome requires user-activation), app fully usable throughout.
**Implication:** reuse `probeAvailability`/`acquireLanguageModel`/`SESSION_OPTIONS`
(incl. `expectedOutputs: en`) from inlay near-verbatim.

## Prior art — lifted/adapted from `~/Code/inlay`

Inlay already solved most of the hard parts for a *different* domain (memories +
reminders + reader). Talk adapts its spine rather than reinventing it:

| inlay asset | file | what Talk takes |
|---|---|---|
| `LanguageModelSeam` (real/fake backends) | `src/core/languageModel.js` | One seam over "the AI"; a `fake()` deterministic backend makes the whole parse→intent pipeline node-testable with no model. |
| `probeAvailability()` / `acquireLanguageModel()` | `src/core/languageModel.js` | 4-state availability ladder; download only from a user-activation handler with progress; `SESSION_OPTIONS` declares `expectedOutputs` language `en` (Chrome warns otherwise). |
| `buildTimeContext()` + parse-prompt time rules | `src/core/languageModel.js` | The relative-time crux: hand the model local wall-time + **numeric UTC offset** + IANA zone + instant, and demand an **offset-bearing ISO datetime** back. |
| `resolveReminderDue()` | `src/core/reminderTime.js` | Deterministic recovery parser (`in N units`; `at H:MM am/pm` × today/tomorrow/weekday, future-guarded), used as `modelDue || resolveDue() || null→user-sets-it`. |
| `extractJson()` + `normalizeParsedCommand()` | `src/core/languageModel.js` | Robust JSON extraction and never-trust-the-shape normalization (validate intent, coerce types, immutable-raw covenant). Talk tightens this with `responseConstraint` JSON-schema structured output (Chrome 137+). |
| untrusted-data framing (`readerTrustRules`) | `src/core/languageModel.js` | The I3 defense on every event-bearing prompt. |
| draft→preview→commit (`assistFlow.js`) | `src/core/assistFlow.js` | The I4 covenant + `singleFlight` activation lock. |

Note: inlay is a Chrome *extension* (IndexedDB, side panel, `<all_urls>`); Tide is a
single-page Worker-served app. The seam, prompts, and time logic port cleanly; the
storage/permission machinery does not apply.

## Schema / data model

Talk adds **no persistent storage**. The intent object is transient (parsed → drafted
→ committed → discarded). The one durable touch: a preference for whether Talk is
enabled and whether the model has been acquired (lives alongside existing `prefs` in
Vault). The intent contract itself is defined in Q3.

## Public surface

- **No new Worker endpoints.** Everything is client-side; the model runs in the
  browser. (Contrast Phase 2's `/api/session` — unrelated track.)
- **Entry point:** the existing ⌘K command bar gains an "Ask Tide" affordance for
  natural-language input (Q2).
- **Agent face:** `window.tide.agent` is extended as needed — it has `listEvents`,
  `createEvent`, `findSlots` today; `reschedule`/`cancel` require exposing
  update/delete (the underlying `Api.updateEvent` exists; add delete if absent).

## Build sequence

Filled in as walkthroughs lock. Development is **deferred until after the
cross-device track** (Phase 2/3 identity work). Provisional phases:

**Phase 1 — the seam (no UI)**
1. Port `LanguageModelSeam` (real + fake backends) + `probeAvailability` into a Tide
   `Talk` module; wire `SESSION_OPTIONS`.
2. Port `buildTimeContext` + `resolveReminderDue`; add Tide's intent schema + prompt.
3. Node tests against the fake backend for every intent + the time fallback.

**Phase 2 — agent-face completeness**
1. Ensure `window.tide.agent` covers create/reschedule/cancel/query/find-slot.
2. Intent → agent-face dispatch + the draft object.

**Phase 3 — the command-bar surface**
1. ⌘K "Ask Tide" entry (Q2); the preview/confirm card (Q5); availability status (Q6).

**Phase 4 — polish**
1. find-slot rendering, day-summary via Summarizer API, error/empty states.

## What this spec deliberately leaves out

Canonical list with triggers in [DEFERRED.md](DEFERRED.md). Headlines:

- **Voice input** — text only in v1.
- **Multi-turn conversation** — one phrase, one intent; no dialogue state.
- **Summarizer/Writer/Rewriter APIs** for day-prep — v1 uses the Prompt API only.
- **Recurring-event NL** ("every Tuesday") — single events in v1.

## References

- [walkthroughs.md](walkthroughs.md) — the 6 open scope-defining questions
- [DEFERRED.md](DEFERRED.md) — items pushed past v1
- [README.md](README.md) — quickstart + status
- Prior art: `~/Code/inlay/src/core/{languageModel,reminderTime,assistFlow}.js`
