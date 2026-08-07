// useDailyStats — persisted results for the daily challenge. Kept fully
// separate from useStats.js's ladder stats: a daily result must never touch
// `best`/streaks/flawless counters there, so this owns its own AsyncStorage
// blob and its own recorder, following the exact same load/persist pattern.
//
// Stats are nested per difficulty (see engine's DAILY_DIFFICULTY_ORDER) —
// Beginner/Intermediate/Expert/Master are effectively separate challenges
// with their own attempt counts, streaks, and best times, since a player may
// only ever touch a subset of them.

import { useState, useEffect, useCallback } from 'react';
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
    currentStreak: 0,        // consecutive calendar days with >=1 win
    bestStreak: 0,
    lastWinDate: null,
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

// "today's puzzle" needs to match the player's actual sense of "today", so
// this uses the LOCAL device date — unlike useStats.js's todayStr(), which
// is UTC and is fine there since it only feeds a background day-streak stat
// nobody checks at a specific hour.
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayBefore(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1);
  return localDateStr(prev);
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

      let { currentStreak, lastWinDate } = prevDiff;
      if (isFirstWin) {
        currentStreak = prevDiff.lastWinDate === dayBefore(dateStr) ? prevDiff.currentStreak + 1 : 1;
        lastWinDate = dateStr;
      }

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - DAYS_RETENTION);
      const cutoffStr = localDateStr(cutoff);
      const nextDays = { ...prevDiff.days, [dateStr]: { attempts: nextAttempts, won: dayWon, bestTimeMs: dayBestTimeMs, winAttempt } };
      for (const key of Object.keys(nextDays)) if (key < cutoffStr) delete nextDays[key];

      const nextDiff = {
        ...prevDiff,
        totalAttempts: prevDiff.totalAttempts + 1,
        totalWins: prevDiff.totalWins + (won ? 1 : 0),
        totalLosses: prevDiff.totalLosses + (won ? 0 : 1),
        daysWon: prevDiff.daysWon + (isFirstWin ? 1 : 0),
        bestTimeMs: won ? (prevDiff.bestTimeMs == null ? timeMs : Math.min(prevDiff.bestTimeMs, timeMs)) : prevDiff.bestTimeMs,
        currentStreak,
        bestStreak: Math.max(prevDiff.bestStreak, currentStreak),
        lastWinDate,
        days: nextDays,
      };
      const next = withDailyUnlocks({ ...prev, difficulties: { ...prev.difficulties, [difficulty]: nextDiff } });
      persist(next);
      return next;
    });
  }, [persist]);

  return { dailyStats, recordResult };
}
