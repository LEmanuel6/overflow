// useCountdown — a wall-clock-anchored countdown, decoupled from useGame
// (this is UI/timer concern, not board state). Only decrements while
// `active` — the daily challenge now keeps this active straight through a
// cascade/wipe (see DailyChallengeScreen), so a big chain reaction eats real
// time off the clock as a penalty, rather than the timer pausing for free
// during the animation. useGame's forceTimeout defers applying an expiry
// that lands mid-animation until the board goes idle, rather than dropping
// it — see useGame.js.
//
// Uses a wall-clock anchor (Date.now() at the start of each active window)
// rather than naive `prev - tickMs` subtraction, so drift from timer
// imprecision can't accumulate over a multi-minute countdown. Ticks via
// requestAnimationFrame rather than a fixed setInterval so the displayed
// number updates as smoothly as the screen can actually show (~60Hz on most
// phones) instead of in visible 100ms steps — genuine 1ms updates would be
// wasted work no display can render anyway.
//
// onExpire is read through a ref, NOT closed over directly, and deliberately
// left out of the effect's dependency array below. The caller's onExpire
// (useGame's forceTimeout) gets a new function identity on nearly every
// render — it closes over `state`, which changes on every tap — so
// depending on it directly re-ran this effect on every tap too: each
// restart re-anchors from Date.now() at the MOMENT OF RESTART, which loses
// whatever real time passed between the previous tick and that restart
// (render + commit time, a RAF frame boundary, etc.) without ever
// subtracting it. That gap is small per-tap but compounds over a multi-
// minute run into a countdown that measurably lags real elapsed time — this
// was found and fixed after exactly that symptom was reported in play.
// Keying the effect on `active` alone means it only restarts when the
// countdown genuinely starts/stops, not on every incidental re-render.

import { useState, useRef, useCallback, useEffect } from 'react';

export function useCountdown(limitMs, { active, onExpire }) {
  const [remainingMs, setRemainingMs] = useState(limitMs);
  const remainingRef = useRef(limitMs);
  const limitRef = useRef(limitMs);   // grows when addTime() grants bonus time
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!active || expiredRef.current) return;
    const anchor = Date.now();
    const anchorRemaining = remainingRef.current;
    let rafId;
    const tick = () => {
      const next = Math.max(0, anchorRemaining - (Date.now() - anchor));
      remainingRef.current = next;
      setRemainingMs(next);
      if (next === 0) {
        if (!expiredRef.current) {
          expiredRef.current = true;
          onExpireRef.current();
        }
        return; // reached zero — stop scheduling further frames
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  const reset = useCallback((newLimitMs = limitMs) => {
    expiredRef.current = false;
    limitRef.current = newLimitMs;
    remainingRef.current = newLimitMs;
    setRemainingMs(newLimitMs);
  }, [limitMs]);

  // Bonus time (e.g. a rewarded "+30s"), also re-arming a countdown that has
  // already expired. Call while `active` is false — the next active window
  // anchors from the updated remaining time.
  const addTime = useCallback((ms) => {
    expiredRef.current = false;
    limitRef.current += ms;
    remainingRef.current += ms;
    setRemainingMs(remainingRef.current);
  }, []);

  // Time actually spent so far — limit minus remaining, where the limit
  // includes any bonus time, so a run finished after an extension isn't
  // reported as faster than it really was.
  const elapsedMs = limitRef.current - remainingMs;

  return { remainingMs, elapsedMs, reset, addTime };
}
