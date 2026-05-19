# Frontend Live Event Chain — Implementation Report

Handoff document for the live SSE event-chain work: ingestion, paced reveal, display polish, and score/toast hardening on the FootFive frontend.

---

## 1. Summary of What Changed

The frontend now supports the backend’s **narrated event chains** (build-up, shots, penalties, shootouts) end-to-end:

- **Ingestion & normalisation** — `LIVE_SSE_EVENT_TYPES` expanded so named SSE events are not silently dropped; `normalizeLiveEvent` lifts `bundleId`, `bundleStep`, `chain_type` / `chain_terminal`, and `pacing` onto a unified event shape.
- **Display** — Icons (`formatters.js`), headlines and tension-tier styling (`EventFeed.jsx`), and timeline labels (`EventTimeline.jsx`) for all new flow types.
- **Paced reveal queue** — Live match detail shows events one-at-a-time with configurable delay instead of dumping the full buffer instantly.
- **Score & toast hardening** — Match and penalty scores update only from authoritative event types; goal toasts on the live match page fire on **reveal**, not ingest.
- **Penalty / shootout polish** — Distinct visual tiers (amber awarded, orange tension walk-ups, violet reaction, primary goal highlight).
- **Regression fix** — `scheduleCatchUpFlush` declared before `onEvent` in `LiveMatchDetail.jsx` to resolve a temporal-dead-zone error on reconnect.

Internal state still tracks the full event list (`events`); the feed renders **`visibleEvents`** from the paced queue.

---

## 2. Changed Files and Their Purpose

| File | Purpose |
|------|---------|
| `src/utils/liveEventModel.js` | SSE type registry, event normalisation (bundle/chain/pacing fields), dedupe/sort helpers, score/toast guard helpers (`canApplyMatchScoreFromEvent`, `canApplyPenaltyScoreFromEvent`, `GOAL_TOAST_EVENT_TYPES`) |
| `src/utils/liveEventModel.test.js` | Unit tests for normalisation, score guards, and chain field lifting |
| `src/hooks/pacedRevealQueue.js` | Imperative queue: enqueue, timer-based reveal, immediate bootstrap/catch-up paths, dedupe by seq/id |
| `src/hooks/usePacedEventReveal.js` | React hook wrapping the queue; exposes `visibleEvents`, `enqueue`, `setVisibleImmediately`, `appendVisibleImmediately`, `reset`; fires `onEventRevealed` only for paced reveals |
| `src/hooks/pacedRevealQueue.test.js` | Queue timing, dedupe, bootstrap vs paced behaviour |
| `src/pages/LiveMatchDetail.jsx` | Wires paced reveal to `EventFeed`; bootstrap via REST; reconnect catch-up window; goal toasts on reveal; score updates via guard helpers; TDZ fix |
| `src/components/live/EventFeed.jsx` | Event row headlines, icons, tension/goal/penalty styling tiers, shootout score inline display |
| `src/utils/formatters.js` | Emoji icons for new event types |
| `src/components/fixtures/EventTimeline.jsx` | Human-readable labels for fixture timeline (post-match / list views) |
| `src/stores/useLiveStore.js` | Global SSE handler uses score guard helpers so fixture list scores are not corrupted by build-up events |

---

## 3. New Event Types Now Supported

These chain / flow types were added (or fully wired) in this work:

| Type | Category |
|------|----------|
| `midfield_battle` | Possession / flow |
| `goal_build_up` | Attack narrative |
| `attack_breakdown` | Attack narrative |
| `counter_attack` | Attack narrative |
| `counter_breakdown` | Attack narrative |
| `shot_saved` | Shot outcome |
| `shot_missed` | Shot outcome |
| `shot_blocked` | Shot outcome |
| `goal` | Scoring |
| `kickoff_restart` | Match state |
| `penalty_awarded` | In-play penalty |
| `penalty_walkup` | In-play penalty |
| `penalty_run_up` | In-play penalty |
| `penalty_scored` | In-play penalty |
| `penalty_saved` | In-play penalty |
| `penalty_missed` | In-play penalty |
| `shootout_walkup` | Shootout |
| `shootout_goal` | Shootout |
| `shootout_save` | Shootout |
| `shootout_miss` | Shootout |
| `shootout_reaction` | Shootout |
| `shootout_end` | Shootout |

All must appear in `LIVE_SSE_EVENT_TYPES` (or be delivered as generic messages) or EventSource listeners will never receive them.

---

## 4. How the Paced Reveal Queue Works

```
SSE onEvent → enqueue(event) → [queue] → setTimeout(delay_ms) → prepend to visibleEvents → onEventRevealed
```

1. **`createPacedRevealQueue`** maintains `visibleEvents` (newest-first), a FIFO `queue`, and a single active timer.
2. **`enqueue`** skips duplicates (by seq / event_id / composite key via `getEventDedupeKey`) and calls `processQueue`.
3. **`processQueue`** shifts one event, reads delay via `getEventPacingDelayMs(event, defaultDelayMs)`, schedules reveal, then recurses.
4. **Default delay:** `1000 ms`. Override per event from `event.pacing.delay_ms` or `event.metadata.pacing.delay_ms`.
5. **On reveal:** event is prepended to `visibleEvents` (sorted desc by seq/minute/second), UI updates, and `onEventRevealed` fires (used for goal toasts).
6. **`usePacedEventReveal`** holds the queue in a ref and mirrors `visibleEvents` into React state.

`LiveMatchDetail` passes `visibleEvents` to `EventFeed`; the full `events` array is still maintained separately for seq tracking and store sync.

---

## 5. Bootstrap / Reconnect Catch-Up vs Live Pacing

| Mode | Trigger | API | Pacing | Goal toast |
|------|---------|-----|--------|------------|
| **Bootstrap** | Initial page load (`fetchMatch`) | `setVisibleImmediately(sorted)` after REST `/recent` + store merge | None — all history shown at once | No — `onEventRevealed` not called |
| **Reconnect catch-up** | SSE reconnects after prior connection (`beginCatchUpWindow`) | Events buffered in `catchUpBufferRef`, flushed via `appendVisibleImmediately(batch)` after 150 ms debounce (500 ms initial window) | None — batch appended instantly | No |
| **Live** | Steady SSE stream, not in catch-up | `enqueueVisibleEvent(event)` | Yes — per-event `delay_ms` or 1000 ms default | Yes — `goal` / `penalty_scored` on reveal only |

Catch-up avoids replaying dozens of paced delays after a tab refresh or network blip. Live pacing preserves narrative rhythm during normal viewing.

---

## 6. How Score / Toast Safety Now Works

### Match score (`event.score`)

Updated only when **both** conditions hold:

- Event carries a `score` object, and
- `event.type` ∈ `{ goal, penalty_scored, match_end, shootout_end }`

Applied in `applyLiveEventToMatch` (`LiveMatchDetail`) and `useLiveStore.handleEvent`. Build-up, shot, and flow events with incidental score fields no longer move the header score.

### Penalty / shootout score (`event.penaltyScore`)

Updated only when **both** conditions hold:

- Event carries `penaltyScore`, and
- `event.type` ∈ `{ shootout_goal, penalty_scored, match_end, shootout_end }`

### Goal toasts

- **`LiveMatchDetail`:** `GOAL_TOAST_EVENT_TYPES` = `{ goal, penalty_scored }`. Toasts fire in `handleEventRevealed` with dedupe via `goalToastSeenRef` + `getEventDedupeKey`.
- **Lifecycle toasts** (extra time, shootout start, full time, match complete) still fire on ingest in `onEvent` — they are not paced.

---

## 7. Penalty and Shootout Display Behaviour

`EventFeed` assigns visual tiers by event kind:

| Tier | Types | Styling |
|------|-------|---------|
| **Goal** | `goal`, `penalty_scored`, `penalty_goal`, `shootout_goal`, `shootout_end` | Primary border/glow, large headline, bounce emoji |
| **Penalty awarded** | `penalty_awarded` | Amber surface, amber headline |
| **Important** | Cards, shot outcomes, penalty/shootout save-miss, `counter_attack` | Yellow tint |
| **Tension** | `penalty_walkup`, `penalty_run_up`, `shootout_walkup` | Orange tint, italic text, slow pulse animation |
| **Reaction** | `shootout_reaction` | Violet tint, compact padding |
| **Default** | Other flow events | Standard card row |

Headlines use `TEAM_EVENT_TEMPLATES` / `NEUTRAL_EVENT_TEMPLATES` (e.g. “PENALTY awarded to {team}!”, “{team} walk to the spot…”). Shootout running score shown when `event.shootoutScore` is present. Match header in `LiveMatchDetail` shows `(H - A pens)` when `penaltyScore` is non-zero.

`EventTimeline.jsx` mirrors labels for fixture/post-match views.

---

## 8. Test / Build Results

| Check | Result |
|-------|--------|
| Unit tests (`npm test`) | **78 passed** |
| Production build (`npm run build`) | **Success** |

Coverage includes `liveEventModel` normalisation/score guards and `pacedRevealQueue` timing/dedupe/bootstrap paths.

---

## 9. Known Remaining Risks / TODOs

1. **`penalty_scored` in `PENALTY_SCORE_EVENT_TYPES`** — In-play penalties update `penaltyScore` if the backend attaches it. Confirm whether that field should only reflect shootout tallies; may need to remove `penalty_scored` from the penalty-score allowlist.
2. **FixtureList goal toasts still fire on ingest** — `FixtureList.jsx` shows a goal toast immediately on SSE `goal` events, not on paced reveal. Behaviour differs from `LiveMatchDetail`; may cause duplicate or early toasts when navigating between views.
3. **Node version warning** — Build emits an engine warning; upgrade local/CI Node to **≥ 20.19** to align with tooling expectations.
4. **No E2E / browser tests** — Paced reveal, reconnect catch-up, and visual tiers are covered by unit tests only; manual browser verification is required before release.

---

## 10. Manual Browser Test Checklist

### Bootstrap

- [ ] Open a live fixture detail page mid-match; recent events appear immediately (no staged delay).
- [ ] Score in header matches latest authoritative goal event, not build-up rows.
- [ ] No goal toast spam on initial load.

### Live pacing

- [ ] New SSE events appear one-by-one (~1 s apart unless backend sets `pacing.delay_ms`).
- [ ] Goal toast appears when the goal row is **revealed**, not when it first arrives over the wire.
- [ ] Feed auto-scrolls to newest revealed event.

### Reconnect

- [ ] Disable network briefly, re-enable; missed events appear in a batch without multi-second replay delay.
- [ ] No duplicate rows after reconnect (check seq numbers).
- [ ] Score remains correct after catch-up flush.

### Penalty / shootout chain

- [ ] `penalty_awarded` shows amber styling.
- [ ] Walk-up / run-up events show orange tension styling and pulse.
- [ ] `penalty_scored` / `penalty_saved` / `penalty_missed` show correct headline and icon.
- [ ] Shootout: walk-up → outcome → reaction → `shootout_end` sequence renders with distinct tiers.
- [ ] Penalty tally in header updates on shootout goals, not on walk-ups.

### Fixture list (regression)

- [ ] Fixture list scores update on goals; note early goal toast behaviour (known gap).
- [ ] Navigate fixture list → live detail; no crash, seq continuity preserved.

### Finished match

- [ ] Completed fixture timeline (`EventTimeline`) shows new type labels.
- [ ] Match end / shootout end sets `FINISHED` state and completion toast.

---

## 11. Deployment Notes

- **Build:** `npm ci && npm run build` — output in `dist/`.
- **Static hosting:** Deploy `dist/` to the web root (see `docs/DEPLOYMENT.md` for nginx on jwd1.xyz). SPA fallback: `try_files $uri $uri/ /index.html`.
- **SSE proxy:** Ensure `/api/live/events` has **proxy buffering disabled** (`proxy_buffering off`, long `proxy_read_timeout`) or paced events will arrive in bursts and break timing.
- **API base:** Confirm production env points at the live backend (port 9001 per deployment guide).
- **Cache busting:** Hashed JS/CSS assets are immutable; `index.html` should not be long-cached after deploy.
- **Node:** Use Node **≥ 20.19** in CI and on build hosts to avoid engine warnings and future incompatibility.
- **No backend deploy required** for this frontend-only change, but the backend must emit the new named SSE types and optional `pacing` / chain metadata for full effect.

---

*Report generated for team handoff — frontend live event chain implementation.*
