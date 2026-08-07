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

import { useState, useRef, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Engine from '../engine';

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
const REVEAL_STAGGER_MAX = 70;   // a touch snappier than the wipe — arriving, not leaving
const REVEAL_TOTAL_TARGET = 720;

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
    onWon = (s) => statsApi?.boardWon({ level: s.level, n: s.n, taps: s.taps, lives: s.lives }),
    onLost = () => statsApi?.boardLost(),
    onBoardStarted = () => statsApi?.boardStarted(),
    onTapped = (info) => statsApi?.tapped(info),
  } = opts;

  const [state, setState] = useState(() => (initialState ? initialState() : Engine.newGame(1)));
  const [display, setDisplay] = useState(state.cells);   // what the board shows (may lag during cascade)
  const [bursting, setBursting] = useState([]);          // indices currently popping
  const [wiping, setWiping] = useState([]);               // indices currently fading in the win-wipe
  const [revealing, setRevealing] = useState([]);         // indices already swept in on a fresh board
  const [busy, setBusy] = useState(false);               // true while a cascade/wipe animates
  const [status, setStatus] = useState('play');          // 'play' | 'won' | 'lost'
  const [boardId, setBoardId] = useState(0);              // bumps whenever a NEW board is generated
  const timers = useRef([]);

  // --- persistence ------------------------------------------------------
  // Ladder mode resumes a saved level from AsyncStorage on mount. A mode that
  // opts out (persistProgress: false, e.g. the daily challenge) just reveals
  // whatever initialState() already produced — no storage touch at all.
  useEffect(() => {
    onBoardStarted(); // the initial board created above counts too
    if (!persistProgress) {
      runBoardReveal(state.n);
      return () => timers.current.forEach(clearTimeout);
    }
    (async () => {
      let loadedSaved = false;
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.level) {
            const g = Engine.newGame(saved.level);
            setState(g); setDisplay(g.cells); setStatus('play');
            setBoardId((id) => id + 1);
            onBoardStarted();
            runBoardReveal(g.n);
            loadedSaved = true;
          }
        }
      } catch (e) { /* first run or storage unavailable — ignore */ }
      // no saved level to load — reveal the default level-1 board created
      // above instead, so its cells' outlines aren't stuck on the neutral
      // colour for the whole first level (see Cell.jsx's `settled` check).
      if (!loadedSaved) runBoardReveal(state.n);
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onWon(wonState);
  }, [onWon]);

  const settleLoss = useCallback(() => {
    setStatus('lost');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    onLost();
  }, [onLost]);

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
  // is added here.
  const runBoardReveal = useCallback((n) => {
    setRevealing([]);
    const { bands, keys, stagger } = diagonalBands(n * n, n, REVEAL_STAGGER_MAX, REVEAL_TOTAL_TARGET);
    keys.forEach((band, k) => {
      after(k * stagger, () => {
        setRevealing((r) => [...r, ...bands.get(band)]);
      });
    });
  }, []);

  // --- the tap --------------------------------------------------------------
  const tap = useCallback((i) => {
    if (busy || status !== 'play') return;
    const res = Engine.tap(state, i);
    if (res.result === 'ignored') return;

    onTapped({ bursts: res.bursts, livesLost: res.livesLost || 0 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

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
        Haptics.impactAsync(
          k === res.bursts.length - 1 && res.result === 'lost'
            ? Haptics.ImpactFeedbackStyle.Heavy
            : Haptics.ImpactFeedbackStyle.Medium
        ).catch(() => {});
      });
      after(stepStart + BURST_STEP, () => {
        setDisplay(res.frames[k].slice());
      });
    });

    const total = res.bursts.length * BURST_STEP + CASCADE_TAIL;
    after(total, () => {
      setBursting([]);
      setState(res.state);
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
  const retry = useCallback(() => {
    clearTimers();
    const g = (regenerate || Engine.retry)(state);
    setState(g); setDisplay(g.cells); setBursting([]); setWiping([]); setStatus('play'); setBusy(false);
    setBoardId((id) => id + 1);
    onBoardStarted();
    runBoardReveal(g.n);
  }, [state, regenerate, onBoardStarted, runBoardReveal]);

  // External forced loss (e.g. a daily-challenge countdown hitting zero) —
  // mirrors the cascade-lost path in tap() above. Guarded so it's a no-op if
  // the board already resolved, or (defensively) mid-cascade — the countdown
  // this is designed for only decrements while idle, so busy should never be
  // true here in practice.
  const forceTimeout = useCallback(() => {
    if (status !== 'play' || busy) return;
    clearTimers();
    setDisplay(state.cells);
    settleLoss();
  }, [status, busy, state, settleLoss]);

  const restart = useCallback(() => {
    clearTimers();
    const g = Engine.newGame(1);
    setState(g); setDisplay(g.cells); setBursting([]); setWiping([]); setStatus('play'); setBusy(false);
    setBoardId((id) => id + 1);
    statsApi.boardStarted();
    persist(1);
    runBoardReveal(g.n);
  }, [persist, statsApi, runBoardReveal]);

  // Advance from a cleared board to the next level (called from the "Continue"
  // prompt, not automatic — Leon wants a deliberate step, not an auto-advance).
  const continueNext = useCallback(() => {
    clearTimers();
    const ng = Engine.nextLevel(state);
    setState(ng); setDisplay(ng.cells); setBursting([]); setWiping([]); setStatus('play'); setBusy(false);
    setBoardId((id) => id + 1);
    statsApi.boardStarted();
    persist(ng.level);
    runBoardReveal(ng.n);
  }, [state, persist, statsApi, runBoardReveal]);

  return {
    state, display, bursting, wiping, revealing, busy, status, boardId,
    tap, retry, restart, continueNext, forceTimeout,
    // rendering hints
    isGreen: (v) => Engine.isGreen(v, state.ratio),
  };
}
