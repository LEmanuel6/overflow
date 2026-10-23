// useGame — the bridge between the pure engine and the React UI.
//
// Responsibilities:
//  - hold the current engine state and expose it to components
//  - handle a tap: play the cascade animation frame-by-frame (using the
//    `frames` the engine returns), fire haptics, then settle into the next state
//  - on a win, wipe the cleared board with a staggered fade before showing the
//    won prompt
//  - advance level on win, offer retry on loss
//  - persist level + stats across sessions (AsyncStorage)
//
// The engine itself stays pure; all timing, animation, side effects live here.
// Per-cell count-up and "+N" floating amounts are handled locally inside
// Cell.jsx by watching its own `value` prop change — this hook only needs to
// hand it the right numbers at the right times via `display`/`boardId`.

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Engine from '../engine';
import { playTap, playBurst, playSweepTick } from '../sound';
import { impactLight, impactMedium, impactHeavy, notifySuccess, notifyError } from '../haptics';

const STORE_KEY = 'overflow:v1';

// animation timing (ms)
// Per burst: the over-cap number is revealed and held (RISE_HOLD, long enough
// for Cell's own count-up to finish and be read), THEN the cell pops
// (POP_HOLD, matching Cell's pop-scale animation), and only then does it empty
// and hand its share to the next cell in the chain.
const RISE_HOLD = 340;
const POP_HOLD = 260;
const BURST_STEP = RISE_HOLD + POP_HOLD;
const CASCADE_TAIL = 200;      // let the final frame's count-up settle before finalising
const WIPE_STAGGER_MAX = 90;   // ms between diagonal wave bands, at most
const WIPE_TOTAL_TARGET = 960; // aim to spread the whole wave across ~this long
const WIPE_FADE = 520;         // per-cell fade duration, tail after the last band
const REVEAL_STAGGER_MAX = 85;   // a touch snappier than the wipe — arriving, not leaving
const REVEAL_TOTAL_TARGET = 860;
// Roughly matches Cell.jsx's own REVEAL_FADE_MS — the extra time after the
// LAST band starts fading in before that fade visually finishes. Only used
// to time runBoardReveal's optional onDone callback, so it doesn't need to
// be pixel-perfect, just close enough that "Start" doesn't appear mid-fade.
const REVEAL_SETTLE_MS = 420;

// Group cell indices into diagonal bands (band = row + col), the same wave
// order used for both the win-wipe (out) and the board-load reveal (in).
// Returns the bands keyed in sweep order, plus the per-band stagger delay.
function diagonalBands(count, n, staggerMax, totalTarget) {
  const bands = new Map();
  for (let idx = 0; idx < count; idx++) {
    const band = Math.floor(idx / n) + (idx % n);
    if (!bands.has(band)) bands.set(band, []);
    bands.get(band).push(idx);
  }
  const keys = [...bands.keys()].sort((a, b) => a - b);
  const stagger = keys.length ? Math.min(staggerMax, totalTarget / keys.length) : 0;
  return { bands, keys, stagger };
}

// opts lets a second consumer (the daily challenge) reuse this hook's whole
// animation engine (cascade stepping, wipe, reveal — untouched below) while
// swapping out just the ladder-specific bits: board generation, whether
// progress persists to AsyncStorage, and where win/loss/tap/start events are
// reported. Every default below reproduces today's exact ladder behavior, so
// useGame(statsApi) with no opts is unchanged.
export function useGame(statsApi, opts = {}) {
  const {
    initialState,                                   // () => state; default Engine.newGame(1)
    persistProgress = true,                          // gates AsyncStorage resume/persist
    regenerate,                                      // (state) => state; used by retry()
    onWon = (s, info) => statsApi?.boardWon({ level: s.level, n: s.n, taps: s.taps, lives: s.lives, ...info }),
    onLost = () => statsApi?.boardLost(),
    onTapped = (info) => statsApi?.tapped(info),
    // When true, a loss isn't reported (onLost) the instant it happens — it's
    // held until the player commits to it (retry / start another board /
    // leave), so a rewarded "continue" (reviveAfterLoss) can undo it without
    // stats ever seeing a loss AND a win for the same board attempt.
    offerContinue = false,
    // Fires once the very first board's entrance reveal has visually
    // finished (see the mount effect below) — used by the daily challenge to
    // know when taps should start registering (see its `ready` state). Left
    // undefined by default (the ladder doesn't use it); the daily challenge
    // screen also passes its own onDone straight to retry() for every later
    // attempt, since that's a fresh reveal too.
    onRevealDone,
  } = opts;

  const [state, setState] = useState(() => (initialState ? initialState() : Engine.newGame(1)));
  const [display, setDisplay] = useState(state.cells);   // what the board shows (may lag during cascade)
  const [bursting, setBursting] = useState([]);          // indices currently popping
  const [wiping, setWiping] = useState([]);               // indices currently fading in the win-wipe
  const [revealing, setRevealing] = useState([]);         // indices already swept in on a fresh board
  const [busy, setBusy] = useState(false);               // true while a cascade/wipe animates
  const [status, setStatus] = useState('play');          // 'play' | 'won' | 'lost'
  const [boardId, setBoardId] = useState(0);              // bumps whenever a NEW board is generated
  // Lives, but ticking down ONCE PER BURST as a cascade plays rather than
  // jumping straight to the post-cascade total — `state.lives` itself still
  // only updates once, at the end (nothing about scoring/persistence/win-
  // loss resolution changes), so this exists purely so the Hud's Overflow
  // bar can animate in step with each cell actually popping, not after the
  // whole chain has already resolved. See the per-burst setDisplayLives call
  // in tap() below.
  const [displayLives, setDisplayLives] = useState(() => state.lives);
  const timers = useRef([]);

  // Per-attempt trackers consumed by onWon (flawless-clear detection, best-
  // clear-time) — a private pair per useGame INSTANCE, not a store shared
  // across the whole app. This matters: the ladder's useGame instance (see
  // App.js) stays mounted for the entire session regardless of which screen
  // is visible, so if this lived in the shared stats store instead (it used
  // to), a daily-challenge tap/board would corrupt whatever ladder board
  // happens to be in progress elsewhere — reachable any time, since the
  // ladder's board is "in progress" from app launch, not just while that
  // tab is open. Reset in beginBoard() for every new attempt; NOT reset by
  // reviveAfterLoss, since a loss-then-revive-then-win is deliberately still
  // not "flawless".
  const livesLostThisBoardRef = useRef(0);
  const boardStartTimeRef = useRef(Date.now());

  // --- rewarded continue bookkeeping -----------------------------------------
  // One continue per board attempt. pendingLossRef holds a loss that has
  // happened on screen but not yet been reported via onLost.
  const [continueUsed, setContinueUsed] = useState(false);
  const continueUsedRef = useRef(false);
  const pendingLossRef = useRef(false);
  const onLostRef = useRef(onLost);
  onLostRef.current = onLost;

  const commitLoss = useCallback(() => {
    if (!pendingLossRef.current) return;
    pendingLossRef.current = false;
    onLostRef.current();
  }, []);

  // Set when a countdown expiry (the daily challenge's forceTimeout) lands
  // while a cascade/wipe is still animating — now a real possibility since
  // the countdown keeps running through bursts as an intended penalty (see
  // useCountdown.js) instead of pausing for the animation. Rather than drop
  // that expiry or cut the animation off mid-flight, it's applied the moment
  // the board next goes idle (the effect below) — but only if the cascade's
  // own outcome didn't already resolve the board first (win/loss already
  // flips `status` away from 'play', which the effect checks).
  const pendingTimeoutRef = useRef(false);

  // Every new board attempt starts here: report any still-pending loss for the
  // board being left, and make the next attempt's single continue available.
  const beginBoard = useCallback(() => {
    commitLoss();
    continueUsedRef.current = false;
    setContinueUsed(false);
    pendingTimeoutRef.current = false;
    livesLostThisBoardRef.current = 0;
    boardStartTimeRef.current = Date.now();
  }, [commitLoss]);

  // Leaving the screen with a loss still pending (e.g. the daily challenge's
  // Menu button) counts as accepting it.
  useEffect(() => () => commitLoss(), [commitLoss]);

  // --- persistence ------------------------------------------------------
  // Daily-mode (persistProgress: false) entrance reveal — useLayoutEffect,
  // not useEffect: this needs to hide the freshly-mounted board (via the
  // boardId bump) BEFORE the first paint, the same fix GameScreen's own
  // replayReveal() applies for the ladder (see its comment) — otherwise
  // every cell's revealOpacity starts at 1 (fully visible, see Cell.jsx) and
  // there's no prior boardId to differ from yet, so the whole board is
  // visible from frame one instead of sweeping in. Audible (never silent) —
  // this instance only mounts because the player navigated here.
  useLayoutEffect(() => {
    if (persistProgress) return;
    livesLostThisBoardRef.current = 0;
    boardStartTimeRef.current = Date.now();
    setBoardId((id) => id + 1);
    runBoardReveal(state.n, { onDone: onRevealDone });
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ladder mode resumes a saved level from AsyncStorage on mount — async, so
  // this stays a plain effect (can't hide-before-paint synchronously the way
  // the daily branch above does; GameScreen's own replayReveal() handles the
  // ladder's per-navigation entrance reveal separately, on every GameScreen
  // mount, not here — this effect only runs once, at app launch).
  useEffect(() => {
    if (!persistProgress) return;
    livesLostThisBoardRef.current = 0;
    boardStartTimeRef.current = Date.now();
    (async () => {
      let loadedSaved = false;
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.level) {
            const g = Engine.newGame(saved.level);
            setState(g); setDisplay(g.cells); setStatus('play');
            setDisplayLives(g.lives);
            setBoardId((id) => id + 1);
            livesLostThisBoardRef.current = 0;
            boardStartTimeRef.current = Date.now();
            runBoardReveal(g.n, { silent: true });
            loadedSaved = true;
          }
        }
      } catch (e) { /* first run or storage unavailable — ignore */ }
      // no saved level to load — reveal the default level-1 board created
      // above instead, so its cells' outlines aren't stuck on the neutral
      // colour for the whole first level (see Cell.jsx's `settled` check).
      if (!loadedSaved) runBoardReveal(state.n, { silent: true });
    })();
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((level) => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ level })).catch(() => {});
  }, []);

  // --- helpers --------------------------------------------------------------
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms, fn) => { timers.current.push(setTimeout(fn, ms)); };

  const settleWin = useCallback((wonState) => {
    setStatus('won');
    notifySuccess();
    onWon(wonState, {
      livesLostThisBoard: livesLostThisBoardRef.current,
      elapsedMs: Date.now() - boardStartTimeRef.current,
    });
  }, [onWon]);

  const settleLoss = useCallback(() => {
    setStatus('lost');
    notifyError();
    if (offerContinue && !continueUsedRef.current) pendingLossRef.current = true;
    else onLost();
  }, [onLost, offerContinue]);

  // A cleared board wipes in a diagonal wave (band = row + col) rather than
  // popping straight to empty. `cells` is the pre-sweep board (still holding
  // the green values); `wonState` is the already-swept (all-zero) engine state.
  // Every cell is included in the wave — not just the ones still holding a
  // value — so cells the player had already emptied earlier don't just sit
  // there with a static outline while everything around them fades.
  const runWinWipe = useCallback((cells, wonState) => {
    const n = wonState.n;
    const { bands, keys, stagger } = diagonalBands(cells.length, n, WIPE_STAGGER_MAX, WIPE_TOTAL_TARGET);

    keys.forEach((band, k) => {
      after(k * stagger, () => {
        setWiping((w) => [...w, ...bands.get(band)]);
        playSweepTick();
      });
    });

    const total = keys.length * stagger + WIPE_FADE;
    after(total, () => {
      setWiping([]);
      setDisplay(wonState.cells);
      setBusy(false);
      settleWin(wonState);
    });
  }, [settleWin]);

  // Sweep a freshly-loaded board in, same diagonal wave as the wipe but in
  // reverse (arriving instead of leaving). Cell.jsx starts a fresh board's
  // cells hidden (see its boardId effect) and fades each one in as its index
  // is added here. `silent` skips the per-band tick sound — used when
  // retry()/restart() etc. are resetting the board as a side effect of the
  // player LEAVING the screen (abort-to-menu), not watching it: GameScreen
  // stays mounted (display:none) when not the active tab, so this reveal
  // still runs invisibly in the background either way, but without `silent`
  // it would also play an audible sweep for an animation nobody can see.
  const runBoardReveal = useCallback((n, { silent = false, onDone } = {}) => {
    setRevealing([]);
    const { bands, keys, stagger } = diagonalBands(n * n, n, REVEAL_STAGGER_MAX, REVEAL_TOTAL_TARGET);
    keys.forEach((band, k) => {
      after(k * stagger, () => {
        setRevealing((r) => [...r, ...bands.get(band)]);
        if (!silent) playSweepTick();
      });
    });
    if (onDone) after(keys.length * stagger + REVEAL_SETTLE_MS, onDone);
  }, []);

  // --- the tap --------------------------------------------------------------
  const tap = useCallback((i) => {
    if (busy || status !== 'play') return;
    const res = Engine.tap(state, i);
    if (res.result === 'ignored') return;

    onTapped({ bursts: res.bursts, livesLost: res.livesLost || 0 });
    livesLostThisBoardRef.current += res.livesLost || 0;
    impactLight();
    playTap();

    // clean tap, no cascade
    if (!res.bursts.length) {
      setState(res.state);
      if (res.result === 'won') {
        setBusy(true);
        setDisplay(res.after);           // show the board as it landed, greens and all
        runWinWipe(res.after, res.state);
      } else {
        setDisplay(res.state.cells);
      }
      return;
    }

    // cascade: animate frame by frame. Reveal the tap's own distribution right
    // away — any neighbour already over cap gets its RISE_HOLD window to count
    // up before the first pop.
    setBusy(true);
    setDisplay(res.after.slice());
    res.bursts.forEach((idx, k) => {
      const stepStart = k * BURST_STEP;
      after(stepStart + RISE_HOLD, () => {
        setBursting((b) => [...b, idx]);
        setDisplayLives((l) => Math.max(0, l - 1)); // this exact burst is the life spent
        (k === res.bursts.length - 1 && res.result === 'lost' ? impactHeavy : impactMedium)();
        playBurst();
      });
      after(stepStart + BURST_STEP, () => {
        setDisplay(res.frames[k].slice());
      });
    });

    const total = res.bursts.length * BURST_STEP + CASCADE_TAIL;
    after(total, () => {
      setBursting([]);
      setState(res.state);
      setDisplayLives(res.state.lives); // resync exactly — guards against any rounding drift
      if (res.result === 'lost') {
        setDisplay(res.state.cells);
        setBusy(false);
        settleLoss();
      } else if (res.result === 'won') {
        const preWin = res.frames[res.frames.length - 1];
        setDisplay(preWin);
        runWinWipe(preWin, res.state);
      } else {
        setDisplay(res.state.cells);
        setBusy(false);
      }
    });
  }, [state, busy, status, runWinWipe, settleLoss, onTapped]);

  // --- controls -------------------------------------------------------------
  // `silent` forwards to runBoardReveal — see its comment. Used when a
  // caller is resetting the board as a side effect of leaving the screen,
  // not an in-view "Try again" tap. `onDone` also forwards straight through —
  // the daily challenge uses it to know when a retry's reveal has finished,
  // same as the mount effect's onRevealDone (see above).
  const retry = useCallback(({ silent = false, onDone } = {}) => {
    clearTimers();
    beginBoard();
    const g = (regenerate || Engine.retry)(state);
    setState(g); setDisplay(g.cells); setBursting([]); setWiping([]); setStatus('play'); setBusy(false);
    setDisplayLives(g.lives);
    setBoardId((id) => id + 1);
    runBoardReveal(g.n, { silent, onDone });
  }, [state, regenerate, runBoardReveal, beginBoard]);

  // External forced loss (e.g. a daily-challenge countdown hitting zero) —
  // mirrors the cascade-lost path in tap() above. A no-op if the board
  // already resolved. If it lands mid-cascade (the countdown now keeps
  // running through bursts — see useCountdown.js), it doesn't cut the
  // animation off: it just records the expiry and the effect below applies
  // it the moment the board goes idle, unless the cascade's own outcome
  // (win or loss) resolved the board first.
  const forceTimeout = useCallback(() => {
    if (status !== 'play') return;
    if (busy) { pendingTimeoutRef.current = true; return; }
    clearTimers();
    setDisplay(state.cells);
    settleLoss();
  }, [status, busy, state, settleLoss]);

  useEffect(() => {
    if (busy || status !== 'play' || !pendingTimeoutRef.current) return;
    pendingTimeoutRef.current = false;
    clearTimers();
    setDisplay(state.cells);
    settleLoss();
  }, [busy, status, state, settleLoss]);

  // Only ever called from the Menu screen's Reset button — GameScreen is
  // never the visible tab when this fires, so always silent: nobody's ever
  // watching this particular reveal.
  const restart = useCallback(() => {
    clearTimers();
    beginBoard();
    const g = Engine.newGame(1);
    setState(g); setDisplay(g.cells); setBursting([]); setWiping([]); setStatus('play'); setBusy(false);
    setDisplayLives(g.lives);
    setBoardId((id) => id + 1);
    persist(1);
    runBoardReveal(g.n, { silent: true });
  }, [persist, runBoardReveal, beginBoard]);

  // Advance from a cleared board to the next level — auto-triggered on a
  // win now (see GameScreen's auto-advance effect), or forced early by
  // backing out right after a win (silent: true there — see its call site).
  const continueNext = useCallback(({ silent = false } = {}) => {
    clearTimers();
    beginBoard();
    const ng = Engine.nextLevel(state);
    setState(ng); setDisplay(ng.cells); setBursting([]); setWiping([]); setStatus('play'); setBusy(false);
    setDisplayLives(ng.lives);
    setBoardId((id) => id + 1);
    persist(ng.level);
    runBoardReveal(ng.n, { silent });
  }, [state, persist, runBoardReveal, beginBoard]);

  // Dev-only: jump straight to an arbitrary level, to test a specific
  // difficulty band without grinding there. Ladder-only, mirrors restart/
  // continueNext (persists the jumped-to level, so it survives a reload).
  const goToLevel = useCallback((level) => {
    clearTimers();
    beginBoard();
    const g = Engine.newGame(level);
    setState(g); setDisplay(g.cells); setBursting([]); setWiping([]); setStatus('play'); setBusy(false);
    setDisplayLives(g.lives);
    setBoardId((id) => id + 1);
    persist(level);
    runBoardReveal(g.n);
  }, [persist, runBoardReveal, beginBoard]);

  // Rewarded continue: undo a loss and put the same board back in play (the
  // caller has already had the reward earned). A loss by lives restores
  // continueLivesForGrid(n) lives; a forced timeout (lives still > 0) keeps
  // the lives it had. The loss is dropped from the pending report, so stats
  // never see it. Once per board attempt.
  const reviveAfterLoss = useCallback(() => {
    if (status !== 'lost' || continueUsedRef.current) return;
    pendingLossRef.current = false;
    continueUsedRef.current = true;
    setContinueUsed(true);
    const lives = state.lives > 0 ? state.lives : Engine.continueLivesForGrid(state.n);
    const r = Engine.revive(state, lives);
    setState(r.state);
    setDisplayLives(r.state.lives);
    setStatus('play');
    if (r.result === 'won') {
      // the lost board had already resolved to all-green — reviving it is a win
      setBusy(true);
      runWinWipe(display, r.state);
    }
  }, [status, state, display, runWinWipe]);

  const canContinue = offerContinue && status === 'lost' && !continueUsed;

  // Replays the reveal sweep (+ its sound) for the CURRENT board, without
  // regenerating anything. For the ladder, GameScreen actually unmounts/
  // remounts on every navigation away from and back to the 'game' tab
  // (unlike Menu/Stats/etc., which stay mounted via display:none) — but
  // this hook's state is lifted to App.js, so the board itself persists
  // across that. Without this, the board's entrance animation only ever
  // played once (whenever it was silently generated in the background) and
  // never again on return visits, even though the player's now actually
  // looking at it for the first time this visit. Called from GameScreen's
  // own mount effect — guarded to a genuinely in-progress board (status
  // 'play'), so it doesn't sweep in behind the won/lost prompts.
  //
  // bumps boardId even though the board DATA isn't changing — Cell.jsx only
  // hides itself (ready to animate back in) when ITS boardId prop changes;
  // without that bump every cell was already sitting at full opacity from
  // the earlier (silent) reveal, so runBoardReveal had nothing actually
  // hidden left to sweep in. Confirmed harmless elsewhere: the interstitial-
  // ad and auto-advance effects both key off boardId too, but only act when
  // status is 'won', and this only ever runs while status is 'play'.
  const replayReveal = useCallback(() => {
    if (status !== 'play') return;
    clearTimers();
    setBoardId((id) => id + 1);
    runBoardReveal(state.n);
  }, [status, state.n, runBoardReveal]);

  return {
    state, display, bursting, wiping, revealing, busy, status, boardId,
    displayLives,
    tap, retry, restart, continueNext, forceTimeout, goToLevel,
    canContinue, reviveAfterLoss, replayReveal,
    // rendering hints
    isGreen: (v) => Engine.isGreen(v, state.ratio),
  };
}
