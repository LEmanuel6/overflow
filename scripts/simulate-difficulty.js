/*
 * Difficulty-curve simulator — measures win rate by level for two bot
 * skill tiers, using the real engine (same generation + solve-verification
 * every real board goes through). Run with: node scripts/simulate-difficulty.js
 *
 * Why two bots, not three: every generated board is solver-verified
 * winnable by construction, so a "perfect planner" bot wins 100% by
 * definition — not informative about difficulty feel. The two tiers that
 * ARE informative:
 *   - careless: taps a uniformly random legal cell, no lookahead at all.
 *   - greedy:   prefers a zero-burst ("safe") move if one exists; if none
 *               do, one-ply-lookahead picks whichever legal move loses the
 *               fewest lives. A stand-in for "careful but not a deep planner."
 *
 * Both bots play the SAME generated board per trial (not independently
 * sampled boards) — halves generation cost and is a fairer comparison.
 *
 * Tune CHECKPOINTS / TRIALS_* below to change coverage vs runtime.
 */
'use strict';
const E = require('../src/engine/index.js');

// --- bots --------------------------------------------------------------

function carelessMove(state, legal) {
  const i = legal[Math.floor(Math.random() * legal.length)];
  return { i, res: E.tap(state, i) };
}

function greedyMove(state, legal) {
  const safe = legal.filter((i) => !E.tapBursts(state, i));
  const candidates = safe.length ? safe : legal;
  if (safe.length) {
    const i = candidates[Math.floor(Math.random() * candidates.length)];
    return { i, res: E.tap(state, i) };
  }
  // no safe move exists — 1-ply lookahead: minimise lives lost this tap
  let best = [], bestLoss = Infinity;
  for (const i of candidates) {
    const res = E.tap(state, i);
    const loss = res.livesLost || 0;
    if (loss < bestLoss) { bestLoss = loss; best = [{ i, res }]; }
    else if (loss === bestLoss) best.push({ i, res });
  }
  return best[Math.floor(Math.random() * best.length)];
}

// Plays one board to completion (won/lost) with the given bot. Guarded
// against infinite loops, though the board strictly drains so this
// shouldn't ever be needed in practice.
function playOut(initialState, moveFn) {
  let state = initialState;
  let guard = 0;
  while (state.status === 'play' && guard++ < 5000) {
    const legal = E.legalTaps(state);
    if (!legal.length) return 'won'; // all remaining cells green — implicit win
    const move = moveFn(state, legal);
    state = move.res.state;
  }
  return state.status;
}

// Mirrors newGame(level)'s exact generation logic (generateBoard, falling
// back to fallbackBoard only if that fails) but — unlike newGame — reports
// whether the fallback path was actually used. A rising fallback rate is a
// real CORRECTNESS signal (fallbackBoard is unverified — could hand out an
// unwinnable board), not just a difficulty one, so it's tracked alongside
// win rate rather than checked separately.
function newGameTracked(level) {
  const params = E.levelParams(level);
  const board = E.generateBoard(params);
  const fellBack = !board;
  const finalBoard = board || E.fallbackBoard(params);
  const state = {
    n: params.n, ratio: params.ratio, cells: finalBoard.cells, caps: finalBoard.caps,
    level, lives: E.MAX_LIVES, taps: 0, status: 'play',
  };
  return { state, fellBack };
}

function simulateLevel(level, trials) {
  let carelessWins = 0, greedyWins = 0, fallbacks = 0;
  for (let t = 0; t < trials; t++) {
    const { state: initial, fellBack } = newGameTracked(level);
    if (fellBack) fallbacks++;
    if (playOut(initial, carelessMove) === 'won') carelessWins++;
    if (playOut(initial, greedyMove) === 'won') greedyWins++;
  }
  return { careless: carelessWins / trials, greedy: greedyWins / trials, fallbackRate: fallbacks / trials };
}

// --- checkpoints ---------------------------------------------------------
// Dense early (the "gentle start, quick ramp" zone under scrutiny), coarser
// as levels climb into the cap-range-tightening and then the flat-plateau
// phases, where the curve changes much more slowly.

function range(start, end, step) {
  const out = [];
  for (let l = start; l <= end; l += step) out.push(l);
  return out;
}

// NOTE: step sizes below deliberately avoid being multiples of the engine's
// HARD_WALL_INTERVAL (5) past HARD_WALL_START_LEVEL (500) — a multiple-of-5
// step would land on the SAME wall/non-wall phase every time, silently
// making the tail data look uniformly better or worse than it actually is.
// 197/213 aren't multiples of 5, so they drift across the wall schedule and
// sample a representative mix of both. Dense around the two round-number
// milestones (50, 500) to see the transitions up close.
const CHECKPOINTS = [
  ...range(1, 30, 1),
  ...range(35, 115, 1),
  ...range(120, 150, 5),
  ...range(160, 490, 20),
  ...range(495, 560, 1),
  ...range(570, 1600, 197),
  ...range(1700, 3000, 213),
];

function trialsFor(level) {
  return level <= 100 ? 30 : 20; // smaller/cheaper grids get more trials
}

// --- run + report ----------------------------------------------------------

console.log('level  grid  capMin-capMax  careless%  greedy%  fallback%');
console.log('-----  ----  -------------  ---------  -------  ---------');

const startedAt = Date.now();
let lastN = null, lastCapMin = null, lastCapMax = null;
let worstFallback = { level: null, rate: 0 };
for (const level of CHECKPOINTS) {
  const trials = trialsFor(level);
  const { n, capMin, capMax } = E.levelParams(level);
  const { careless, greedy, fallbackRate } = simulateLevel(level, trials);
  if (fallbackRate > worstFallback.rate) worstFallback = { level, rate: fallbackRate };

  const paramsChanged = n !== lastN || capMin !== lastCapMin || capMax !== lastCapMax;
  lastN = n; lastCapMin = capMin; lastCapMax = capMax;

  console.log(
    String(level).padStart(5) + '  ' +
    (n + 'x' + n).padStart(4) + '  ' +
    (capMin + '-' + capMax).padStart(13) + '  ' +
    (Math.round(careless * 100) + '%').padStart(9) + '  ' +
    (Math.round(greedy * 100) + '%').padStart(7) + '  ' +
    (fallbackRate > 0 ? (Math.round(fallbackRate * 100) + '%').padStart(9) : ''.padStart(9)) +
    (paramsChanged ? '   <- params changed' : '')
  );
}

console.log(`\n${CHECKPOINTS.length} checkpoints, ${Math.round((Date.now() - startedAt) / 1000)}s total`);
if (worstFallback.rate > 0) {
  console.log(`WARNING: worst generation-fallback rate was ${Math.round(worstFallback.rate * 100)}% at level ${worstFallback.level} — an unverified (possibly unwinnable) board was served that often.`);
} else {
  console.log('No generation fallbacks observed at any sampled level — every board hit the solver-verified path.');
}
