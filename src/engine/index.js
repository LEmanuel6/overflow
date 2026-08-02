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
const MAX_LIVES = 3;

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

// Draw a per-cell cap array uniformly across [capMin, capMax].
function rollCaps(n, capMin, capMax) {
  const size = n * n, caps = new Array(size);
  for (let i = 0; i < size; i++) caps[i] = capMin + Math.floor(Math.random() * (capMax - capMin + 1));
  return caps;
}

// Place a fully-packed board: every cell gets a non-green value, at most one at
// its cap, and any full cell must be safe to tap.
function placeFull(caps, n, ratio) {
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
    if (full < 1 && Math.random() < 0.1) { cells[i] = cap; full++; }
    else cells[i] = minv + Math.floor(Math.random() * (cap - minv));   // strictly below cap
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
// { cells, caps } or null if it couldn't within `attempts`.
function generateBoard({ n, ratio, capMin, capMax }, attempts = 120) {
  for (let a = 0; a < attempts; a++) {
    const caps = rollCaps(n, capMin, capMax);
    const cells = placeFull(caps, n, ratio);
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

const LEVELS_PER_GRID_TIER = 25;  // 3x3 for L1-25, 4x4 for L26-50, 5x5 for L51-75, ...
const CAP_STEP_LEVELS = 5;        // cap range only creeps every few levels, not every level

// Grid size for a given level. Fixed-length tiers, growing forever — 5x5
// (previously reached by level 10) now doesn't show up until level 51, so
// grid-size difficulty stays gentle for much longer. NOT yet re-verified with
// fresh playtesting/solver runs at the higher tiers (6x6+) — same caveat as
// before, just pushed further out.
function gridSizeForLevel(level) {
  return 3 + Math.floor((level - 1) / LEVELS_PER_GRID_TIER);
}

// Difficulty params for a given level. Fully-packed at every level; grid grows
// per gridSizeForLevel. The cap range steps in small jumps every
// CAP_STEP_LEVELS levels (a plateau-then-bump feel, not a continuous slide) —
// capMax climbs from 9 towards a ceiling of 42, capMin tightens from 7 down to
// a floor of 4. Both saturate well before a size tier ends, at which point
// grid size alone carries the difficulty ramp for the rest of that tier and
// beyond. Tuned so careless play fails throughout while a careful/planning
// player can clear; not re-verified against the new, much longer tiers.
function levelParams(level) {
  const n = gridSizeForLevel(level);
  const ratio = 0.88;
  const step = Math.floor((level - 1) / CAP_STEP_LEVELS);
  const capMax = Math.min(42, 9 + step * CAP_STEP_LEVELS);
  const capMin = Math.max(4, 7 - Math.floor(level / 8));
  return { n, ratio, capMin, capMax };
}

/* ------------------------------------------------------------- lifecycle */

// Start (or restart) a board at the given level. Returns a fresh state.
function newGame(level = 1) {
  const params = levelParams(level);
  const board = generateBoard(params) || fallbackBoard(params);
  return {
    n: params.n,
    ratio: params.ratio,
    cells: board.cells,
    caps: board.caps,
    level,
    lives: MAX_LIVES,
    taps: 0,
    status: 'play',
  };
}

// Advance to the next level after a win.
function nextLevel(state) {
  return newGame(state.level + 1);
}

// Retry the current level (fresh board, same difficulty, full lives).
function retry(state) {
  return newGame(state.level);
}

// Last-resort board if generation fails (should be rare): a small safe board.
function fallbackBoard(params) {
  const caps = rollCaps(params.n, params.capMin, params.capMax);
  const cells = placeFull(caps, params.n, params.ratio);
  return { cells, caps };
}

/* --------------------------------------------------------------- exports */

const OverflowEngine = {
  MAX_LIVES,
  // lifecycle
  newGame, nextLevel, retry, levelParams, gridSizeForLevel,
  // moves
  tap,
  // inspection (for rendering hints)
  legalTaps, safeTaps, tapBursts, isGreen, shareEach, neighbours,
  // internals exposed for testing / advanced UI
  generateBoard, isWinnable, resolveCascade, distribute, distributeAndGrow, rollCaps, placeFull,
};

if (typeof module !== 'undefined' && module.exports) module.exports = OverflowEngine;
if (typeof window !== 'undefined') window.OverflowEngine = OverflowEngine;

export default OverflowEngine;
export {
  MAX_LIVES,
  newGame, nextLevel, retry, levelParams, gridSizeForLevel,
  tap,
  legalTaps, safeTaps, tapBursts, isGreen, shareEach, neighbours,
  generateBoard, isWinnable, resolveCascade, distribute, distributeAndGrow, rollCaps, placeFull,
};
