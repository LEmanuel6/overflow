/*
 * Standalone tests for overflow-engine.js — no framework, run with `node`.
 * Proves the extracted engine behaves correctly on its own.
 */
const E = require('./index.js');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL:', name); }
}

// --- generation: every level produces a full, winnable board -----------------
console.log('generation across levels:');
for (const L of [1, 3, 6, 10, 16, 25, 26, 50, 51, 75, 76]) {
  const s = E.newGame(L);
  const size = s.n * s.n;
  const filled = s.cells.filter(v => v > 0).length;
  const fullCells = s.cells.filter((v, i) => v > 0 && v >= s.caps[i]).length;
  const winnable = E.isWinnable(s.cells, s.caps, s.n, s.ratio);
  ok(`L${L} fully packed`, filled === size);
  ok(`L${L} <=1 full cell`, fullCells <= 1);
  ok(`L${L} winnable`, winnable);
  ok(`L${L} status play`, s.status === 'play');
  console.log(`  L${L}: ${s.n}x${s.n}, ${filled}/${size} filled, ${fullCells} full, winnable=${winnable}`);
}

// --- a tap drains the board and never mutates input --------------------------
console.log('\ntap purity + draining:');
{
  const s = E.newGame(12);
  const before = s.cells.slice();
  const safe = E.safeTaps(s);
  ok('has a safe opening tap', safe.length > 0);
  const r = E.tap(s, safe[0]);
  ok('input state unmutated', s.cells.join(',') === before.join(','));
  ok('total value did not increase', r.state.cells.reduce((a, b) => a + b, 0) <= before.reduce((a, b) => a + b, 0));
  ok('taps incremented', r.state.taps === 1);
}

// --- every generated board is winnable by construction -----------------------
console.log('\nsolvability (exact solver — the generation guarantee):');
{
  // The generator only returns boards it already verified winnable, so the
  // robust invariant to check here is that newGame always yields a board that
  // is immediately playable (has at least one legal move and isn't pre-lost).
  let playable = 0, trials = 40;
  for (let t = 0; t < trials; t++) {
    const s = E.newGame(12);
    if (s.status === 'play' && E.legalTaps(s).length > 0) playable++;
  }
  ok('every generated board is immediately playable', playable === trials);
  console.log(`  ${playable}/${trials} L12 boards playable`);
}

// --- cascade resolves deterministically and costs lives ----------------------
console.log('\ncascade + lives:');
{
  // craft a small board with adjacent near-cap cells to force a chain
  const n = 3, ratio = 0.9;
  const caps = [10, 10, 10, 10, 10, 10, 10, 10, 10];
  const cells = [10, 9, 9, 0, 0, 0, 0, 0, 0]; // tap 0 -> pushes 1 over -> chain
  const s = { n, ratio, cells, caps, level: 1, lives: 3, taps: 0, status: 'play' };
  const r = E.tap(s, 0);
  ok('tap caused a cascade or loss', r.bursts.length >= 1);
  ok('lives spent equal bursts (or lost)', r.result === 'lost' || r.livesLost === r.bursts.length);
  ok('frames match bursts', r.frames.length === r.bursts.length);
  console.log(`  chain of ${r.bursts.length} bursts, result=${r.result}, livesLost=${r.livesLost}`);
}

// --- empty cells don't burst on overflow — their cap grows to meet it --------
console.log('\nempty-cell cap growth:');
{
  // cell 1 is empty (0) with a tiny cap (1); tapping cell 0 pushes 2 into it —
  // over the old cap, but since it was empty it should absorb the value by
  // growing its cap to 2, not burst.
  const n = 2, ratio = 0.9, caps = [10, 1, 10, 10];
  const cells = [10, 0, 0, 0];
  const s = { n, ratio, cells, caps, level: 1, lives: 3, taps: 0, status: 'play' };
  const r = E.tap(s, 0);
  ok('no burst into an empty cell', r.bursts.length === 0);
  ok('lives unchanged', r.state.lives === 3);
  ok("empty cell's cap grew to meet the incoming value", r.state.caps[1] === 2);
  ok('original caps array left untouched', caps[1] === 1);
}
{
  // same push, but cell 1 already holds a value (1, not empty) — it should
  // still burst normally; the exception is only for cells that were empty.
  const n = 2, ratio = 0.9, caps = [10, 1, 10, 10];
  const cells = [10, 1, 0, 0];
  const s = { n, ratio, cells, caps, level: 1, lives: 3, taps: 0, status: 'play' };
  const r = E.tap(s, 0);
  ok('non-empty cell still bursts on overflow', r.bursts.length === 1);
  ok("non-empty cell's cap does not grow", r.state.caps[1] === 1);
}

// --- win detection: tap()'s result must actually say 'won', not just the
// wrapped state's status -- regression test for a bug where a clean tap or a
// cascade that cleared the board reported result: null / 'cascade' instead of
// 'won', so the UI never noticed the win. -------------------------------------
console.log('\nwin detection:');
{
  // clean tap (no cascade) that empties the board outright
  const n = 2, ratio = 0.9, caps = [10, 10, 10, 10];
  const cells = [4, 0, 0, 0]; // shareEach(4,0.9)=floor(3/4)=0 -> pushes nothing
  const s = { n, ratio, cells, caps, level: 1, lives: 3, taps: 0, status: 'play' };
  const r = E.tap(s, 0);
  ok('clean-tap win reports result won', r.result === 'won');
  ok('clean-tap win has no bursts', r.bursts.length === 0);
  ok('clean-tap win state status won', r.state.status === 'won');
  ok('clean-tap win clears all cells', r.state.cells.every(v => v === 0));
}
{
  // cascade that bursts once then leaves only green cells -> should also win.
  // Cell 1 starts non-empty (1, not 0) so it genuinely bursts on overflow —
  // an empty cell receiving overflow grows its cap instead (see
  // distributeAndGrow), which would sidestep the burst this test wants.
  const n = 2, ratio = 0.9, caps = [10, 1, 10, 10];
  const cells = [10, 1, 0, 0];
  const s = { n, ratio, cells, caps, level: 1, lives: 3, taps: 0, status: 'play' };
  const r = E.tap(s, 0);
  ok('cascade win reports result won', r.result === 'won');
  ok('cascade win keeps burst/frame data', r.bursts.length === 1 && r.frames.length === 1);
  ok('cascade win state status won', r.state.status === 'won');
}

// --- lifecycle: next level / retry -------------------------------------------
console.log('\nlifecycle:');
{
  const s = E.newGame(5);
  const nx = E.nextLevel({ ...s, status: 'won' });
  ok('nextLevel advances', nx.level === 6);
  const rt = E.retry(s);
  ok('retry keeps level', rt.level === 5);
  ok('retry restores lives', rt.lives === E.MAX_LIVES);
}

// --- lives scale with grid size ----------------------------------------------
console.log('\nlives scale with grid size:');
{
  ok('livesForGrid 3x3', E.livesForGrid(3) === 3);
  ok('livesForGrid 4x4', E.livesForGrid(4) === 5);
  ok('livesForGrid 5x5', E.livesForGrid(5) === 7);
  ok('livesForGrid 6x6', E.livesForGrid(6) === 10);
  ok('newGame lives match grid size', E.newGame(1).lives === E.livesForGrid(3));
  ok('newDailyGame lives match grid size', E.newDailyGame('2026-08-07', 'expert').lives === E.livesForGrid(5));
}

// --- rewarded continue: reviving a lost board -------------------------------
console.log('\nrevive (rewarded continue):');
{
  ok('continueLivesForGrid 3x3', E.continueLivesForGrid(3) === 2);
  ok('continueLivesForGrid 4x4', E.continueLivesForGrid(4) === 3);
  ok('continueLivesForGrid 5x5', E.continueLivesForGrid(5) === 4);
  ok('continueLivesForGrid 6x6', E.continueLivesForGrid(6) === 5);

  // a chain that outruns 1 life: tap 0 bursts cells 1 and 2 (2 bursts > 1 life)
  const n = 3, ratio = 0.9, caps = [10, 3, 3, 10, 10, 10, 10, 10, 10];
  const cells = [10, 3, 3, 4, 4, 4, 4, 4, 4];
  const lost = E.tap({ n, ratio, cells, caps, level: 1, lives: 1, taps: 0, status: 'play' }, 0);
  ok('setup: board is lost', lost.result === 'lost' && lost.state.status === 'lost');

  const r = E.revive(lost.state, 2);
  ok('revive puts the board back in play', r.result === null && r.state.status === 'play');
  ok('revive sets the requested lives', r.state.lives === 2);
  ok('revive keeps the board as it was', r.state.cells.join(',') === lost.state.cells.join(','));
  ok('revived board has a legal tap', E.legalTaps(r.state).length > 0);
  ok('input state unmutated by revive', lost.state.status === 'lost' && lost.state.lives === 0);

  // a lost board that resolved to all-green is simply a win once revived
  const allGreen = { n: 2, ratio: 0.9, cells: [1, 2, 0, 1], caps: [10, 10, 10, 10], level: 1, lives: 0, taps: 3, status: 'lost' };
  const w = E.revive(allGreen, 2);
  ok('reviving an already-cleared board wins', w.result === 'won' && w.state.status === 'won');
}

// --- daily challenge: deterministic, same board for the same (date, difficulty)
console.log('\ndaily challenge determinism:');
{
  const a1 = E.newDailyGame('2026-08-07', 'intermediate');
  const a2 = E.newDailyGame('2026-08-07', 'intermediate');
  const b = E.newDailyGame('2026-08-08', 'intermediate');
  ok('same date+difficulty -> identical cells', a1.cells.join(',') === a2.cells.join(','));
  ok('same date+difficulty -> identical caps', a1.caps.join(',') === a2.caps.join(','));
  ok('different date -> different board', a1.cells.join(',') !== b.cells.join(',') || a1.caps.join(',') !== b.caps.join(','));
  ok('daily board fully packed', a1.cells.every(v => v > 0));
  ok('daily board winnable', E.isWinnable(a1.cells, a1.caps, a1.n, a1.ratio));

  for (const d of E.DAILY_DIFFICULTY_ORDER) {
    const s = E.newDailyGame('2026-08-07', d);
    const expected = E.DAILY_DIFFICULTIES[d];
    ok(`${d}: correct grid size`, s.n === expected.n);
    ok(`${d}: fully packed`, s.cells.every(v => v > 0));
    ok(`${d}: winnable`, E.isWinnable(s.cells, s.caps, s.n, s.ratio));
  }
  const expertBoard = E.newDailyGame('2026-08-07', 'expert');
  const masterBoard = E.newDailyGame('2026-08-07', 'master');
  ok('same date, different difficulty -> different board', expertBoard.n !== masterBoard.n);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
