/*
 * Daily Challenge timer calibration — estimates how long a careful (but not
 * deep-planning) human-like bot takes to clear each tier's board, as a
 * data-anchored starting point for timeLimitMs, rather than guessing blind
 * numbers. Run with: node scripts/calibrate-daily-timers.js
 *
 * Reuses the exact "greedy" bot from simulate-difficulty.js (prefers a
 * zero-burst move; falls back to 1-ply lookahead minimising lives lost) —
 * the better proxy of its two bots for an attentive real player, not a
 * careless one.
 *
 * Taps-to-clear -> seconds is the part that's a genuine ASSUMPTION, not
 * measured: each tap needs reading the board + deciding + tapping, and a
 * bigger grid means more area to scan even for the same move, so the
 * per-tap pace scales up with grid size below. These constants are a
 * starting estimate for Leon to sanity-check against his own real feel for
 * the game, not a measurement of real human pacing.
 */
'use strict';
const E = require('../src/engine/index.js');

const SEC_PER_TAP_BY_N = { 3: 2.0, 4: 2.5, 5: 3.5, 6: 4.5 };
const SAMPLES = 300;

function greedyMove(state, legal) {
  const safe = legal.filter((i) => !E.tapBursts(state, i));
  const candidates = safe.length ? safe : legal;
  if (safe.length) {
    const i = candidates[Math.floor(Math.random() * candidates.length)];
    return { i, res: E.tap(state, i) };
  }
  let best = [], bestLoss = Infinity;
  for (const i of candidates) {
    const res = E.tap(state, i);
    const loss = res.livesLost || 0;
    if (loss < bestLoss) { bestLoss = loss; best = [{ i, res }]; }
    else if (loss === bestLoss) best.push({ i, res });
  }
  return best[Math.floor(Math.random() * best.length)];
}

// Plays one board to completion, returning { status, taps }.
function playOut(initialState) {
  let state = initialState;
  let taps = 0;
  let guard = 0;
  while (state.status === 'play' && guard++ < 5000) {
    const legal = E.legalTaps(state);
    if (!legal.length) return { status: 'won', taps }; // all-green — implicit win
    const move = greedyMove(state, legal);
    state = move.res.state;
    taps++;
  }
  return { status: state.status, taps };
}

console.log('tier          n  samples  wins  avg-taps(wins)  p75-taps  sec/tap  est-median-s  current-limit-s');
for (const difficulty of E.DAILY_DIFFICULTY_ORDER) {
  const params = E.DAILY_DIFFICULTIES[difficulty];
  const secPerTap = SEC_PER_TAP_BY_N[params.n];
  const winTaps = [];
  let wins = 0;
  for (let i = 0; i < SAMPLES; i++) {
    // newDailyGame is deterministic per (dateStr, difficulty) — feed it
    // throwaway fake "dates" purely to sample varied boards at this tier's
    // params, not real calendar days.
    const g = E.newDailyGame(`calibration-sample-${i}`, difficulty);
    const { status, taps } = playOut(g);
    if (status === 'won') { wins++; winTaps.push(taps); }
  }
  winTaps.sort((a, b) => a - b);
  const avg = winTaps.reduce((a, b) => a + b, 0) / winTaps.length;
  const p75 = winTaps[Math.floor(winTaps.length * 0.75)];
  const estMedianS = Math.round((winTaps[Math.floor(winTaps.length * 0.5)] || avg) * secPerTap);
  console.log(
    difficulty.padEnd(14) + String(params.n).padEnd(3) + String(SAMPLES).padEnd(9) +
    String(wins).padEnd(6) + avg.toFixed(1).padEnd(16) + String(p75).padEnd(10) +
    String(secPerTap).padEnd(9) + String(estMedianS).padEnd(14) +
    (params.timeLimitMs / 1000)
  );
}
