// useDailyStats — persisted results for the daily challenge. Kept fully
// separate from useStats.js's ladder stats: a daily result must never touch
// `best`/streaks/flawless counters there, so this owns its own AsyncStorage
// blob and its own recorder, following the exact same load/persist pattern.
//
// Stats are nested per difficulty (see engine's DAILY_DIFFICULTY_ORDER) —
// Beginner/Intermediate/Expert/Master are effectively separate challenges
// with their own attempt counts, streaks, and best times, since a player may
// only ever touch a subset of them.

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAILY_DIFFICULTY_ORDER } from '../engine';
import { ACHIEVEMENTS } from '../data/achievements';

const STORE_KEY = 'overflow:daily:v1';
const DAYS_RETENTION = 90; // prune per-day entries older than this many days

function makeDefaultDifficultyStats() {
  return {
    totalAttempts: 0,
    totalWins: 0,             // every winning attempt, including same-day retries
    totalLosses: 0,
    daysWon: 0,                // distinct calendar days first-solved — "challenges completed"
    bestTimeMs: null,        // fastest WINNING time, any day, ever
    days: {},                // { [dateStr]: { attempts, won, bestTimeMs, winAttempt } }
  };
}

function makeDefaultDailyStats() {
  return {
    difficulties: Object.fromEntries(DAILY_DIFFICULTY_ORDER.map((id) => [id, makeDefaultDifficultyStats()])),
    unlockedAt: {},           // { [achievementId]: epoch ms } — daily-sourced achievements only (see withDailyUnlocks)
  };
}

// Stamps any daily-sourced achievement that newly passes `check()` with the
// current time. Mirrors useStats.js's withUnlocks exactly, but scoped to
// `source === 'daily'` achievements checked against THIS blob — ladder
// achievements are stamped separately by useStats.js, since neither store
// alone has both datasets. Two independent unlock maps, merged at render
// time (see MenuScreen's "recent achievements" strip).
function withDailyUnlocks(next) {
  let unlockedAt = next.unlockedAt;
  for (const a of ACHIEVEMENTS) {
    if (a.source !== 'daily') continue;
    if (!unlockedAt[a.id] && a.check(next)) {
      if (unlockedAt === next.unlockedAt) unlockedAt = { ...unlockedAt };
      unlockedAt[a.id] = Date.now();
    }
  }
  return unlockedAt === next.unlockedAt ? next : { ...next, unlockedAt };
}

// "Today's puzzle" used to mean the player's own device-local date — but
// Google Play Games' daily-leaderboard "Today" tab resets on its OWN fixed
// schedule (UTC-7, the "Pacific Daylight Time" convention, held year-round
// with no DST shift — confirmed against Play Games' own docs), independent
// of any player's timezone. Those two boundaries used to drift apart by
// several hours depending where a player lives, which could land a score on
// the "wrong" side of the leaderboard's daily reset relative to which
// puzzle the player actually solved. Leon's call: anchor the app's own day
// boundary to that SAME fixed UTC-7 instant instead, everywhere, for every
// player, so the two can never disagree — a deliberate trade of "matches
// each player's own midnight" for "the leaderboard's Today tab always means
// exactly the puzzle it looks like it means." Note this is a FIXED -7
// offset, not real US/Pacific time (which itself shifts to UTC-8 outside
// daylight saving) — matching that shift would reintroduce the exact
// mismatch this exists to remove.
const DAILY_BOUNDARY_OFFSET_HOURS = -7;

export function dailyDateStr(d = new Date()) {
  const shifted = new Date(d.getTime() + DAILY_BOUNDARY_OFFSET_HOURS * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

// Sum of attempts across every difficulty for one calendar day — what the
// Menu screen's entry card shows (it doesn't distinguish which difficulty).
export function totalAttemptsForDay(dailyStats, dateStr) {
  return DAILY_DIFFICULTY_ORDER.reduce(
    (sum, id) => sum + (dailyStats.difficulties[id].days[dateStr]?.attempts || 0),
    0
  );
}

// How many of the (DAILY_DIFFICULTY_ORDER.length) difficulties have been
// solved for one calendar day — the Menu screen's "x/x completed" summary.
export function completedCountForDay(dailyStats, dateStr) {
  return DAILY_DIFFICULTY_ORDER.reduce(
    (count, id) => count + (dailyStats.difficulties[id].days[dateStr]?.won ? 1 : 0),
    0
  );
}

export function useDailyStats() {
  const [dailyStats, setDailyStats] = useState(makeDefaultDailyStats);
  // Mirrors useStats.js's justUnlocked/clearJustUnlocked — a FIFO of
  // daily-sourced achievement ids newly unlocked by a LIVE recordResult call.
  // Detected by comparing dailyStats.unlockedAt across renders (NOT by
  // reading a variable set inside the setDailyStats updater right after
  // calling it — a functional setState updater isn't guaranteed to run
  // synchronously, so that approach silently never fired). See useStats.js
  // for the full rationale, including why the initial-load effect's own
  // change is suppressed (that's backfill, not a moment to toast).
  const [justUnlocked, setJustUnlocked] = useState([]);
  const clearJustUnlocked = useCallback(() => setJustUnlocked([]), []);
  const prevUnlockedAtRef = useRef(makeDefaultDailyStats().unlockedAt);
  const suppressNextUnlockRef = useRef(false);

  useEffect(() => {
    const prevUnlockedAt = prevUnlockedAtRef.current;
    prevUnlockedAtRef.current = dailyStats.unlockedAt;
    if (dailyStats.unlockedAt === prevUnlockedAt) return;
    if (suppressNextUnlockRef.current) { suppressNextUnlockRef.current = false; return; }
    const newIds = Object.keys(dailyStats.unlockedAt).filter((id) => !(id in prevUnlockedAt));
    if (newIds.length) setJustUnlocked((q) => [...q, ...newIds]);
  }, [dailyStats.unlockedAt]);

  const persist = useCallback((next) => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          const defaults = makeDefaultDailyStats();
          suppressNextUnlockRef.current = true;
          setDailyStats(withDailyUnlocks({
            difficulties: Object.fromEntries(
              DAILY_DIFFICULTY_ORDER.map((id) => [id, { ...defaults.difficulties[id], ...saved.difficulties?.[id] }])
            ),
            unlockedAt: { ...defaults.unlockedAt, ...saved.unlockedAt },
          }));
        }
      } catch (e) { /* first run or storage unavailable — defaults stand */ }
    })();
  }, []);

  const recordResult = useCallback((dateStr, difficulty, won, timeMs) => {
    setDailyStats((prev) => {
      const prevDiff = prev.difficulties[difficulty];
      const prevDay = prevDiff.days[dateStr] || { attempts: 0, won: false, bestTimeMs: null, winAttempt: null };
      const nextAttempts = prevDay.attempts + 1;
      const isFirstWin = won && !prevDay.won;
      const dayWon = prevDay.won || won;
      const dayBestTimeMs = won
        ? (prevDay.bestTimeMs == null ? timeMs : Math.min(prevDay.bestTimeMs, timeMs))
        : prevDay.bestTimeMs;
      // Set once, on the attempt that first solved it — later retries (to
      // beat your time) don't change "how many attempts it took to solve".
      const winAttempt = isFirstWin ? nextAttempts : prevDay.winAttempt;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - DAYS_RETENTION);
      const cutoffStr = dailyDateStr(cutoff);
      const nextDays = { ...prevDiff.days, [dateStr]: { attempts: nextAttempts, won: dayWon, bestTimeMs: dayBestTimeMs, winAttempt } };
      for (const key of Object.keys(nextDays)) if (key < cutoffStr) delete nextDays[key];

      const nextDiff = {
        ...prevDiff,
        totalAttempts: prevDiff.totalAttempts + 1,
        totalWins: prevDiff.totalWins + (won ? 1 : 0),
        totalLosses: prevDiff.totalLosses + (won ? 0 : 1),
        daysWon: prevDiff.daysWon + (isFirstWin ? 1 : 0),
        bestTimeMs: won ? (prevDiff.bestTimeMs == null ? timeMs : Math.min(prevDiff.bestTimeMs, timeMs)) : prevDiff.bestTimeMs,
        days: nextDays,
      };
      const next = withDailyUnlocks({ ...prev, difficulties: { ...prev.difficulties, [difficulty]: nextDiff } });
      persist(next);
      return next;
    });
  }, [persist]);

  // Dev-only / user-triggered: wipe daily-challenge history + achievement
  // unlocks back to a blank slate. Mirrors useStats.js's reset().
  const reset = useCallback(() => {
    const fresh = makeDefaultDailyStats();
    setDailyStats(fresh);
    persist(fresh);
    setJustUnlocked([]);
  }, [persist]);

  return { dailyStats, recordResult, reset, justUnlocked, clearJustUnlocked };
}
