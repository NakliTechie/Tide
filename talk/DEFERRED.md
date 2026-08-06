# talk — Deferred to v2+

> **Lifecycle:** `living` — features and decisions intentionally pushed past v1. Parked, not forgotten. Each entry has a trigger that says when to revisit. Started 2026-08-06.

## Content / UX layers

### Voice input

Speak the phrase instead of typing it (Web Speech API → the same parse pipeline).

**Why deferred:** v1 proves the text→intent→calendar path first; voice is a second
input onto a solved pipeline, not new capability.

**Trigger to revisit:** text Talk ships and the parse pipeline is stable in daily use.

### Multi-turn conversation

Dialogue state — "move it to 4 instead", "no, the other one", follow-ups that
reference the previous turn.

**Why deferred:** v1 is one phrase → one intent → one preview. Multi-turn needs
conversation memory and a very different UX; inlay explicitly deferred unbounded chat
too.

**Trigger to revisit:** users repeatedly try to refine a result conversationally
rather than re-typing.

### Day-prep via Summarizer / Writer / Rewriter APIs

"Summarize tomorrow", "prep me for my 3pm", action-item extraction from a day note —
using Chrome's *dedicated* task APIs rather than the general Prompt API.

**Why deferred:** v1 covers query/summary adequately through the Prompt API; the
dedicated APIs are an optimization and a larger surface.

**Trigger to revisit:** query/summary quality via the Prompt API proves insufficient,
or day-prep becomes a headline ask.

### Recurring-event natural language

"every Tuesday at 10", "move all my standups" — RRULE generation and series edits.

**Why deferred:** single-event CRUD is the v1 contract; recurrence is a materially
harder parse + a series-vs-instance edit model.

**Trigger to revisit:** single-event Talk is solid and recurrence is the top request.

## Runtime / framework

### Date-parsing dependency (chrono-node or similar)

A real NL date library behind the deterministic recovery parser.

**Why deferred:** Q4 locks model-first + a ported hand-rolled recovery parser + no new
dep. Adding a library now duplicates the model's job and contradicts I2.

**Trigger to revisit:** the hand-rolled parser's coverage gaps (e.g. "end of next
week", "the 15th", ordinal dates) bite in real use and widening it becomes untenable.

### Nano as load-bearing (inlay-style pivot)

NL as Tide's *primary* interface rather than an enhancement layer.

**Why deferred:** Q1/I1 lock the enhancement-layer posture to protect Tide's
keyboard-first identity.

**Trigger to revisit:** usage shows people reaching for NL over keys for most actions.

## Public surface

### Server-side / cross-device NL model

Any move of parsing off-device (a cloud model) for machines without on-device AI.

**Why deferred:** contradicts the whole premise — private, keyless, offline,
"your token stays in the browser." v1 is on-device only.

**Trigger to revisit:** never, unless the product's privacy posture is deliberately
revisited; on-device model availability broadening is the preferred path instead.
