# Overflow — Project Handoff

This document is the single source of truth for the Overflow project. If you're
a fresh assistant session (e.g. picking this up in Cowork), read this first: it
captures what the game is, why it's designed the way it is, the current state of
the build, and what's left to do. The *why* matters — many of the decisions
below were reached by testing and rejecting alternatives, so please don't
re-litigate them without cause.

---

## What Overflow is

A minimal, tactile puzzle game for mobile, in the spirit of the app "Arrows" —
same *essence* (quick to play, clear-the-board, satisfying, scales in
difficulty), but an original mechanic.

**Core loop.** The board is a grid of cells, each holding a NUMBER and having
its own per-cell CAP. Tapping a cell empties it and splits `floor(value * ratio)`
evenly across its 4 orthogonal neighbours (remainder discarded; shares that fall
off-grid are lost — this is the ONLY way total value drains, which guarantees the
board terminates). A cell BURSTS if it exceeds its cap. Bursting cascades: a
burst cell distributes its value, which can push neighbours over their caps,
chaining outward. **Each bursting cell costs one life; 3 lives per board.** Chains
resolve deterministically and can outrun your lives, losing the board.

**Green cells.** A cell whose tap would push nothing (`floor(value*ratio/4) === 0`)
is "green" — safe filler. Greens are LOCKED (can't be tapped) until every
remaining cell is green, at which point the board auto-resolves as a win.

**Goal.** Clear the board. Binary win/lose (no star ratings — deliberately, to
avoid encouraging retries). Clearing advances a level; a wipeout offers "Try
again" at the same level.

---

## Design decisions and WHY (hard-won — don't undo lightly)

- **Numbers, not pips.** Splitting a number 4 ways with no privileged direction
  gives light arithmetic and clean interference. (Started with pips, switched.)

- **Per-cell caps, drawn across a [min,max] range.** A uniform cap made the game
  trivially greedy-solvable ("tap the highest number" won ~95%). Varied caps make
  *headroom* (cap − value) the thing you read, not raw magnitude.

- **The central difficulty insight: difficulty = FULLNESS, and LOW caps force it.**
  A cell only threatens a burst when its headroom is small (≤ ~cap/4, because of
  the ÷4 split). High caps leave cells proportionally emptier → EASIER. So low
  caps are HARDER. Big numbers for "arithmetic difficulty" actively fight
  difficulty. Keep caps low.

- **Fully-packed boards (Leon's key breakthrough).** Filling EVERY cell to start
  is what makes the game hard even on small grids: with no empty space, a
  careless tap order trips a cascade fast. This overturned an earlier (wrong)
  conclusion that "small grids can't be hard" — the real safety floor was empty
  space, not grid size. Full 3×3 drops careless-play win rate to ~34%, full 4×4
  to ~9%.

- **Depth vs fairness — the fundamental tension.** A puzzle only has depth if some
  safe moves can strand you (so order matters). A game you can never get stuck in
  has no decisions. Lives are what keep stranding FAIR: a mistake costs a life,
  not the run. Leon explicitly disliked pure "trap boards" (unfair lock-ups) and
  disliked the heat-tint colour aid (it did the reading for you) — both are OFF /
  rejected. The chosen identity: **varied low caps, no colour, full boards, read
  the board yourself.**

- **Tuning target (Leon's explicit choice): HARD.** Careless play should fail at
  every level; even careful greedy play should be challenged; a genuine planner
  does best. Careless ~40%→~8% across the curve; careful-greedy ~85%→~64%; a
  planning player beats greedy (so late losses reward planning, aren't just
  unfair).

- **Level curve.** Fully packed at every level. Grid size is fixed-length
  tiers of 25 levels each, growing forever: 3×3 (L1–25) → 4×4 (L26–50) → 5×5
  (L51–75) → 6×6 (L76–100) → ... See `gridSizeForLevel()` / `levelParams()` in
  the engine (`LEVELS_PER_GRID_TIER`).
  - **Supersedes an earlier decision.** This doc used to say "capped at 5×5 —
    6×6 makes even careful play lose unfairly," based on solver playtesting at
    the time. Leon revisited this (2026-07-30) and chose infinite grid growth
    over a fixed cap, since levels need to be endless. He then revisited the
    *pacing* the same day: 5×5 used to show up at level 10, felt "really hard"
    that early, so each size now gets a full 25 levels before the next size
    kicks in — 5×5 doesn't appear until level 51. The old fairness concern
    about 6×6+ hasn't been re-verified with fresh playtesting/solver runs;
    worth sanity-checking win-rate curves at 6×6/7×7+ before calling this done.
  - Cap range no longer slides continuously with level — it steps in small
    jumps every `CAP_STEP_LEVELS` (5) levels instead, a plateau-then-bump feel
    rather than a smooth ramp. `capMax` climbs 9→42 (saturates ~level 36 now,
    pushed out from the old ~29); `capMin` tightens 7→4 (floors ~level 24,
    unchanged — it's on its own every-8-levels step, not tied to the new
    5-level cap-max stepping). Both saturate partway through the 3×3/4×4
    tiers, so grid size alone carries the difficulty ramp for the remainder of
    the curve. Not re-verified against these new, much longer tiers — same
    "hasn't been freshly playtested" caveat as the grid-growth decision above.

- **At most one full (at-cap) cell to start, and it must be SAFE to tap.** A full
  cell is the obvious "tap first" focal point; more than one, or one that bursts a
  neighbour, makes the opening either obvious or an unfair trap.

- **Generation is FORWARD + verified.** Place a full board directly, then check
  it's winnable with an exact solver (memoised DFS; the board drains so it's
  bounded). The older backward generator had a density ceiling and couldn't make
  full low-cap boards. Solver budget is capped (20000) so generation stays fast
  (~3ms on 3×3, ~40ms on full 5×5 in V8/JS).

- **Cascade animation steps through per-burst frames** so the chain visibly
  travels from the tapped cell outward — the logic was always correct, but
  revealing the whole overflowed board at once made distant bursts look like bugs.

### Open questions (not yet decided)
- Unlimited same-level retries may make losing feel stakeless vs Arrows' fail
  limit. Possible middle grounds: a few retries before reset, or a "best level
  reached" to protect. Not yet resolved — worth playtesting.
- Retry currently gives a NEW board at the same level (skill focus), not the
  identical board (learn-from-mistake). Small change if the other is preferred.

---

## Current state of the build

**The engine is done and validated.** `src/engine/index.js` is pure, DOM-free,
framework-independent game logic: generation, exact solver, cascade resolution,
full-board packing, the level curve, and the new/next/retry lifecycle. State is a
plain serialisable object `{ n, ratio, cells[], caps[], level, lives, taps,
status }`. Every operation returns a fresh state (no mutation). `src/engine/test.js`
has 36 passing tests (`npm test`).

**The Expo app scaffold is done** (this is an Expo / React Native project, one
codebase for iOS + Android):
- `src/state/useGame.js` — the hook bridging engine → UI: frame-by-frame cascade
  animation, haptics on tap/burst, AsyncStorage persistence of level + stats,
  win advances level, loss offers Try again.
- `src/components/Board.jsx`, `Cell.jsx`, `Hud.jsx` — render from engine state.
- `src/screens/GameScreen.jsx` — assembles it.
- `src/theme.js` — the graph-paper / ink visual language, in one place.
- `App.js`, `index.js`, `package.json`, `app.json`, `babel.config.js` — config.

Verified offline: all 36 engine tests pass in-app, all imports resolve, all files
are syntactically sound. NOT yet verified: `npm install` and rendering on a real
device (the previous environment had no network). **First thing to do in Cowork:
`npm install` then `npm start`, and run it in Expo Go to confirm it renders.**

---

## Roadmap

- **Step 1 — Extract engine.** DONE.
- **Step 2 — Scaffold Expo app.** DONE (this folder).
- **Step 3 — Feel & meta (NEXT):**
  - Sound effects (tap, burst, win).
  - First-run onboarding / tutorial (level 1 full 3×3 is already the gentle
    on-ramp; wants a light guided first board).
  - Stats + achievements screen (Leon wanted this from the start; keep scope
    tight — best level, boards cleared, streaks, a handful of achievements).
- **Step 4 — Ship prep:**
  - App icon, splash, adaptive icon (the `assets/` folder is currently empty).
  - Store screenshots, privacy policy.
  - Apple Developer account ($99/yr), Google Play account ($25 one-time).
  - Change the placeholder bundle IDs in `app.json` (`com.yourname.overflow`).
  - Build + submit via Expo (EAS).

---

## Who / working style

Leon — QA / test-automation engineer, comfortable with JS/npm/React tooling,
based in Brighton UK. This whole game was designed collaboratively through
simulation-driven playtesting: propose a change, measure win rates / threat
density / fairness with quick scripts, keep what works. He values honesty about
tradeoffs over agreement, catches design flaws by playing, and has good
instincts (the fully-packed-board breakthrough was his). Match that: test claims
before asserting them, be straight about what's a real limit vs a tuning knob,
and don't over-polish or pad.
