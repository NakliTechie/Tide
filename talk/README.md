# talk

> **Lifecycle:** `living` 2026-08-06 — SPEC.md locked (all 6 walkthroughs folded, A1–A6). Development deferred until after the cross-device (Phase 2/3 identity) track.

**Talk** drives Tide's calendar in plain language — *"book lunch with Sam tomorrow
at noon"*, *"find me 30 min this week"*, *"what's on tomorrow?"*, *"push my 2pm to
4pm"*, *"clear my afternoon"* — parsed on-device by Chrome's built-in Prompt API
(Gemini Nano). No API key, no server, works offline, nothing leaves the browser. It
maps a phrase to a structured intent and calls the operations Tide already exposes at
`window.tide.agent`. An enhancement layer: on a machine without the model, Tide is
exactly the app it is today.

## How this fits in the repo

```
tide/
├── worker.js                   ← Worker (OAuth proxy, notes, /api/session)
├── public/index.html          ← the app (Auth, agent face @ :2441, ⌘K bar)
├── plan/                       ← ongoing planning (gitignored)
└── talk/                       ← THIS INITIATIVE
    ├── SPEC.md                 ← goal, invariants I1–I4, prior-art map, build sequence
    ├── walkthroughs.md         ← 6 open scope-defining questions
    ├── DEFERRED.md             ← v2+ items with revisit triggers
    └── README.md               ← this file (quickstart + status)
```

## Status

**Scope (locked 2026-08-06):** Full CRUD — `query` · `find_slot` · `create` ·
`reschedule` · `cancel`.

**Decisions locked (all 2026-08-06 — see SPEC A1–A6):**
- [x] Q1 — Nano's role → enhancement layer
- [x] Q2 — Entry surface → ⌘K fallthrough
- [x] Q3 — Intent contract → discriminated union via `responseConstraint`
- [x] Q4 — Relative-time → model-first + deterministic recovery, no date-lib
- [x] Q5 — Safe mutation → app resolves + preview/confirm covenant
- [x] Q6 — Availability → probe → progressive affordance

**Build status** (all on `talkv1`, node suite 30/30):
- [x] Spec scaffolded
- [x] Phase 1 — the seam (`Talk.real()`/`Talk.fake()`, time context, intent schema) — `63b10c8`
- [x] Phase 2 — dispatch + agent-face create/reschedule/cancel/query/find-slot — `c750655`
- [x] Phase 3a — inline-build mechanism (single-file preserved) — `37f6f1d`
- [x] Phase 3b — ⌘K surface: NL entry + preview/confirm card + availability — `83bdc62`
- [~] Phase 4 — polish: find-slot rendering + states done; model-written day summaries deferred (see DEFERRED)

**Remaining (dev-process):** Stage 6 security sweep · Stage 7 frontend walkthrough (needs a connected account + the downloaded model — owner `[test]`).

See [SPEC.md §"Build sequence"](SPEC.md) for the ordered steps.

## Related docs

- [SPEC.md](SPEC.md)
- [walkthroughs.md](walkthroughs.md)
- [DEFERRED.md](DEFERRED.md)
- Prior art: `~/Code/inlay/src/core/{languageModel,reminderTime,assistFlow}.js`

## Branch

Development happens on `talkv1` (created when Stage 5 begins — not yet, to keep it
disentangled from the in-flight Phase 2 diff on `main`):

```
git checkout -b talkv1
```
