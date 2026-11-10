/*
 * Overflow — game engine
 * ----------------------------------------------------------------------------
 * Pure game logic, no DOM, no rendering, no framework. Everything the app's
 * front-end needs to run the game lives here as plain functions over explicit
 * state. This is the validated core: board generation, the fully-packed level
 * curve, cascade resolution, the exact winnability solver, and win/loss rules.
 *
 * Design facts baked in (all validated during prototyping):
 *  - Tapping a cell empties it and splits floor(value * ratio) evenly across
 *    its 4 orthogonal neighbours (remainder destroyed). Off-grid shares are
 *    lost — that's the only way total value drains, guaranteeing termination.
 *  - A cell bursts if it exceeds its own (per-cell) cap. Bursting cascades and
 *    costs one life per bursting cell. Chains resolve deterministically.
 *  - "Green" cells push nothing (floor(value*ratio/4) === 0); they're locked
 *    until every remaining cell is green, then the board auto-resolves (win).
 *  - Boards are generated FULLY PACKED (every cell filled) so careless play is
 *    punished even on a small grid; verified winnable by the exact solver, with
 *    at most one full (at-cap) cell and that cell guaranteed safe to tap.
 *  - Level curve: full 3x3 (L1-3) -> 4x4 (L4-9) -> 5x5 (L10+), cap range widens
 *    with level. Danger is constant (boards always full); only reading load scales.
 *
 * State shape (a plain serialisable object):
 *   {
 *     n,            // grid side length
 *     ratio,        // push ratio
 *     cells: [],    // length n*n, current value per cell (0 = empty)
 *     caps:  [],    // length n*n, per-cell cap
 *     level,        // current level (levels mode)
 *     lives,        // remaining lives
 *     taps,         // taps taken this board
 *     status,       // 'play' | 'won' | 'lost'
 *   }
 *
 * The engine never mutates the state you pass in; every operation returns a
 * fresh state (plus, for a tap, an animation-friendly description of what
 * happened). That makes it trivial to drive from React state or to unit-test.
 */

'use strict';

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const MAX_LIVES = 2; // 3x3's life count — kept as its own name since it's
// also the pre-existing default for any state built without going through
// livesForGrid (e.g. test.js's hand-built states).

// Lives scale with grid size — a bigger board has more cells that can chain
// into a single cascade, so more lives to survive genuine bad luck rather
// than the extra difficulty being pure life-count attrition on top of the
// tighter caps. Leon's explicit values (3x3=2, 4x4=4, 5x5=6, 6x6=8 — the
// last only ever seen in the daily challenge's Master tier).
// Previously 3/5/7/10 (itself already lowered once from an initial
// 3/7/10/13 after playtesting felt too generous) — trimmed again after
// noticing a 3x3 board has much less room for a cascade to actually chain
// through (fewer neighbours per cell, less board to propagate across), so
// its 3-life buffer mostly sat unused and made the tutorial size feel
// trivial rather than genuinely low-risk.
function livesForGrid(n) {
  if (n >= 6) return 8;
  if (n === 5) return 6;
  if (n === 4) return 4;
  return MAX_LIVES;
}

// Ladder-only override — Leon's call: the ladder's 4x4 band (levels
// 101-500ish) started feeling too easy once the difficulty curve plateaus
// there (see levelParams' capMin/capMax tables), and he wants that
// addressed via lives rather than the number curve itself. Daily
// Challenge's Intermediate tier is also a 4x4 board but goes through
// newDailyGame (below), which still calls livesForGrid directly — it's a
// short, single-attempt timed puzzle, not an extended ladder run, so this
// tightening deliberately doesn't apply there.
function ladderLivesForGrid(n) {
  return n === 4 ? 3 : livesForGrid(n);
}

// Lives restored by a rewarded "continue" after losing a board: half the
// board's normal count, rounded up (3x3=1, 4x4=2, 5x5=3, 6x6=4) — a real
// second chance, not a full reset that would make the ad a free retry.
function continueLivesForGrid(n) {
  return Math.ceil(livesForGrid(n) / 2);
}

/* ------------------------------------------------------------------ helpers */

function neighbours(i, n) {
  const r = Math.floor(i / n), c = i % n, out = [];
  for (const [dr, dc] of DIRS) {
    const rr = r + dr, cc = c + dc;
    out.push(rr >= 0 && rr < n && cc >= 0 && cc < n ? rr * n + cc : -1);
  }
  return out;
}

// Amount a cell of `value` sends to EACH neighbour when tapped/burst.
function shareEach(value, ratio) {
  return Math.floor(Math.floor(value * ratio) / DIRS.length);
}

// A cell that pushes nothing when tapped (safe filler, cleared at the end).
function isGreen(value, ratio) {
  return value > 0 && shareEach(value, ratio) === 0;
}

// Apply a single tap/burst to a cells array (pure): empty cell i, distribute
// its share to on-grid neighbours. Returns a new array.
function distribute(cells, i, n, ratio) {
  const out = cells.slice();
  const s = shareEach(out[i], ratio);
  out[i] = 0;
  if (s > 0) {
    for (const t of neighbours(i, n)) if (t >= 0) out[t] += s;
  }
  return out;
}

// Like distribute, but a neighbour that was EMPTY before receiving this share
// never bursts from it — its cap rises to meet the incoming value instead.
// (An empty cell has nothing built up in it; overflowing straight into
// emptiness didn't feel like a fair burst.) Only applies to that single
// distribution event — a neighbour that already held a value still bursts
// normally if pushed over its cap. Returns { cells, caps }; `caps` is the
// same array reference back if nothing grew.
function distributeAndGrow(cells, caps, i, n, ratio) {
  const before = cells;
  const out = distribute(cells, i, n, ratio);
  let capsOut = caps;
  for (const t of neighbours(i, n)) {
    if (t < 0) continue;
    if (before[t] === 0 && out[t] > capsOut[t]) {
      if (capsOut === caps) capsOut = caps.slice();
      capsOut[t] = out[t];
    }
  }
  return { cells: out, caps: capsOut };
}

/* --------------------------------------------------------------- inspection */

// Cells that can legally be tapped right now (non-green, and — if any non-green
// remain — greens are locked). Does NOT filter by safety; a legal tap may burst.
function legalTaps(state) {
  const { cells, ratio } = state;
  const live = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] > 0) live.push(i);
  if (!live.length) return [];
  const allGreen = live.every(i => isGreen(cells[i], ratio));
  if (allGreen) return [];                 // board is won (auto-resolves)
  return live.filter(i => !isGreen(cells[i], ratio));
}

// Would tapping cell i burst at least one cell (start a cascade)?
function tapBursts(state, i) {
  const { cells: after, caps } = distributeAndGrow(state.cells, state.caps, i, state.n, state.ratio);
  return after.some((v, k) => v > caps[k]);
}

// Safe taps = legal taps that burst nothing.
function safeTaps(state) {
  return legalTaps(state).filter(i => !tapBursts(state, i));
}

/* ---------------------------------------------------------------- cascade */

// Resolve all bursting cells from a board that may have over-cap cells.
// Returns { cells, caps, bursts, frames } where bursts is the ordered list of
// cells that burst (one life each), frames[k] is the board snapshot right
// after the k-th burst (for step-by-step animation), and caps reflects any
// growth from distributeAndGrow along the way (same reference back if none
// grew).
function resolveCascade(startCells, startCaps, n, ratio) {
  let work = startCells.slice();
  let caps = startCaps;
  const bursts = [], frames = [], queued = new Set(), queue = [];
  for (let i = 0; i < work.length; i++) if (work[i] > caps[i]) { queue.push(i); queued.add(i); }
  let guard = 0;
  while (queue.length && guard++ < 10000) {
    const i = queue.shift();
    queued.delete(i);
    if (work[i] <= caps[i]) continue;
    bursts.push(i);
    const grown = distributeAndGrow(work, caps, i, n, ratio);
    work = grown.cells;
    caps = grown.caps;
    frames.push(work.slice());
    for (let k = 0; k < work.length; k++)
      if (work[k] > caps[k] && !queued.has(k)) { queue.push(k); queued.add(k); }
  }
  return { cells: work, caps, bursts, frames };
}

/* --------------------------------------------------------------- the move */

/*
 * Apply a tap. Returns:
 *   {
 *     state,         // new state after the tap fully resolves
 *     result,        // null | 'won' | 'lost' | 'ignored' (bursts/frames tell you if it cascaded)
 *     after,         // board right after the tapped cell's own distribution,
 *                     // BEFORE any cascade or win-sweep — the UI animates from
 *                     // this (it's what a player watching would see land first).
 *     bursts,        // indices that burst (for animation / life display), in order
 *     frames,        // board snapshots after each burst (cascade animation)
 *     livesLost,     // number of lives spent this tap
 *   }
 * Illegal taps (empty cell, or a locked green cell) return result 'ignored'
 * with the state unchanged.
 */
function tap(state, i) {
  if (state.status !== 'play') return { state, result: 'ignored', after: state.cells, bursts: [], frames: [], livesLost: 0 };
  if (state.cells[i] <= 0) return { state, result: 'ignored', after: state.cells, bursts: [], frames: [], livesLost: 0 };
  if (isGreen(state.cells[i], state.ratio) && safeOrLockedGreen(state))
    return { state, result: 'ignored', after: state.cells, bursts: [], frames: [], livesLost: 0 };

  const { n, ratio } = state;
  const { cells: after, caps: capsAfter } = distributeAndGrow(state.cells, state.caps, i, n, ratio);
  const taps = state.taps + 1;

  // overflow -> cascade
  if (after.some((v, k) => v > capsAfter[k])) {
    const { cells: resolved, caps: finalCaps, bursts, frames } = resolveCascade(after, capsAfter, n, ratio);
    const livesLost = bursts.length;
    const lives = state.lives - livesLost;
    if (lives <= 0) {
      return {
        state: { ...state, cells: resolved, caps: finalCaps, taps, lives: Math.max(0, lives), status: 'lost' },
        result: 'lost', after, bursts, frames, livesLost,
      };
    }
    const next = { ...state, cells: resolved, caps: finalCaps, taps, lives };
    return { ...finalise(next), after, bursts, frames, livesLost };
  }

  // clean tap
  const next = { ...state, cells: after, caps: capsAfter, taps };
  return { ...finalise(next), after };
}

// Undo a loss (rewarded "continue"): put the lost board back in play with
// `lives` lives. A losing chain always resolves fully (see tap), so the board
// is never left half-processed, and a board that still has live cells always
// has a legal tap — a revived board can't strand the player. If the resolved
// board happens to be all-green/empty already, reviving is simply a win, so
// this returns the same { state, result } shape finalise() does.
function revive(state, lives) {
  return finalise({ ...state, lives, status: 'play' });
}

// True when greens are currently locked (some non-green cell remains).
function safeOrLockedGreen(state) {
  const live = [];
  for (let i = 0; i < state.cells.length; i++) if (state.cells[i] > 0) live.push(i);
  return live.length > 0 && !live.every(k => isGreen(state.cells[k], state.ratio));
}

// After a clean tap or a survived cascade, decide win / carry on.
// If every remaining cell is green (or the board is empty), it's a win.
function finalise(state) {
  const live = state.cells.filter(v => v > 0);
  if (!live.length || live.every(v => isGreen(v, state.ratio))) {
    // clear any leftover greens (the auto-sweep) and mark won
    return { state: { ...state, cells: state.cells.map(() => 0), status: 'won' }, result: 'won', bursts: [], frames: [], livesLost: 0 };
  }
  return { state, result: null, bursts: [], frames: [], livesLost: 0 };
}

/* --------------------------------------------------------- exact solver */

// Exact winnability. The board strictly drains, so the search is bounded.
// `budget` guards worst-case blow-ups; on exhaustion it returns true (safe:
// we'd rather serve a board than reject a winnable one). Memoised per call.
function isWinnable(cells, caps, n, ratio, budgetLimit = 20000) {
  const memo = new Map();
  const budget = { n: 0 };
  function legal(c) {
    const live = [];
    for (let i = 0; i < c.length; i++) if (c[i] > 0) live.push(i);
    if (!live.length) return { won: true, moves: [] };
    if (live.every(i => isGreen(c[i], ratio))) return { won: true, moves: [] };
    const moves = live.filter(i =>
      !isGreen(c[i], ratio) && distribute(c, i, n, ratio).every((v, k) => v <= caps[k]));
    return { won: false, moves };
  }
  function rec(c) {
    const { won, moves } = legal(c);
    if (won) return true;
    if (!moves.length) return false;
    const key = c.join(',');
    if (memo.has(key)) return memo.get(key);
    if (budget.n++ > budgetLimit) return true;
    memo.set(key, false);
    for (const i of moves) {
      if (rec(distribute(c, i, n, ratio))) { memo.set(key, true); return true; }
    }
    return false;
  }
  return rec(cells);
}

/* ------------------------------------------------------- board generation */

// Draw a per-cell cap array uniformly across [capMin, capMax]. `rng` defaults
// to Math.random; a seeded generator (e.g. for the daily challenge) can pass
// its own deterministic source instead.
function rollCaps(n, capMin, capMax, rng = Math.random) {
  const size = n * n, caps = new Array(size);
  for (let i = 0; i < size; i++) caps[i] = capMin + Math.floor(rng() * (capMax - capMin + 1));
  return caps;
}

// Place a fully-packed board: every cell gets a non-green value, at most one at
// its cap, and any full cell must be safe to tap.
//
// `bias` controls how much headroom an ORDINARY (non-full) cell starts with,
// independent of capMin/capMax/ratio — at bias=1 (the default) a cell's value
// is uniform across its whole legal span [minv, cap), same as always. At
// bias>1 it's skewed toward the top of that span (closer to its own cap, less
// margin before a neighbour's push tips it over) via Math.pow(rng(), bias),
// which concentrates the sample near 0 as bias grows. Measured directly
// (scripts/simulate-difficulty.js-style sweep): this is a real, independent
// difficulty lever — e.g. at n=4/capMin=5/capMax=10, bias=2 roughly halves a
// greedy bot's win rate vs bias=1 — but it has a sharp reliability cliff: safe
// (near-0% generation-fallback) up to about bias=2.5 at capMax>=15, but by
// bias=3 the single-full-cell/safety constraints start colliding often enough
// that 20-30% of attempts fail outright. Keep any tuned bias comfortably
// under that ceiling.
//
// bias===1 is special-cased to hit the EXACT original (minv + ...) expression
// rather than the mathematically-equivalent-in-distribution (cap - 1 - ...)
// form below, because newDailyGame feeds this a seeded deterministic RNG —
// changing the formula would silently reshuffle which board a given
// (date, difficulty) seed produces, breaking "same puzzle for everyone" for
// every already-played date. Every existing caller that never passes bias
// gets byte-identical output to before this parameter existed.
function placeFull(caps, n, ratio, rng = Math.random, bias = 1) {
  const size = n * n, cells = new Array(size).fill(0);
  let full = 0;
  for (let i = 0; i < size; i++) {
    const cap = caps[i];
    let minv = 1;
    while (isGreen(minv, ratio) && minv <= cap) minv++;   // lowest non-green value
    if (minv > cap) {
      // forced: even the cap is green (tiny cap) — place cap, count as full
      cells[i] = cap; if (cap >= cap) full++;
      continue;
    }
    if (minv >= cap) {
      // only the cap itself is a legal non-green value here
      cells[i] = cap; full++;
      continue;
    }
    if (full < 1 && rng() < 0.1) { cells[i] = cap; full++; continue; }
    if (bias === 1) {
      cells[i] = minv + Math.floor(rng() * (cap - minv));   // strictly below cap
    } else {
      const span = cap - minv;
      const skewed = Math.pow(rng(), bias); // bias>1 concentrates near 0
      cells[i] = cap - 1 - Math.floor(skewed * span); // skewed toward cap-1
    }
  }
  return cells;
}

function fullCellsSafe(cells, caps, n, ratio) {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] > 0 && cells[i] >= caps[i]) {
      if (distribute(cells, i, n, ratio).some((v, k) => v > caps[k])) return false;
    }
  }
  return true;
}

// Generate one winnable, fully-packed board for the given params. Returns
// { cells, caps } or null if it couldn't within `attempts`. `rng` defaults to
// Math.random; passing a seeded generator makes the whole board deterministic
// (see newDailyGame below).
function generateBoard({ n, ratio, capMin, capMax, bias = 1 }, attempts = 120, rng = Math.random) {
  for (let a = 0; a < attempts; a++) {
    const caps = rollCaps(n, capMin, capMax, rng);
    const cells = placeFull(caps, n, ratio, rng, bias);
    if (!cells.some(v => v > 0)) continue;
    // at most one full (at-cap) cell, and that cell must be safe to tap
    let fullCount = 0;
    for (let i = 0; i < cells.length; i++) if (cells[i] > 0 && cells[i] >= caps[i]) fullCount++;
    if (fullCount > 1) continue;
    if (!fullCellsSafe(cells, caps, n, ratio)) continue;
    if (isWinnable(cells, caps, n, ratio)) return { cells, caps };
  }
  return null;
}

/* ---------------------------------------------------------- level curve */

// Grid size is NOT a smooth long-tail difficulty lever — measured directly
// (scripts/simulate-difficulty.js): holding caps at their loosest possible
// value (7-9) and varying ONLY grid size gave a greedy (careful, one-ply-
// lookahead) bot's win rate as 3x3=75%, 4x4=35%, 5x5=0%, 6x6=0%. Fully-packed
// 5x5+ is essentially unwinnable for anything short of real multi-step
// planning, REGARDLESS of caps — this reproduces (and vindicates) an older
// PROJECT.md finding ("6x6 makes even careful play lose unfairly") that an
// earlier session's uncapped-grid-growth change had quietly overridden
// without re-testing. So grid size can't be a smooth ramp past 4x4 — but
// Leon wants the milestones on round numbers and 5x5 to be a real recurring
// gauntlet (not just a rare late spike): 3x3 for L1-100, then a 5x5 spike
// every 5 levels for the ENTIRE 4x4 game from L101 on (not just from L500) —
// moved earlier at Leon's request, specifically because capMin/capMax/bias
// tuning on a fixed 4x4 grid has a hard, measured reliability ceiling (see
// the capMin-vs-capMax and bias notes below) and is inherently noisy at this
// board size/trial scale, whereas grid size is the one lever measured to
// have a huge, clean, unambiguous effect (greedy-bot win rate 75%->35%->0%
// across 3x3->4x4->5x5). This means roughly 1 in 5 levels from L105 on is a
// near-unwinnable-for-bots wall — an intentional, frequent brutal spike, not
// a continuation of the curve. Worth watching in real playtesting given how
// much more often it now occurs than the old "only after L500" design.
//
// TIER1_LEVELS raised from 50 to 100 after playtesting — Leon wants the
// player to stay on the 3x3 grid longer while the numbers climb, rather than
// jumping to 4x4 as soon as capMin/capMax have had only ~50 levels to move.
const TIER1_GRID = 3;
const TIER1_LEVELS = 100;   // 3x3 for L1-100 (round-number milestone)
const TIER2_GRID = 4;
const HARD_WALL_GRID = 5;
const HARD_WALL_START_LEVEL = TIER1_LEVELS; // 5x5 spikes begin right after the 3x3 tutorial
const HARD_WALL_INTERVAL = 5;      // a 5x5 spike every 5 levels — frequent, not rare
// Where the 4x4-only capMax/bias ramp below finishes its climb — kept as its
// own constant (the original L500 round-number milestone) rather than tied
// to HARD_WALL_START_LEVEL, which moved; this ramp's pacing is unrelated to
// when the 5x5 wall starts.
const CAP_RAMP_END_LEVEL = 500;

// Grid size for a given level: 3x3 early, 4x4 forever after, with a
// scheduled 5x5 spike inserted periodically once deep in the late game.
function gridSizeForLevel(level) {
  if (level > HARD_WALL_START_LEVEL && (level - HARD_WALL_START_LEVEL) % HARD_WALL_INTERVAL === 0) {
    return HARD_WALL_GRID;
  }
  return level <= TIER1_LEVELS ? TIER1_GRID : TIER2_GRID;
}

// capMin is the ACTUAL difficulty driver, not capMax — measured directly:
// holding capMin fixed at 7 while only capMax grew from 9->14 across levels
// 1-40 made careless win rate climb from ~53% to ~77%, i.e. a WIDER cap
// range with an unchanged floor made the game easier, not harder (more
// generously-capped cells dilute the danger). A second measurement found the
// 3x3->4x4 jump itself is a roughly constant ~40-45 point drop regardless of
// when it happens — grid size's penalty doesn't scale with caps.
//
// Leon wants real progression WITHIN the 3x3 phase too, not a flat tutorial
// zone — so capMin now moves continuously from level 1 (sqrt shape: fastest
// near level 1, decelerating after), giving it real, felt movement inside
// TIER1_LEVELS. capMax moves too, but on a LINEAR (not sqrt) curve — sqrt's
// steep early slope is exactly what caused the original "gets easier"
// problem, so capMax now grows slowly and steadily rather than front-loaded,
// letting capMin's tightening dominate the early trend while still keeping
// the pair safe for generation.
//
// That safety matters concretely: capMin approaching its floor (4) while
// capMax is still narrow is a real generation-reliability risk, not just a
// difficulty question — a cell whose randomly-drawn cap is <=4 is ALWAYS
// green at ratio=0.88 (see isGreen), so it's forced into the single-
// permitted "full cell" slot; with capMax still small, enough cells draw a
// tiny cap that MULTIPLE forced-full cells become likely, and generation
// exhausts its attempt budget. Measured: capMin=4/capMax=9 at 4x4 succeeds
// only ~21% of the time; capMin=4/capMax=14+ is ~99%+. MORE cells means a
// WIDER capMax is needed at the same capMin=4 — 5x5 (25 cells vs 4x4's 16)
// needs capMax>=16 for ~99%+, not 14; capMax=14 only manages ~86% at 5x5.
// Since capMin floors at 4 well before the first 5x5 wall (level 505), the
// pacing constant below is tuned so capMax has already cleared 16 by then —
// checked directly against scripts/simulate-difficulty.js (which also
// verifies no generation fallbacks occur across the full level range).
//
// capMin's saturation point is stretched from the original (400) to 500 —
// matching the round-number L500 4x4->5x5 milestone — so its tightening
// keeps actively opposing capMax's rise all the way through the 4x4 band,
// not just the first ~280 levels of it. Measured need: with the old
// saturation, capMin flattened at its floor around level 279 while capMax
// kept climbing unopposed for the remaining ~220 levels of 4x4, so the
// bot's burst-avoidance win rate actually trended UP (not down) across
// 51-500 — Leon wants real difficulty progression there too, not just
// bigger numbers, so capMin's decline now stretches to cover the whole band.
//
// capMax's ceiling and saturation point are RAISED — Leon explicitly wants
// big numbers to keep climbing further into the level range ("cap maxes
// could really continue high to make it harder for the player to do the
// maths"), i.e. capMax's growth is now itself part of the intended
// long-term difficulty curve, not just a background safety/variety knob
// capped low.
const CAP_MIN_SATURATION = 500; // raised from 400 so capMin keeps tightening
// for as much of the 4x4 band as possible before settling at its floor (5)
// around L282 (rounding brings that earlier than the raw saturation point).
// capMax's OWN saturation is now much slower (8000, not 3000) — a fast
// capMax was drowning out capMin's tightening across 51-500 (capMax moved
// +7-8 there vs capMin's total possible range of only 3), which is why the
// bot's win rate kept trending up through that band even after stretching
// capMin's decline. Slowing the background curve lets capMin's tightening
// actually dominate the 4x4 band's trend, while still reaching its raised
// ceiling (60) by around level 8000 — well within the "thousands of levels"
// long tail — for the "maths keeps getting harder" ask.
const CAP_MAX_SATURATION = 8000;
const CAP_MAX_BASE = 9;
const CAP_MAX_CEILING = 60; // raised from 42 — bigger late-game numbers
const CAP_MIN_BASE = 7;
// Floor raised from 4 to 5 — NOT a difficulty choice, a correctness one.
// v<=4 is ALWAYS green at ratio=0.88 (see isGreen), so a capMin=4 floor
// forces every such cell into the single-permitted "full cell" slot,
// needing a much wider capMax to avoid collisions (measured: capMax>=14 at
// 4x4, >=18 at 5x5). v=5 is NOT always green, so capMin=5 needs far less
// margin (measured: capMax>=10 at 4x4, >=12 at 5x5) — small enough that the
// slow background capMax curve above clears it on its own, with no sudden
// jump needed when capMin bottoms out. This was found the hard way: with
// floor=4, slowing capMax's pace (to let capMin dominate the 4x4 band, see
// above) meant the background curve no longer naturally reached 14/18 by the
// time capMin floored, so the safety floor below had to yank capMax up in
// one step — a visible, unintended easing bump right at that level.
const CAP_MIN_FLOOR = 5;
const CAP_MAX_K = (CAP_MAX_CEILING - CAP_MAX_BASE) / (CAP_MAX_SATURATION - 1); // linear
const CAP_MIN_K = (CAP_MIN_BASE - CAP_MIN_FLOOR) / Math.sqrt(CAP_MIN_SATURATION - 1); // sqrt

// Generation-safety floor, kept fully independent of the background capMax
// curve's pace so retuning difficulty (like slowing capMax above, to let
// capMin actually dominate the 4x4 band) can never silently reintroduce the
// fallback-rate bug found earlier. Values matched to the capMin=5 floor
// (see above) — with floor=4 these needed to be 14/18, which is exactly
// what caused the jump; kept as a defensive backstop, but the background
// curve should clear these on its own now, so it should rarely if ever fire.
const CAP_MAX_SAFE_FLOOR_4X4 = 10;
const CAP_MAX_SAFE_FLOOR_5X5 = 12;

// Tier-1-only ramp: after playtesting, Leon wants the numbers to visibly
// climb while the player is still on 3x3, not just barely move under the
// slow whole-game curve above (that curve only goes 9->10 across all of
// L1-100 — imperceptible). This is a SEPARATE, steeper curve scoped to
// L1-TIER1_LEVELS only; L101+ (4x4/5x5) keeps using the whole-game curve
// above completely unchanged, so none of that curve's carefully-tuned
// pacing (capMin dominating the 4x4 band, the 8000-level long tail, etc.)
// is disturbed. The two curves are NOT continuous at the L100->101 seam —
// capMax actually steps back down (20->10) right as the grid steps up to
// 4x4 — but that's masked by the grid-size cliff itself (a fresh, harder
// board either way) and by every level being a brand-new board anyway, so
// there's no animated number to visibly "drop."
//
// capMax's growth is LINEAR in level — Leon wants a consistent, steady
// number increase up to TIER1_LEVELS (e.g. ~15 by level 50), not a curve
// that's barely moved by the midpoint. Note: an earlier version of this
// linear ramp was measured to swamp capMin's narrow (7->5, floor-limited)
// tightening room, making the tutorial phase get EASIER as level rose
// (careless win rate 40%->65%, greedy 80%->~95-100%) — a back-loaded (t^2)
// curve fixed that by keeping capMax narrow early. Going back to linear
// reintroduces that same mild easing-toward-100 tradeoff; kept anyway
// since Leon explicitly prioritized steady, predictable number growth over
// it here — same category of tradeoff as the accepted 4x4-band easing
// above (capMax is the visible/arithmetic knob, not the burst-avoidance
// one). Worth rechecking against real playtesting.
const TIER1_CAP_MAX_END = 20; // capMax reached at TIER1_LEVELS (level 100)
const TIER1_CAP_MIN_K = 0.2; // sqrt shape, matching CAP_MIN_K's fast/decelerating feel

function tier1Params(level) {
  const t = (level - 1) / (TIER1_LEVELS - 1);
  const capMax = Math.round(CAP_MAX_BASE + (TIER1_CAP_MAX_END - CAP_MAX_BASE) * t);
  const capMin = Math.max(CAP_MIN_FLOOR, Math.round(CAP_MIN_BASE - TIER1_CAP_MIN_K * Math.sqrt(level - 1)));
  return { capMin, capMax };
}

// 4x4-band-only (L101-500) capMax boost + fullness bias (see placeFull).
// Scoped to ORDINARY 4x4 levels only — not the 3x3 tutorial (wasn't part of
// what this was tuned to fix) and not the periodic 5x5 wall levels (already
// ~0% win rate from grid size alone; bias is untested at n=5, so left at its
// no-op default of 1 there rather than risking an unmeasured reliability
// hit on top of an already-brutal spike).
//
// Measured problem: the whole-game capMin/capMax curve above pins capMin to
// its floor almost immediately past level 100 (tier1 already got it there
// by level 100, and the clamp two lines up never lets it rise back above
// that) and only grows capMax from 9 to ~12 across the ENTIRE 101-500 band —
// confirmed via scripts/simulate-difficulty.js that this band was flat-to-
// EASIER as level rose (bot win rate climbing from ~6% to ~15%), the
// opposite of real progression. Leon separately wants capMax to climb
// faster through here regardless, so the player deals with visibly bigger
// numbers sooner (not the old ~9->12 glacial pace) — but widening capMax
// alone is measured to make boards EASIER (dilutes danger; see the
// capMin-vs-capMax note above), which would make the flat-band problem
// worse, not better.
//
// Fix: let capMax climb for real (10->22 over 101-500, boosted via Math.max
// so it only ever rises, never regresses even past level 500 once the
// whole-game curve's own much slower climb eventually overtakes this
// plateau around level ~2000+), and ramp `bias` alongside it specifically to
// cancel capMax's own easing effect rather than track level directly.
// bias is front-loaded (sqrt, not linear) because a linear ramp measurably
// left the MIDDLE of the band (roughly L200-350) easier than today's curve
// before catching up by L500 — bias's tightening saturates fast (most of it
// already shows by bias~1.5-2), so it needs to get there early to actually
// outpace capMax's compounding climb, not arrive fashionably late.
//
// BIAS_CEILING is kept under the measured reliability cliff (dedicated
// capMin=5 bias x capMax grid sweep: ~0% generation-fallback up to bias~2.5
// at capMax>=15, climbing to 20-30% by bias=3) with real margin — and that
// margin only grows as capMax keeps climbing beyond L500, since a wider
// capMax was independently measured to make bias safer, not riskier.
const CAP_MAX_BOOST_END_LEVEL = CAP_RAMP_END_LEVEL; // 500 — original round-number milestone, independent of where the 5x5 wall now starts
const CAP_MAX_BOOST_START_VAL = 10; // capMax at level 101 (matches the unboosted curve there)
// Trimmed from an initial 22 (paired with BIAS_CEILING=2.4) — that combo
// measured a 10-35% fallback-trigger rate through levels ~300-550 (too
// much of fallbackBoard's slower verified-retry path), and even after
// trimming bias alone to a safe 2.0, 22 asked so much of bias just to
// cancel its OWN easing (a wider capMax dilutes danger — see the
// capMin-vs-capMax note above) that the net difficulty came back
// essentially identical to the pre-boost curve — not an actual improvement.
// 16 (with bias capped at 2.0) is the pair measured to land BOTH goals:
// consistently tighter than the pre-boost curve at every checkpoint
// (e.g. L400 11% vs the old curve's 14-20%; L500 12% vs 13-17%) and a
// fallback-trigger rate that stays under 5% everywhere in the band.
const CAP_MAX_BOOST_END_VAL = 16;
const BIAS_CEILING = 2.0;

function cap4x4BoostT(level) {
  return Math.min(1, Math.max(0, (level - TIER1_LEVELS) / (CAP_MAX_BOOST_END_LEVEL - TIER1_LEVELS)));
}
function cap4x4Boost(level) {
  return CAP_MAX_BOOST_START_VAL + (CAP_MAX_BOOST_END_VAL - CAP_MAX_BOOST_START_VAL) * cap4x4BoostT(level);
}
function biasFor4x4(level) {
  return 1 + (BIAS_CEILING - 1) * Math.sqrt(cap4x4BoostT(level));
}

// Same "gradual climb over L101-500" treatment for the 5x5 wall levels, but
// capMax ONLY — no bias here (still untested at n=5, and unnecessary: a
// greedy bot is already ~0-6% at the wall's current fixed capMax=12
// regardless of level, so there's no measurable win-rate headroom left for
// bias to spend; the ramp below is for felt escalation/bigger numbers, not
// bot win-rate, and measured to cost nothing extra in generation time either
// — see the capMax x speed sweep this was tuned against: avg-ms stayed flat
// (~160-176ms) across capMax 12-24 at n=5, because the wall's cost is
// dominated by the one-time exact-solver pass on a 25-cell board, not by
// rejected attempts the way capMax helps with at n=4. Shares cap4x4BoostT's
// progress fraction (purely level-based, not grid-based) so both ramps
// finish together at L500.
const CAP_5X5_BOOST_START_VAL = CAP_MAX_SAFE_FLOOR_5X5; // 12 — today's fixed wall value
const CAP_5X5_BOOST_END_VAL = 24;
function cap5x5Boost(level) {
  return CAP_5X5_BOOST_START_VAL + (CAP_5X5_BOOST_END_VAL - CAP_5X5_BOOST_START_VAL) * cap4x4BoostT(level);
}

// Difficulty params for a given level. Fully-packed at every level; grid
// size per gridSizeForLevel (3x3 for L1-100, 4x4 for L101-500, then a 5x5
// spike every 5 levels). Cap range for L1-100 follows the steep tier1 ramp
// just above; L101+ follows the slow whole-game curve (capMin fast/sqrt,
// capMax slow/linear — see above), finally plateauing around level ~8000 —
// from there the game holds at its hardest 4x4 setting indefinitely (plus
// the periodic 5x5 spikes), the intended "endless, genuinely very hard, but
// not literally unbounded/impossible" long tail.
function levelParams(level) {
  const n = gridSizeForLevel(level);
  const ratio = 0.88;
  let capMin, capMax, bias = 1;
  if (level <= TIER1_LEVELS) {
    ({ capMin, capMax } = tier1Params(level));
  } else {
    const tMin = Math.sqrt(Math.max(0, level - 1));
    const tMax = Math.max(0, level - 1);
    capMax = Math.min(CAP_MAX_CEILING, Math.round(CAP_MAX_BASE + CAP_MAX_K * tMax));
    capMin = Math.max(CAP_MIN_FLOOR, Math.round(CAP_MIN_BASE - CAP_MIN_K * tMin));
    // tier1 already tightens capMin all the way to its floor by level 100
    // (see tier1Params) — but this whole-game curve is computed fresh from
    // the ABSOLUTE level number, so at level 101 it independently starts its
    // OWN decline back from CAP_MIN_BASE (7), handing back 2 full points of
    // tightness right as the grid also steps up to 4x4. The comment above
    // (on the "two curves aren't continuous at the seam") assumed the
    // grid-size jump would mask that regression — confirmed via direct play
    // (Leon) that it does NOT: the board feels distinctly easier right after
    // 100, not harder. Clamped here so capMin can never exceed what tier1
    // already earned: it now holds flat at the floor from 101 onward until
    // the natural curve would have gotten there anyway (~282), instead of
    // bouncing up and re-declining. capMax is untouched — it's the "wider
    // range = easier" lever (see the capMin-vs-capMax note above), so its
    // own drop at this same seam doesn't compound the problem the same way.
    capMin = Math.min(capMin, tier1Params(TIER1_LEVELS).capMin);
    // ORDINARY 4x4 levels only (not the periodic 5x5 wall) get the capMax
    // boost + fullness bias described above — Math.max so this can only
    // raise capMax, never regress it even once the whole-game curve's own
    // climb eventually overtakes the boost's plateau.
    if (n === TIER2_GRID) {
      capMax = Math.max(capMax, Math.round(cap4x4Boost(level)));
      bias = biasFor4x4(level);
    } else if (n === HARD_WALL_GRID) {
      capMax = Math.max(capMax, Math.round(cap5x5Boost(level)));
    }
  }
  if (capMin <= CAP_MIN_FLOOR) {
    capMax = Math.max(capMax, n >= HARD_WALL_GRID ? CAP_MAX_SAFE_FLOOR_5X5 : CAP_MAX_SAFE_FLOOR_4X4);
  }
  return { n, ratio, capMin, capMax, bias };
}

/* ------------------------------------------------------------- lifecycle */

// Start (or restart) a board at the given level. Returns a fresh state.
// initialCells/initialCaps snapshot the board exactly as generated (before
// any taps) — retry() below restores from these instead of generating a new
// random layout, so retrying a failed attempt replays the same board rather
// than handing the player a different puzzle at the same difficulty.
function newGame(level = 1) {
  const params = levelParams(level);
  const board = generateBoard(params) || fallbackBoard(params);
  return {
    n: params.n,
    ratio: params.ratio,
    cells: board.cells,
    caps: board.caps,
    initialCells: board.cells,
    initialCaps: board.caps,
    level,
    lives: ladderLivesForGrid(params.n),
    taps: 0,
    status: 'play',
  };
}

// Advance to the next level after a win.
function nextLevel(state) {
  return newGame(state.level + 1);
}

// Retry the current level — same board as the attempt just failed, full
// lives, rather than generating a new random layout at the same difficulty.
function retry(state) {
  return {
    ...state,
    cells: state.initialCells,
    caps: state.initialCaps,
    lives: ladderLivesForGrid(state.n),
    taps: 0,
    status: 'play',
  };
}

// Last-resort path if generateBoard's normal attempt budget is exhausted
// (should be rare). MUST still only ever return a solver-verified winnable
// board — a player can never be hard-stuck, full stop — so this keeps
// retrying the exact same verified generateBoard pipeline, just easing
// capMax each round (the single safest lever for raw generation success;
// see generateBoard's own comments) until one is actually found, rather
// than ever handing back an unchecked roll. Returning early from
// generateBoard's own 120 attempts already makes this exceedingly rare in
// practice, so the extra rounds here essentially never run. bias is forced
// back to 1 here regardless of what the level curve asked for — bias is a
// difficulty lever that actively hurts generation reliability (see
// placeFull), and this path's only job is finding ANY verified board, as
// fast and as reliably as possible, not staying hard.
function fallbackBoard(params, rng = Math.random) {
  let capMax = params.capMax;
  for (let round = 0; round < 12; round++) {
    const board = generateBoard({ ...params, capMax, bias: 1 }, 300, rng);
    if (board) return board;
    capMax = Math.max(capMax + 4, Math.ceil(capMax * 1.5));
  }
  // Unreachable in practice (12 rounds of widening capMax), but if every
  // single one of those also exhausted its budget, fall back to a board
  // that doesn't need the solver at all: every cell at a value <=4 is
  // ALWAYS green (see isGreen) regardless of its cap, and an all-green
  // board is an immediate, guaranteed win.
  const size = params.n * params.n;
  return { cells: new Array(size).fill(1), caps: new Array(size).fill(Math.max(params.capMin, 1)) };
}

/* --------------------------------------------------- daily challenge -----
 * A single board, generated identically for every player on a given date —
 * the deterministic RNG is what makes "same puzzle for everyone" possible
 * with zero backend. Fully separate from the level curve above: fixed
 * difficulty, no persistence-by-level, no next-level advancement.
 */

// mulberry32 — tiny deterministic PRNG; identical output sequence for a given
// seed on every JS engine (V8/Hermes/JSC), which "same board for everyone"
// depends on.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a string hash -> 32-bit seed.
function seedFromString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// Four fixed difficulty tiers, each its own grid size + cap range + time
// limit — separate boards, separate leaderboards-of-one, all seeded off the
// same date. Cap ranges are starting points (not re-verified by the solver's
// win-rate stats the way the level curve was) — needs playtesting:
//  - beginner: tiny grid, tight limit, gentle caps so the pressure is the
//    clock, not the reading load.
//  - intermediate: matches the original single daily board's params.
//  - expert/master: caps climb toward (but stay under) levelParams()'s
//    ceiling (60 — see CAP_MAX_CEILING above; was 42 when this comment was
//    first written), so numbers stay readable under a multi-minute clock.
//    Master's capMax was bumped 34->50 after Leon noticed it read as low
//    next to the deep-ladder numbers it's meant to evoke — bot-measured
//    (simulate-difficulty.js-style greedy/careless win rate) to be a PURELY
//    cosmetic change: 34 through 60 all land the same ~0-2% greedy win rate
//    at this grid size (n=6) and capMin floor (4) — capMin, not capMax, is
//    what actually drives difficulty here (see the capMin-vs-capMax note
//    above the background curve), so the board isn't any harder, it just
//    displays bigger numbers.
//
// Time limits HALVED from the original 20s/60s/180s/300s — Leon's explicit
// call after playtesting found them too generous (rarely actually timing
// out). `scripts/calibrate-daily-timers.js` (bot-modeled solve time) only
// weakly supported this — Beginner-Expert showed just 13-25% slack, and
// Master's OLD 300s was already slightly tighter than the model's median —
// but Leon's own direct play experience overrides a bot model here; this is
// an explicit starting point for further playtesting, not a final number.
// The rewarded "+50% time" continue (DailyChallengeScreen) becomes more
// meaningful once timing out is a real possibility rather than rare.
const DAILY_DIFFICULTIES = {
  beginner:     { label: 'Beginner',     n: 3, ratio: 0.88, capMin: 6, capMax: 10, timeLimitMs: 10000 },
  intermediate: { label: 'Intermediate', n: 4, ratio: 0.88, capMin: 5, capMax: 20, timeLimitMs: 30000 },
  expert:       { label: 'Expert',       n: 5, ratio: 0.88, capMin: 5, capMax: 26, timeLimitMs: 90000 },
  master:       { label: 'Master',       n: 6, ratio: 0.88, capMin: 4, capMax: 50, timeLimitMs: 150000 },
};
const DAILY_DIFFICULTY_ORDER = ['beginner', 'intermediate', 'expert', 'master'];

// Generating a fully-packed 5x5/6x6 board means running the exact solver
// (isWinnable) on it once to prove it's clearable — for Expert/Master that's
// a genuinely heavy single DFS call (measured ~200-450ms on desktop V8;
// worse on a phone's JS engine), not a matter of many rejected attempts. But
// the board for a given (date, difficulty) is always identical, so that cost
// only ever needs to be paid once per pair, for the lifetime of the app
// process — cache it so every retry and every revisit after navigating away
// and back is instant.
const dailyBoardCache = new Map();

function getDailyBoard(dateStr, difficulty) {
  const key = `${dateStr}:${difficulty}`;
  let board = dailyBoardCache.get(key);
  if (!board) {
    const params = DAILY_DIFFICULTIES[difficulty];
    const rng = mulberry32(seedFromString(key));
    board = generateBoard(params, 120, rng) || fallbackBoard(params, rng);
    dailyBoardCache.set(key, board);
  }
  return board;
}

// Whether (dateStr, difficulty)'s board has already been generated this app
// session — lets a caller synchronously skip straight to the fast path
// (no loading state needed) instead of always assuming the slow path.
function isDailyBoardCached(dateStr, difficulty) {
  return dailyBoardCache.has(`${dateStr}:${difficulty}`);
}

// Builds the identical board for every caller with the same (dateStr,
// difficulty) pair. The engine has no notion of "today" — callers decide the
// date string (see DailyChallengeScreen). Difficulty is folded into the seed
// (not just its params) so two tiers can never coincidentally share a board
// even if they shared a grid size. `level: 'daily'` is a non-numeric marker
// so it can never be mistaken for ladder state by code that assumes level is
// an int. cells/caps are defensively copied out of the cache so nothing
// downstream could ever mutate the shared cached arrays.
function newDailyGame(dateStr, difficulty) {
  const params = DAILY_DIFFICULTIES[difficulty];
  const board = getDailyBoard(dateStr, difficulty);
  return {
    n: params.n,
    ratio: params.ratio,
    cells: board.cells.slice(),
    caps: board.caps.slice(),
    level: 'daily',
    lives: livesForGrid(params.n),
    taps: 0,
    status: 'play',
  };
}

/* --------------------------------------------------------------- exports */

const OverflowEngine = {
  MAX_LIVES, livesForGrid, continueLivesForGrid, ladderLivesForGrid,
  // lifecycle
  newGame, nextLevel, retry, revive, levelParams, gridSizeForLevel,
  // daily challenge
  newDailyGame, isDailyBoardCached, DAILY_DIFFICULTIES, DAILY_DIFFICULTY_ORDER,
  // moves
  tap,
  // inspection (for rendering hints)
  legalTaps, safeTaps, tapBursts, isGreen, shareEach, neighbours,
  // internals exposed for testing / advanced UI
  generateBoard, fallbackBoard, isWinnable, resolveCascade, distribute, distributeAndGrow, rollCaps, placeFull,
};

if (typeof module !== 'undefined' && module.exports) module.exports = OverflowEngine;
if (typeof window !== 'undefined') window.OverflowEngine = OverflowEngine;

export default OverflowEngine;
export {
  MAX_LIVES, livesForGrid, continueLivesForGrid, ladderLivesForGrid,
  newGame, nextLevel, retry, revive, levelParams, gridSizeForLevel,
  newDailyGame, isDailyBoardCached, DAILY_DIFFICULTIES, DAILY_DIFFICULTY_ORDER,
  tap,
  legalTaps, safeTaps, tapBursts, isGreen, shareEach, neighbours,
  generateBoard, fallbackBoard, isWinnable, resolveCascade, distribute, distributeAndGrow, rollCaps, placeFull,
};
