// useStats — lifetime stats tracking + achievement data source.
//
// Owns one persisted blob of counters/records (AsyncStorage). Achievements
// (src/data/achievements.js) are pure functions of this blob — `unlockedAt`
// is the one exception: every stats update runs `withUnlocks`, which stamps
// the current time onto any achievement whose `check()` just started passing.
// That gives a real order to sort "recently unlocked" by, without a second
// store that could drift out of sync with the achievement definitions.
//
// useGame calls the recorder functions at the right points in the game
// lifecycle (see tapped/boardLost/boardWon below) — this hook doesn't know
// anything about animation/timing, just outcomes.
//
// boardWon/boardLost take an explicit `trackLadder` flag from the caller
// rather than assuming every call is from the ladder — the daily challenge
// (see DailyChallengeScreen) also reports taps and board outcomes here, so
// the general lifetime counters (totalTaps,
// boardsCleared, flawlessClears, etc. — what most achievements actually
// read) grow from EITHER mode, while ladder-only concepts (best level, win
// streaks) only ever move from the ladder's own calls. Per-board transient
// tracking (lives lost so far this attempt, when this attempt started) used
// to live here as module-shared refs, but that only worked by accident: the
// ladder's useGame instance stays mounted for the whole app session
// regardless of which screen is visible, so a daily board's taps/timing
// would have corrupted whatever ladder board happened to be in progress.
// That tracking now lives in useGame.js instead, one private copy per
// instance, and is passed in here explicitly (livesLostThisBoard, elapsedMs).

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
  // FIFO of achievement ids newly unlocked by a LIVE update (a tap, a win, a
  // loss) — detected below by comparing stats.unlockedAt across renders, NOT
  // by reading a variable set inside the setStats updater right after
  // calling it (a functional setState updater isn't guaranteed to run
  // synchronously — React can defer it to the actual render pass — so that
  // approach silently never fired). suppressNextUnlockRef skips the one
  // unlockedAt change caused by the initial-load effect's own reconciliation
  // (which can "newly" stamp an achievement that was actually earned in a
  // past session) — that's backfill, not a moment to toast. App.js drains
  // this into its own toast queue (see useAchievementToastQueue) and calls
  // clearJustUnlocked after.
  const [justUnlocked, setJustUnlocked] = useState([]);
  const clearJustUnlocked = useCallback(() => setJustUnlocked([]), []);
  const prevUnlockedAtRef = useRef(DEFAULT_STATS.unlockedAt);
  const suppressNextUnlockRef = useRef(false);
  const loadedRef = useRef(false);
  const sessionStartRef = useRef(Date.now());

  useEffect(() => {
    const prevUnlockedAt = prevUnlockedAtRef.current;
    prevUnlockedAtRef.current = stats.unlockedAt;
    if (stats.unlockedAt === prevUnlockedAt) return;
    if (suppressNextUnlockRef.current) { suppressNextUnlockRef.current = false; return; }
    const newIds = Object.keys(stats.unlockedAt).filter((id) => !(id in prevUnlockedAt));
    if (newIds.length) setJustUnlocked((q) => [...q, ...newIds]);
  }, [stats.unlockedAt]);

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
      suppressNextUnlockRef.current = true;
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

  // Dev-only: wipe lifetime stats + achievement unlocks back to a blank slate.
  const reset = useCallback(() => {
    setStats(DEFAULT_STATS);
    persist(DEFAULT_STATS);
    setJustUnlocked([]);
  }, [persist]);

  // Taps/bursts/chain-reactions are general skill stats (what the Taps and
  // Chain Reaction achievements read) — counted the same way regardless of
  // which mode reported them.
  const tapped = useCallback(({ bursts, livesLost }) => {
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

  // `trackLadder` (default true, preserving today's ladder behaviour exactly)
  // gates the LADDER-ONLY fields: win streaks and flawless-streak (both
  // meaningless for a one-board-per-day daily attempt — see the Hud "Streak"
  // removal), and the ladder's `best` level (daily has no level number at
  // all). Everything else here is a general lifetime counter the daily
  // challenge also feeds (with trackLadder: false), via DailyChallengeScreen.
  const boardLost = useCallback(({ trackLadder = true } = {}) => {
    setStats((prev) => {
      let patch = {
        boardsLost: prev.boardsLost + 1,
        gamesPlayed: prev.gamesPlayed + 1,
      };
      if (trackLadder) patch = { ...patch, currentStreak: 0, flawlessStreak: 0 };
      const next = withUnlocks({ ...prev, ...patch });
      persist(next);
      return next;
    });
  }, [persist]);

  // `livesLostThisBoard`/`elapsedMs` are supplied by the caller (see
  // useGame.js) rather than read off a ref owned here — see the file-top
  // comment for why that tracking moved out of this hook.
  const boardWon = useCallback(({ level, n, taps, lives, livesLostThisBoard, elapsedMs, trackLadder = true }) => {
    setStats((prev) => {
      const tierKey = String(n);
      const flawless = livesLostThisBoard === 0;
      const nextClearsToday = prev.clearsToday + 1;
      let patch = {
        clearsToday: nextClearsToday,
        bestDayClears: Math.max(prev.bestDayClears, nextClearsToday),
        boardsCleared: prev.boardsCleared + 1,
        gamesPlayed: prev.gamesPlayed + 1,
        clearedByTier: { ...prev.clearedByTier, [tierKey]: (prev.clearedByTier[tierKey] || 0) + 1 },
        highestGridSize: Math.max(prev.highestGridSize, n),
        flawlessClears: prev.flawlessClears + (flawless ? 1 : 0),
        fewestTapsToClear: prev.fewestTapsToClear == null ? taps : Math.min(prev.fewestTapsToClear, taps),
        mostLivesRemainingOnClear: Math.max(prev.mostLivesRemainingOnClear, lives),
        narrowestWinLives: prev.narrowestWinLives == null ? lives : Math.min(prev.narrowestWinLives, lives),
        bestClearTimeMs: prev.bestClearTimeMs == null ? elapsedMs : Math.min(prev.bestClearTimeMs, elapsedMs),
      };
      if (trackLadder) {
        const nextStreak = prev.currentStreak + 1;
        const nextFlawlessStreak = flawless ? prev.flawlessStreak + 1 : 0;
        patch = {
          ...patch,
          best: Math.max(prev.best, level + 1),
          currentStreak: nextStreak,
          bestStreak: Math.max(prev.bestStreak, nextStreak),
          flawlessStreak: nextFlawlessStreak,
          bestFlawlessStreak: Math.max(prev.bestFlawlessStreak, nextFlawlessStreak),
        };
      }
      const next = withUnlocks({ ...prev, ...patch });
      persist(next);
      return next;
    });
  }, [persist]);

  return { stats, tapped, boardLost, boardWon, reset, justUnlocked, clearJustUnlocked };
}
