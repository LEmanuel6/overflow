// useCountdown — a wall-clock-anchored countdown, decoupled from useGame
// (this is UI/timer concern, not board state). Only decrements while
// `active`, so it can never expire mid-animation if the caller gates
// `active` on the same "is the board idle" condition it uses elsewhere (e.g.
// the daily challenge gates on `!busy`) — the timer simply pauses for the
// duration a cascade/wipe/reveal is playing and resumes once idle.
//
// Uses a wall-clock anchor (Date.now() at the start of each active window)
// rather than naive `prev - tickMs` subtraction, so drift from setTimeout
// imprecision can't accumulate over a multi-minute countdown.

import { useState, useRef, useCallback, useEffect } from 'react';

const TICK_MS = 100;

export function useCountdown(limitMs, { active, onExpire }) {
  const [remainingMs, setRemainingMs] = useState(limitMs);
  const remainingRef = useRef(limitMs);
  const limitRef = useRef(limitMs);   // grows when addTime() grants bonus time
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!active || expiredRef.current) return;
    const anchor = Date.now();
    const anchorRemaining = remainingRef.current;
    const iv = setInterval(() => {
      const next = Math.max(0, anchorRemaining - (Date.now() - anchor));
      remainingRef.current = next;
      setRemainingMs(next);
      if (next === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [active, onExpire]);

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
