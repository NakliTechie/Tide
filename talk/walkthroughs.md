# talk — Walkthroughs

> **Lifecycle:** `locked` 2026-08-06 — all 6 questions settled and folded into SPEC.md (A1–A6). Kept for the options/tradeoffs record behind each decision.

Scope-defining questions for Talk. Implementation details live in SPEC.md once
settled. Invariants I1–I4 (SPEC §"Architectural invariants") are already settled and
frame these.

## Open questions

1. **Nano's role — enhancement layer vs load-bearing** — ✅ LOCKED 2026-08-06
2. **Entry surface — how NL enters via ⌘K** — ✅ LOCKED 2026-08-06
3. **Intent contract + structured output** — ✅ LOCKED 2026-08-06
4. **Relative-time resolution** — ✅ LOCKED 2026-08-06
5. **Safe mutation pipeline — disambiguation + confirm covenant** — ✅ LOCKED 2026-08-06
6. **Availability, onboarding & graceful absence** — ✅ LOCKED 2026-08-06

Number stably — never renumber. New questions append as Q7+.

---

## Question 1 — Nano's role: enhancement layer vs load-bearing

> **Status:** ✅ LOCKED 2026-08-06. Enhancement layer — keyboard/UI path never removed; Talk ships behind a flag, default-on only where the model is `available`. → SPEC A1.

Inlay pivoted to make Nano *load-bearing* — "we use Nano fully at every instance
possible," deterministic tiers demoted to a performance cache, onboarding blocks
input until the model is present. Does Tide follow, or hold Nano at arm's length?

### Options being considered

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Enhancement layer | Talk is one optional way in; every op stays reachable by keyboard/UI. No-model machines get today's Tide unchanged. | Preserves Tide's identity; zero risk to existing users; ships behind a flag. | NL is a "nice extra," not the star. |
| B. Load-bearing (inlay-style) | NL becomes the primary interface; UI recedes. | Bold, differentiated. | Betrays "keyboard-first"; strands the ~majority without the model; huge blast radius. |

### My recommendation

**A — enhancement layer.** Gained: Tide stays the fast keyboard calendar it already
is; Talk is pure upside layered on a working product (matches the personal
engineering principle "grow in layers, never trade a working product for unfinished
complexity"). Given up: Talk won't be the headline identity. Tripwire that flips it:
if usage shows people reaching for NL over keys for most actions, revisit a
load-bearing v2. (This is really a confirmation of invariant I1.)

### Locked decisions

1. Talk is an enhancement layer; the keyboard/UI path is never removed or gated.
2. Talk ships behind a pref/flag; default on only where the model is `available`.

---

## Question 2 — Entry surface: how NL enters via ⌘K

> **Status:** ✅ LOCKED 2026-08-06. NL is a ⌘K fallthrough — palette matches first; no-match + sentence-like → "Ask Tide"; leading-prefix override. → SPEC A2.

Tide already has a ⌘K command bar (a palette: Settings, Notifications, New event…).
Where does free-text NL live relative to that palette?

### Options being considered

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Fallthrough in the same ⌘K input | Palette matches first (the deterministic "cache"); when the text matches no command and reads like a sentence, the top action becomes "Ask Tide: ‹text›" → routes to the model. | One input, no mode switch; palette stays instant; NL is discoverable exactly when a command isn't found. Mirrors inlay's unified line, Tide-flavored. | Heuristic "looks like a sentence" needs tuning; risk of surprising routing. |
| B. Explicit sub-mode / prefix | A leading `>` or a toggle enters NL mode. | Unambiguous; no misrouting. | Extra thing to learn; less magical. |
| C. Separate NL bar | A distinct input elsewhere. | Clean separation. | Second surface to build/maintain; splits muscle memory. |

### My recommendation

**A with a B safety valve.** Gained: NL is one keystroke away inside a surface users
already hit, and the palette remains a deterministic fast-path (command match →
skip the model entirely). Given up: a routing heuristic to maintain. Tripwire: if
misrouting annoys in testing, add an explicit prefix (B) as the disambiguator rather
than a whole new surface. Detail to settle at lock: the "is this NL?" test (no palette
match + contains a space/verb + above N chars).

### Locked decisions

1. NL routes through the existing ⌘K input as a fallthrough action, not a new bar.
2. Palette (deterministic) matches take priority; NL fires only on no-match.
3. A leading-prefix override is available for explicit NL.

---

## Question 3 — Intent contract + structured output

> **Status:** ✅ LOCKED 2026-08-06. Discriminated-union intent via `responseConstraint` JSON-schema (137+), `extractJson`+`normalizeIntent` behind it; `match` = hints only. → SPEC A3.

What exactly does the model return, and how do we make it reliable? This is the
contract between the parser and the agent-face dispatch.

### Options being considered

| Option | How | Pros | Cons |
|---|---|---|---|
| A. `responseConstraint` JSON schema | Pass a JSON Schema to `session.prompt()` (Chrome 137+); model output is guaranteed-shaped JSON. + `extractJson()` as belt-and-suspenders. | Predictable; less normalization; the modern path. | Requires 137+; schema must be authored carefully for a small model. |
| B. "Reply with JSON only" + `extractJson` | inlay's current approach — prompt asks for JSON, code extracts. | Works on older builds; proven in inlay. | Looser; more normalization/repair. |

Proposed contract (discriminated union on `intent`):

```
{ intent: "create",     title, start(ISO±offset), end?, calendarHint?, description? }
{ intent: "query",      range: {from,to}|relative, filter? }         // read-only
{ intent: "find_slot",  durationMin, window:{from,to}|relative, withHint? } // read-only
{ intent: "reschedule", match:{timeHint?, titleHint?}, newStart(ISO±offset), newEnd? }
{ intent: "cancel",     match:{timeHint?, titleHint?} }
```

### My recommendation

**A, with B's `extractJson` as fallback.** Gained: the structured-output constraint
does most of the reliability work a small model otherwise fumbles; normalization
shrinks to type/enum validation. Given up: a hard floor of Chrome 137 for the
constrained path (fine — the whole feature needs 138+ anyway). Tripwire: if
`responseConstraint` proves flaky for the union, fall to B's prompt-and-extract.
Every intent still passes a `normalizeIntent()` gate (I2/I4) — the schema is the
first defense, not the only one.

### Locked decisions

1. The intent contract above (discriminated union), refined during Phase 1.
2. Structured output via `responseConstraint`; `extractJson` + `normalizeIntent` behind it.
3. `match` for reschedule/cancel carries *hints only* — resolution is the app's job (Q5).

---

## Question 4 — Relative-time resolution

> **Status:** ✅ LOCKED 2026-08-06. Model-first with `buildTimeContext` demanding an offset-bearing ISO; ported `resolveDue()` recovery; null → user sets it; no date-lib. → SPEC A4.

The crux for a small model: turning "tomorrow at 9", "next Tuesday", "in 2 hours",
"Friday 6pm" into a concrete instant, correctly, across time zones and DST.

### Options being considered

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Model-first + deterministic recovery (inlay's shape) | Prompt carries `buildTimeContext()` (wall-time + numeric UTC offset + IANA zone + instant) and *demands* an offset-bearing ISO string. On miss/misformat, `resolveReminderDue()` (ported) recovers explicit cases; still null → prefill the New-Event form and let the user set it. | Model handles the fuzzy cases; deterministic net catches the common explicit ones; never silently wrong — falls to human. Proven in inlay's tests. | Two code paths; hand-rolled parser covers a subset. |
| B. Deterministic-first (a date library, e.g. chrono-node) | Parse locally first, model only for leftovers. | Precise, offline. | New dependency; inlay deliberately avoided it; conflicts with I2 ("model is the translator"). |
| C. Model-only | Trust the ISO string. | Simplest. | A small model *will* occasionally drop the offset or miscompute weekday math → silently wrong times. Unacceptable for a calendar. |

### My recommendation

**A.** Gained: reliability where it matters (explicit times resolve deterministically;
the offset-bearing-ISO rule kills the classic "local time with no zone" bug), with the
model covering natural phrasing. Given up: a bit of ported parser to maintain. Tripwire:
if the hand-rolled parser's coverage gaps bite (e.g. "end of next week", "the 15th"),
widen *it* before reaching for a dependency — and only add `chrono-node` if that
becomes untenable (→ DEFERRED). Port inlay's `reminderTime.js` largely verbatim; its
3 tests (minute/hour/day/week offsets; tomorrow/weekday wall-time; field round-trip)
come along.

### Locked decisions

1. Model-first resolution with `buildTimeContext` + the offset-bearing-ISO requirement.
2. Deterministic `resolveDue()` recovery ported from inlay; null → user sets it in a prefilled form. Never guess a time silently.
3. No date-parsing dependency in v1.

---

## Question 5 — Safe mutation pipeline: disambiguation + confirm covenant

> **Status:** ✅ LOCKED 2026-08-06 · **revised 2026-08-06**. App pre-filters candidates deterministically; the model MAY disambiguate/summarize over that set under untrusted framing + a grounding guard; every mutation previews→confirms, `cancel` explicit. → SPEC A5.
>
> **Revision (owner):** the original lock kept the model away from event text entirely. Relaxed — the model may use event text where it helps (summaries, "the dentist" matching), made safe by three layers: (1) it only ever sees a candidate set the app already pre-filtered, never the whole calendar; (2) `normalizeChosenId` discards any chosen id the app didn't offer; (3) the confirm card is the final net on every mutation. The options table below is the pre-revision record.

For `reschedule`/`cancel`, "my 2pm" / "the dentist" must resolve to *one* real event
before anything happens — and mutations must be reviewable. This is where Full-CRUD
scope earns its risk.

### Options being considered

| Option | How | Pros | Cons |
|---|---|---|---|
| A. App resolves, model only hints | Model returns `match:{timeHint,titleHint}`. App filters `listEvents` by the time window locally (deterministic), then narrows by title. 0 candidates → "couldn't find it"; 1 → staged; >1 → a pick-list the user chooses from. | Deterministic core; model never picks the victim of a delete; ambiguity surfaces to the user, never auto-resolved. | App owns matching logic. |
| B. Hand candidates to the model | Give the model the candidate events, let it choose. | Less app logic. | Event text is untrusted (I3) → prompt-injection surface on a *destructive* path; a wrong pick deletes the wrong thing. |

Plus the confirm covenant (I4): every mutation stages a **preview card** →
Enter/Confirm commits via the agent face. `cancel` (destructive, prohibited-action
sibling) requires an explicit confirm, never a bare Enter.

### My recommendation

**A + the confirm covenant.** Gained: the destructive path stays deterministic and
injection-resistant; the user always sees exactly which event moves/dies and says yes.
Given up: Talk-side matching code (small — it's a filter over an array Tide already
holds). Tripwire: if title-matching is too weak, add Nano title disambiguation *only*
over a pre-filtered candidate set, under I3 untrusted framing — never over the whole
calendar, never as the resolver of record. Reuse inlay's `assistFlow` draft→commit
shape; commit routes through `window.tide.agent.*`.

### Locked decisions

1. Event resolution is app-side/deterministic (filter `listEvents` by time then title); model supplies hints only.
2. 0 → honest miss; 1 → staged; >1 → user pick-list. Never auto-act on an ambiguous match.
3. All mutations stage a preview→confirm; `cancel` requires an explicit (non-default) confirm.

---

## Question 6 — Availability, onboarding & graceful absence

> **Status:** ✅ LOCKED 2026-08-06. Probe → 4-state ⌘K affordance; download only from a user-activation handler with progress; `unavailable` dims to a status line. → SPEC A6.

Most users won't have the model ready (desktop-only, download required, Chrome
138+). How does Talk appear, acquire the model, and get out of the way when absent?

### Options being considered

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Probe → progressive affordance | `probeAvailability()` on load. `available` → "Ask Tide" live in ⌘K. `downloadable` → a one-line "Enable on-device AI" that, on click (user activation), calls `acquireLanguageModel(onProgress)` with a progress line. `unavailable` → the affordance is absent, or a dimmed status ("needs Chrome 138+"). | Honest about state; download only on explicit action (Chrome requires user-activation anyway); app 100% usable throughout. Ports inlay's ladder directly. | A little state machine in the ⌘K surface. |
| B. Assume-available, fail at call time | No probe; try to `create()` and handle the error. | Less code. | Ugly failure UX; can't show download progress; dishonest affordance. |

### My recommendation

**A.** Gained: a truthful, self-explaining affordance and a clean acquisition flow,
with Tide fully functional in every state (I1). Given up: a small availability state
machine. Tripwire: none material — this is table stakes for a feature gated on an
optional model. Reuse `probeAvailability`/`acquireLanguageModel`/`SESSION_OPTIONS`
(incl. the `expectedOutputs: en` declaration) from inlay near-verbatim.

### Locked decisions

1. Probe availability on load; drive a 4-state affordance in ⌘K.
2. Model download only from a user-activation handler, with visible progress.
3. `unavailable` hides/dims Talk to a status line; the rest of Tide is unaffected.

---

## Pattern: locked sections look like this

When a question locks, replace its body with:

```
## Question N — <title>
> **Status:** ✅ LOCKED <YYYY-MM-DD>. <one-sentence decision summary>
### Locked decisions
1. **<sub-decision>** — locked. <reasoning + implication>
### Build sequence delta
<what this adds to SPEC.md's build sequence — update SPEC.md to match>
```
