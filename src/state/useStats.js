// useStats — lifetime stats tracking + achievement data source.
//
// Owns one persisted blob of counters/records (AsyncStorage). Achievements
// (src/data/achievements.js) are pure functions of this blob — `unlockedAt`
// is the one exception: every stats update runs `withUnlocks`, which stamps
// the current time onto any achievement whose `check()` just started passing.
// That gives a real order to sort "recently unlocked" by, without a second
// store that could drift out of sync with the achievement definitions.
//
// useGame calls the four recorder functions at the right points in the game
// lifecycle (see boardStarted/tapped/boardLost/boardWon below) — this hook
// doesn't know anything about animation/timing, just outcomes.

import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACHIEVEMENTS } from '../data/achievements';

const STORE_KEY = 'overflow:stats:v1';
const LEGACY_GAME_KEY = 'overflow:v1'; // pre-stats save; migrate best/cleared once if present

const DEFAULT_STATS = {
  best: 1,
  boardsCleared: 0,
  boardsLost: 0,
  gamesPlayed: 0,
  totalTaps: 0,
  totalBursts: 0,
  totalLivesLost: 0,
  totalCascades: 0,
  clearedByTier: {},        // { "3": n, "4": n, ... } keyed by grid size
  highestGridSize: 3,
  bigChainCount: 0,         // number of taps that triggered a 5+ burst cascade
  bestStreak: 0,
  currentStreak: 0,
  flawlessStreak: 0,
  bestFlawlessStreak: 0,
  flawlessClears: 0,
  fewestTapsToClear: null,
  mostLivesRemainingOnClear: 0,
  narrowestWinLives: null,
  bestClearTimeMs: null,
  totalPlaytimeMs: 0,
  sessionsPlayed: 0,
  daysPlayed: [],
  dayStreak: 0,
  bestDayStreak: 0,
  lastPlayedDate: null,
  clearsToday: 0,
  bestDayClears: 0,
  bestSessionMs: 0,
  unlockedAt: {},           // { [achievementId]: epoch ms } — stamped the moment `check()` first passes
};

const PLAYTIME_TICK_MS = 30000;

function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayStr(d);
}

// Stamps any achievement that newly passes `check()` with the current time.
// Called on every stats update so "recently unlocked" has real timestamps to
// sort by, without a separate unlock-state store to keep in sync. Skips
// daily-sourced achievements (source: 'daily') — those are checked against
// the separate dailyStats blob, which this hook doesn't have; useDailyStats.js
// stamps those into its own unlockedAt map instead (see withDailyUnlocks).
function withUnlocks(next) {
  let unlockedAt = next.unlockedAt;
  for (const a of ACHIEVEMENTS) {
    if (a.source === 'daily') continue;
    if (!unlockedAt[a.id] && a.check(next)) {
      if (unlockedAt === next.unlockedAt) unlockedAt = { ...unlockedAt };
      unlockedAt[a.id] = Date.now();
    }
  }
  return unlockedAt === next.unlockedAt ? next : { ...next, unlockedAt };
}

export function useStats() {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const loadedRef = useRef(false);

  // per-board transient trackers — reset by boardStarted(), consumed by
  // boardWon()/boardLost(). Not persisted: if the app is killed mid-board
  // these just reset, which is fine (nothing was won or lost yet).
  const livesLostThisBoardRef = useRef(0);
  const boardStartTimeRef = useRef(Date.now());
  const sessionStartRef = useRef(Date.now());

  const persist = useCallback((next) => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // --- load + session/day bookkeeping ---------------------------------------
  useEffect(() => {
    (async () => {
      let loaded = DEFAULT_STATS;
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) {
          loaded = { ...DEFAULT_STATS, ...JSON.parse(raw) };
        } else {
          // first time the stats store is read — migrate the old best/cleared
          // fields from the pre-stats save, if any, so progress isn't lost.
          const legacyRaw = await AsyncStorage.getItem(LEGACY_GAME_KEY);
          if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw);
            if (legacy.stats) {
              loaded = {
                ...DEFAULT_STATS,
                best: legacy.stats.best || 1,
                boardsCleared: legacy.stats.cleared || 0,
              };
            }
          }
        }
      } catch (e) { /* first run or storage unavailable — defaults stand */ }

      const today = todayStr();
      let dayStreak = loaded.dayStreak;
      let daysPlayed = loaded.daysPlayed;
      let clearsToday = loaded.clearsToday;
      if (loaded.lastPlayedDate !== today) {
        dayStreak = loaded.lastPlayedDate === yesterdayStr() ? loaded.dayStreak + 1 : 1;
        daysPlayed = [...loaded.daysPlayed, today].slice(-400);
        clearsToday = 0;
      }
      const next = withUnlocks({
        ...loaded,
        sessionsPlayed: loaded.sessionsPlayed + 1,
        lastPlayedDate: today,
        dayStreak,
        daysPlayed,
        clearsToday,
        bestDayStreak: Math.max(loaded.bestDayStreak, dayStreak),
      });
      loadedRef.current = true;
      setStats(next);
      persist(next);
    })();
  }, [persist]);

  // --- approximate playtime: tick while the hook is mounted -----------------
  useEffect(() => {
    const iv = setInterval(() => {
      setStats((prev) => {
        const sessionElapsedMs = Date.now() - sessionStartRef.current;
        const next = {
          ...prev,
          totalPlaytimeMs: prev.totalPlaytimeMs + PLAYTIME_TICK_MS,
          bestSessionMs: Math.max(prev.bestSessionMs, sessionElapsedMs),
        };
        persist(next);
        return next;
      });
    }, PLAYTIME_TICK_MS);
    return () => clearInterval(iv);
  }, [persist]);

  // --- recorders, called by useGame at the right lifecycle points -----------
  const boardStarted = useCallback(() => {
    livesLostThisBoardRef.current = 0;
    boardStartTimeRef.current = Date.now();
  }, []);

  // Dev-only: wipe lifetime stats + achievement unlocks back to a blank slate.
  const reset = useCallback(() => {
    livesLostThisBoardRef.current = 0;
    setStats(DEFAULT_STATS);
    persist(DEFAULT_STATS);
  }, [persist]);

  const tapped = useCallback(({ bursts, livesLost }) => {
    livesLostThisBoardRef.current += livesLost;

    setStats((prev) => {
      const next = withUnlocks({
        ...prev,
        totalTaps: prev.totalTaps + 1,
        totalBursts: prev.totalBursts + bursts.length,
        totalCascades: prev.totalCascades + (bursts.length > 0 ? 1 : 0),
        totalLivesLost: prev.totalLivesLost + livesLost,
        bigChainCount: prev.bigChainCount + (bursts.length >= 5 ? 1 : 0),
      });
      persist(next);
      return next;
    });
  }, [persist]);

  const boardLost = useCallback(() => {
    setStats((prev) => {
      const next = withUnlocks({
        ...prev,
        boardsLost: prev.boardsLost + 1,
        gamesPlayed: prev.gamesPlayed + 1,
        currentStreak: 0,
        flawlessStreak: 0,
      });
      persist(next);
      return next;
    });
  }, [persist]);

  const boardWon = useCallback(({ level, n, taps, lives }) => {
    const livesLostThisBoard = livesLostThisBoardRef.current;
    const elapsedMs = Date.now() - boardStartTimeRef.current;

    setStats((prev) => {
      const tierKey = String(n);
      const nextStreak = prev.currentStreak + 1;
      const nextFlawlessStreak = livesLostThisBoard === 0 ? prev.flawlessStreak + 1 : 0;
      const nextClearsToday = prev.clearsToday + 1;
      const next = withUnlocks({
        ...prev,
        best: Math.max(prev.best, level + 1),
        clearsToday: nextClearsToday,
        bestDayClears: Math.max(prev.bestDayClears, nextClearsToday),
        boardsCleared: prev.boardsCleared + 1,
        gamesPlayed: prev.gamesPlayed + 1,
        clearedByTier: { ...prev.clearedByTier, [tierKey]: (prev.clearedByTier[tierKey] || 0) + 1 },
        highestGridSize: Math.max(prev.highestGridSize, n),
        currentStreak: nextStreak,
        bestStreak: Math.max(prev.bestStreak, nextStreak),
        flawlessStreak: nextFlawlessStreak,
        bestFlawlessStreak: Math.max(prev.bestFlawlessStreak, nextFlawlessStreak),
        flawlessClears: prev.flawlessClears + (livesLostThisBoard === 0 ? 1 : 0),
        fewestTapsToClear: prev.fewestTapsToClear == null ? taps : Math.min(prev.fewestTapsToClear, taps),
        mostLivesRemainingOnClear: Math.max(prev.mostLivesRemainingOnClear, lives),
        narrowestWinLives: prev.narrowestWinLives == null ? lives : Math.min(prev.narrowestWinLives, lives),
        bestClearTimeMs: prev.bestClearTimeMs == null ? elapsedMs : Math.min(prev.bestClearTimeMs, elapsedMs),
      });
      persist(next);
      return next;
    });
  }, [persist]);

  return { stats, boardStarted, tapped, boardLost, boardWon, reset };
}
