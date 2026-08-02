// useGame — the bridge between the pure engine and the React UI.
//
// Responsibilities:
//  - hold the current engine state and expose it to components
//  - handle a tap: play the cascade animation frame-by-frame (using the
//    `frames` the engine returns), fire haptics, then settle into the next state
//  - advance level on win, offer retry on loss
//  - persist level + stats across sessions (AsyncStorage)
//
// The engine itself stays pure; all timing, animation, side effects live here.

import { useState, useRef, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Engine from '../engine';

const STORE_KEY = 'overflow:v1';

// animation timing (ms)
const BURST_STEP = 460;   // gap between successive bursts in a chain
const BURST_POP = 260;    // when the pop lands within a step
const WIN_PAUSE = 950;    // pause on a cleared board before the next level

export function useGame() {
  const [state, setState] = useState(() => Engine.newGame(1));
  const [display, setDisplay] = useState(state.cells);   // what the board shows (may lag during cascade)
  const [bursting, setBursting] = useState([]);          // indices currently popping
  const [busy, setBusy] = useState(false);               // true while a cascade animates
  const [status, setStatus] = useState('play');          // 'play' | 'won' | 'lost'
  const [stats, setStats] = useState({ best: 1, cleared: 0 });
  const timers = useRef([]);

  // --- persistence ----------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.stats) setStats(saved.stats);
          if (saved.level) {
            const g = Engine.newGame(saved.level);
            setState(g); setDisplay(g.cells); setStatus('play');
          }
        }
      } catch (e) { /* first run or storage unavailable — ignore */ }
    })();
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const persist = useCallback((level, nextStats) => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ level, stats: nextStats })).catch(() => {});
  }, []);

  // --- helpers --------------------------------------------------------------
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms, fn) => { timers.current.push(setTimeout(fn, ms)); };

  const settleWin = useCallback((wonState) => {
    setStatus('won');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const nextStats = {
      best: Math.max(stats.best, wonState.level + 1),
      cleared: stats.cleared + 1,
    };
    setStats(nextStats);
    after(WIN_PAUSE, () => {
      const ng = Engine.nextLevel(wonState);
      setState(ng); setDisplay(ng.cells); setBursting([]); setStatus('play'); setBusy(false);
      persist(ng.level, nextStats);
    });
  }, [stats, persist]);

  // --- the tap --------------------------------------------------------------
  const tap = useCallback((i) => {
    if (busy || status !== 'play') return;
    const res = Engine.tap(state, i);
    if (res.result === 'ignored') return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // clean tap, no cascade
    if (!res.bursts.length) {
      setState(res.state);
      setDisplay(res.state.cells);
      if (res.result === 'won') settleWin(res.state);
      return;
    }

    // cascade: animate frame by frame
    setBusy(true);
    res.bursts.forEach((idx, k) => {
      after(k * BURST_STEP, () => setBursting((b) => [...b, idx]));
      after(k * BURST_STEP + BURST_POP, () => {
        setDisplay(res.frames[k].slice());
        Haptics.impactAsync(
          k === res.bursts.length - 1 && res.result === 'lost'
            ? Haptics.ImpactFeedbackStyle.Heavy
            : Haptics.ImpactFeedbackStyle.Medium
        ).catch(() => {});
      });
    });

    const total = (res.bursts.length - 1) * BURST_STEP + BURST_POP + 300;
    after(total, () => {
      setBursting([]);
      setState(res.state);
      setDisplay(res.state.cells);
      setBusy(false);
      if (res.result === 'lost') {
        setStatus('lost');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      } else if (res.result === 'won') {
        settleWin(res.state);
      }
    });
  }, [state, busy, status, settleWin]);

  // --- controls -------------------------------------------------------------
  const retry = useCallback(() => {
    clearTimers();
    const g = Engine.retry(state);
    setState(g); setDisplay(g.cells); setBursting([]); setStatus('play'); setBusy(false);
  }, [state]);

  const restart = useCallback(() => {
    clearTimers();
    const g = Engine.newGame(1);
    setState(g); setDisplay(g.cells); setBursting([]); setStatus('play'); setBusy(false);
    persist(1, stats);
  }, [stats, persist]);

  return {
    state, display, bursting, busy, status, stats,
    tap, retry, restart,
    // rendering hints
    isGreen: (v) => Engine.isGreen(v, state.ratio),
  };
}
