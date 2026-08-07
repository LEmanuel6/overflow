// Achievement definitions. Every achievement is a pure function of the
// persisted stats blob (see useStats.js) — there's no separate "unlocked"
// store to desync, and removing/adding one is just editing this array.
//
// `icon` is an Ionicons name (@expo/vector-icons) — verified against the
// installed glyph map, not just typed from memory.
//
// `progress`, where present, returns { current, target } for a progress bar
// on locked achievements. Omit it for one-off/boolean achievements where a
// fraction wouldn't mean much (e.g. "win on your last life").
//
// `format`, where present, overrides progress text for non-count metrics
// (e.g. durations, "1h 30m / 10h"). Omit it for a bare "3/5" — the
// surrounding title/description already say what's being counted.
//
// `track`, where present, groups achievements that are tiers of the same
// underlying metric (e.g. level milestones) into a single ladder — the
// Achievements screen collapses each track into one row showing progress
// toward its next tier, tappable through to the full ladder. See
// `TRACK_META` and `groupForDisplay` below. Achievements without a `track`
// render as standalone cards, unchanged.
//
// `source`, where present, is 'daily' for achievements checked against the
// daily-challenge stats blob (see useDailyStats.js) instead of the ladder
// stats blob (useStats.js) — the two are separate persisted stores, so every
// caller of `check`/`progress` has to know which blob to pass. Omit for
// ladder achievements (the default/majority case).

import { formatDuration } from '../utils/format';
import { DAILY_DIFFICULTY_ORDER, DAILY_DIFFICULTIES } from '../engine';

const formatMs = (current, target) => `${formatDuration(current)} / ${formatDuration(target)}`;

// Total distinct-day completions across every difficulty — "how many daily
// challenges have you actually solved", not raw winning attempts (a same-day
// retry to beat your own time doesn't count again).
function totalDailyDaysWon(d) {
  return DAILY_DIFFICULTY_ORDER.reduce((sum, id) => sum + d.difficulties[id].daysWon, 0);
}

// One track per difficulty (daily-beginner, daily-intermediate, ...) is a
// clean, mechanical 4-difficulty x 7-tier grid — generated rather than
// hand-duplicated 28 times, unlike the rest of this file where each entry
// genuinely differs. Tier titles avoid the difficulty names themselves
// (Beginner/Intermediate/Expert/Master) so e.g. "Expert" the difficulty never
// collides with a tier title also called "Expert".
const DAILY_TIER_ICONS = { beginner: 'footsteps-outline', intermediate: 'flag-outline', expert: 'flame-outline', master: 'skull-outline' };
const DAILY_TIER_TITLES = { 1: 'Starter', 10: 'Regular', 25: 'Veteran', 50: 'Ace', 100: 'Champion', 200: 'Grandmaster', 500: 'Legend' };
const dailyPerDifficultyAchievements = DAILY_DIFFICULTY_ORDER.flatMap((id) => {
  const label = DAILY_DIFFICULTIES[id].label;
  return [1, 10, 25, 50, 100, 200, 500].map((n) => ({
    id: `daily-${id}-${n}`,
    category: 'Daily Challenges',
    title: `${label} ${DAILY_TIER_TITLES[n]}`,
    description: `Complete the ${label} daily challenge ${n === 1 ? 'once' : `${n} times`}.`,
    icon: DAILY_TIER_ICONS[id],
    source: 'daily',
    track: `daily-${id}`,
    check: (d) => d.difficulties[id].daysWon >= n,
    progress: (d) => ({ current: Math.min(d.difficulties[id].daysWon, n), target: n }),
  }));
});

export const ACHIEVEMENTS = [
  // --- Milestones (track: levels) -----------------------------------------
  { id: 'first-steps', category: 'Milestones', title: 'First Steps', description: 'Clear level 1.', icon: 'footsteps-outline',
    track: 'levels', check: (s) => s.best > 1, progress: (s) => ({ current: Math.min(s.best - 1, 1), target: 1 }) },
  { id: 'level-10', category: 'Milestones', title: 'Warming Up', description: 'Clear level 10.', icon: 'flag-outline',
    track: 'levels', check: (s) => s.best > 10, progress: (s) => ({ current: Math.min(s.best - 1, 10), target: 10 }) },
  { id: 'level-25', category: 'Milestones', title: 'Quarter Century', description: 'Clear level 25.', icon: 'ribbon-outline',
    track: 'levels', check: (s) => s.best > 25, progress: (s) => ({ current: Math.min(s.best - 1, 25), target: 25 }) },
  { id: 'level-50', category: 'Milestones', title: 'Half a Hundred', description: 'Clear level 50.', icon: 'medal-outline',
    track: 'levels', check: (s) => s.best > 50, progress: (s) => ({ current: Math.min(s.best - 1, 50), target: 50 }) },
  { id: 'level-100', category: 'Milestones', title: 'Century Club', description: 'Clear level 100.', icon: 'trophy-outline',
    track: 'levels', check: (s) => s.best > 100, progress: (s) => ({ current: Math.min(s.best - 1, 100), target: 100 }) },
  { id: 'level-200', category: 'Milestones', title: 'Deep Run', description: 'Clear level 200.', icon: 'diamond-outline',
    track: 'levels', check: (s) => s.best > 200, progress: (s) => ({ current: Math.min(s.best - 1, 200), target: 200 }) },
  { id: 'level-500', category: 'Milestones', title: 'Marathon Runner', description: 'Clear level 500.', icon: 'star-outline',
    track: 'levels', check: (s) => s.best > 500, progress: (s) => ({ current: Math.min(s.best - 1, 500), target: 500 }) },
  { id: 'level-1000', category: 'Milestones', title: 'Millennium', description: 'Clear level 1000.', icon: 'planet-outline',
    track: 'levels', check: (s) => s.best > 1000, progress: (s) => ({ current: Math.min(s.best - 1, 1000), target: 1000 }) },
  { id: 'level-2000', category: 'Milestones', title: 'Galactic', description: 'Clear level 2000.', icon: 'telescope-outline',
    track: 'levels', check: (s) => s.best > 2000, progress: (s) => ({ current: Math.min(s.best - 1, 2000), target: 2000 }) },
  { id: 'level-5000', category: 'Milestones', title: 'Cosmic Voyager', description: 'Clear level 5000.', icon: 'earth-outline',
    track: 'levels', check: (s) => s.best > 5000, progress: (s) => ({ current: Math.min(s.best - 1, 5000), target: 5000 }) },
  { id: 'level-10000', category: 'Milestones', title: 'Infinity', description: 'Clear level 10000.', icon: 'infinite-outline',
    track: 'levels', check: (s) => s.best > 10000, progress: (s) => ({ current: Math.min(s.best - 1, 10000), target: 10000 }) },

  // --- Grid sizes (track: grid-sizes) -------------------------------------
  { id: 'tier-4x4', category: 'Grid Sizes', title: '4×4 Cleared', description: 'Clear a 4×4 board.', icon: 'grid-outline',
    track: 'grid-sizes', check: (s) => (s.clearedByTier['4'] || 0) > 0, progress: (s) => ({ current: Math.min(s.highestGridSize, 4), target: 4 }) },
  { id: 'tier-5x5', category: 'Grid Sizes', title: '5×5 Cleared', description: 'Clear a 5×5 board.', icon: 'grid-outline',
    track: 'grid-sizes', check: (s) => (s.clearedByTier['5'] || 0) > 0, progress: (s) => ({ current: Math.min(s.highestGridSize, 5), target: 5 }) },
  { id: 'tier-6x6', category: 'Grid Sizes', title: '6×6 Cleared', description: 'Clear a 6×6 board.', icon: 'grid-outline',
    track: 'grid-sizes', check: (s) => (s.clearedByTier['6'] || 0) > 0, progress: (s) => ({ current: Math.min(s.highestGridSize, 6), target: 6 }) },
  { id: 'tier-7x7', category: 'Grid Sizes', title: '7×7 Cleared', description: 'Clear a 7×7 board.', icon: 'grid-outline',
    track: 'grid-sizes', check: (s) => (s.clearedByTier['7'] || 0) > 0, progress: (s) => ({ current: Math.min(s.highestGridSize, 7), target: 7 }) },
  { id: 'tier-8x8', category: 'Grid Sizes', title: '8×8 Cleared', description: 'Clear an 8×8 board.', icon: 'grid-outline',
    track: 'grid-sizes', check: (s) => (s.clearedByTier['8'] || 0) > 0, progress: (s) => ({ current: Math.min(s.highestGridSize, 8), target: 8 }) },
  { id: 'tier-9x9', category: 'Grid Sizes', title: '9×9 Cleared', description: 'Clear a 9×9 board.', icon: 'grid-outline',
    track: 'grid-sizes', check: (s) => (s.clearedByTier['9'] || 0) > 0, progress: (s) => ({ current: Math.min(s.highestGridSize, 9), target: 9 }) },

  // --- Skill ---------------------------------------------------------------
  { id: 'flawless', category: 'Skill', title: 'Flawless', description: 'Clear a board without losing a life.', icon: 'shield-checkmark-outline',
    track: 'flawless', check: (s) => s.flawlessClears > 0, progress: (s) => ({ current: Math.min(s.flawlessClears, 1), target: 1 }) },
  { id: 'perfectionist', category: 'Skill', title: 'Perfectionist', description: 'Clear 10 boards flawlessly.', icon: 'sparkles-outline',
    track: 'flawless', check: (s) => s.flawlessClears >= 10, progress: (s) => ({ current: Math.min(s.flawlessClears, 10), target: 10 }) },
  { id: 'immaculate', category: 'Skill', title: 'Immaculate', description: 'Clear 50 boards flawlessly.', icon: 'trophy-outline',
    track: 'flawless', check: (s) => s.flawlessClears >= 50, progress: (s) => ({ current: Math.min(s.flawlessClears, 50), target: 50 }) },
  { id: 'pristine', category: 'Skill', title: 'Pristine', description: 'Clear 100 boards flawlessly.', icon: 'diamond-outline',
    track: 'flawless', check: (s) => s.flawlessClears >= 100, progress: (s) => ({ current: Math.min(s.flawlessClears, 100), target: 100 }) },
  { id: 'flawless-victory', category: 'Skill', title: 'Flawless Victory', description: 'Clear 200 boards flawlessly.', icon: 'prism-outline',
    track: 'flawless', check: (s) => s.flawlessClears >= 200, progress: (s) => ({ current: Math.min(s.flawlessClears, 200), target: 200 }) },
  { id: 'perfection-incarnate', category: 'Skill', title: 'Perfection Incarnate', description: 'Clear 500 boards flawlessly.', icon: 'star-outline',
    track: 'flawless', check: (s) => s.flawlessClears >= 500, progress: (s) => ({ current: Math.min(s.flawlessClears, 500), target: 500 }) },
  { id: 'nail-biter', category: 'Skill', title: 'Nail-Biter', description: 'Win a board on your last life.', icon: 'heart-outline',
    check: (s) => s.narrowestWinLives === 1 },
  { id: 'chain-reaction', category: 'Skill', title: 'Chain Reaction', description: 'Trigger a cascade of 5+ bursts from one tap.', icon: 'link-outline',
    track: 'chains', check: (s) => s.bigChainCount >= 1, progress: (s) => ({ current: Math.min(s.bigChainCount, 1), target: 1 }) },
  { id: 'domino-effect', category: 'Skill', title: 'Domino Effect', description: 'Trigger a 5+ chain 10 times.', icon: 'layers-outline',
    track: 'chains', check: (s) => s.bigChainCount >= 10, progress: (s) => ({ current: Math.min(s.bigChainCount, 10), target: 10 }) },
  { id: 'overload', category: 'Skill', title: 'Overload', description: 'Trigger a 5+ chain 25 times.', icon: 'thunderstorm-outline',
    track: 'chains', check: (s) => s.bigChainCount >= 25, progress: (s) => ({ current: Math.min(s.bigChainCount, 25), target: 25 }) },
  { id: 'meltdown', category: 'Skill', title: 'Meltdown', description: 'Trigger a 5+ chain 50 times.', icon: 'flash-outline',
    track: 'chains', check: (s) => s.bigChainCount >= 50, progress: (s) => ({ current: Math.min(s.bigChainCount, 50), target: 50 }) },
  { id: 'cataclysm', category: 'Skill', title: 'Cataclysm', description: 'Trigger a 5+ chain 100 times.', icon: 'nuclear-outline',
    track: 'chains', check: (s) => s.bigChainCount >= 100, progress: (s) => ({ current: Math.min(s.bigChainCount, 100), target: 100 }) },
  { id: 'iron-will', category: 'Skill', title: 'Iron Will', description: 'Win 5 boards in a row without losing a life on any of them.', icon: 'barbell-outline',
    check: (s) => s.bestFlawlessStreak >= 5, progress: (s) => ({ current: Math.min(s.bestFlawlessStreak, 5), target: 5 }) },

  // --- Volume (tracks: taps, boards) ---------------------------------------
  { id: 'taps-100', category: 'Volume', title: 'Tapping Away', description: 'Make 100 taps.', icon: 'finger-print-outline',
    track: 'taps', check: (s) => s.totalTaps >= 100, progress: (s) => ({ current: Math.min(s.totalTaps, 100), target: 100 }) },
  { id: 'taps-1000', category: 'Volume', title: 'Tap Machine', description: 'Make 1,000 taps.', icon: 'hand-left-outline',
    track: 'taps', check: (s) => s.totalTaps >= 1000, progress: (s) => ({ current: Math.min(s.totalTaps, 1000), target: 1000 }) },
  { id: 'taps-10000', category: 'Volume', title: 'Relentless', description: 'Make 10,000 taps.', icon: 'flash-outline',
    track: 'taps', check: (s) => s.totalTaps >= 10000, progress: (s) => ({ current: Math.min(s.totalTaps, 10000), target: 10000 }) },
  { id: 'taps-50000', category: 'Volume', title: 'Tap Dynasty', description: 'Make 50,000 taps.', icon: 'trending-up-outline',
    track: 'taps', check: (s) => s.totalTaps >= 50000, progress: (s) => ({ current: Math.min(s.totalTaps, 50000), target: 50000 }) },
  { id: 'taps-100000', category: 'Volume', title: 'Tap Titan', description: 'Make 100,000 taps.', icon: 'hammer-outline',
    track: 'taps', check: (s) => s.totalTaps >= 100000, progress: (s) => ({ current: Math.min(s.totalTaps, 100000), target: 100000 }) },
  { id: 'taps-500000', category: 'Volume', title: 'Tap Overlord', description: 'Make 500,000 taps.', icon: 'nuclear-outline',
    track: 'taps', check: (s) => s.totalTaps >= 500000, progress: (s) => ({ current: Math.min(s.totalTaps, 500000), target: 500000 }) },
  { id: 'taps-1000000', category: 'Volume', title: 'Millionth Tap', description: 'Make 1,000,000 taps.', icon: 'infinite-outline',
    track: 'taps', check: (s) => s.totalTaps >= 1000000, progress: (s) => ({ current: Math.min(s.totalTaps, 1000000), target: 1000000 }) },
  { id: 'boards-50', category: 'Volume', title: 'Board Clearer', description: 'Clear 50 boards.', icon: 'checkmark-done-outline',
    track: 'boards', check: (s) => s.boardsCleared >= 50, progress: (s) => ({ current: Math.min(s.boardsCleared, 50), target: 50 }) },
  { id: 'boards-100', category: 'Volume', title: 'Board Crusher', description: 'Clear 100 boards.', icon: 'checkmark-done-circle-outline',
    track: 'boards', check: (s) => s.boardsCleared >= 100, progress: (s) => ({ current: Math.min(s.boardsCleared, 100), target: 100 }) },
  { id: 'boards-500', category: 'Volume', title: 'Board Annihilator', description: 'Clear 500 boards.', icon: 'infinite-outline',
    track: 'boards', check: (s) => s.boardsCleared >= 500, progress: (s) => ({ current: Math.min(s.boardsCleared, 500), target: 500 }) },
  { id: 'boards-1000', category: 'Volume', title: 'Board Legend', description: 'Clear 1,000 boards.', icon: 'podium-outline',
    track: 'boards', check: (s) => s.boardsCleared >= 1000, progress: (s) => ({ current: Math.min(s.boardsCleared, 1000), target: 1000 }) },
  { id: 'boards-2000', category: 'Volume', title: 'Board Overlord', description: 'Clear 2,000 boards.', icon: 'globe-outline',
    track: 'boards', check: (s) => s.boardsCleared >= 2000, progress: (s) => ({ current: Math.min(s.boardsCleared, 2000), target: 2000 }) },
  { id: 'boards-5000', category: 'Volume', title: 'Board Deity', description: 'Clear 5,000 boards.', icon: 'sparkles-outline',
    track: 'boards', check: (s) => s.boardsCleared >= 5000, progress: (s) => ({ current: Math.min(s.boardsCleared, 5000), target: 5000 }) },
  { id: 'boards-10000', category: 'Volume', title: 'Board Eternal', description: 'Clear 10,000 boards.', icon: 'infinite-outline',
    track: 'boards', check: (s) => s.boardsCleared >= 10000, progress: (s) => ({ current: Math.min(s.boardsCleared, 10000), target: 10000 }) },

  // --- Streaks (track: streaks) ---------------------------------------------
  { id: 'streak-5', category: 'Streaks', title: 'On a Roll', description: 'Win 5 boards in a row.', icon: 'flame-outline',
    track: 'streaks', check: (s) => s.bestStreak >= 5, progress: (s) => ({ current: Math.min(s.bestStreak, 5), target: 5 }) },
  { id: 'streak-10', category: 'Streaks', title: 'Unstoppable', description: 'Win 10 boards in a row.', icon: 'flash-outline',
    track: 'streaks', check: (s) => s.bestStreak >= 10, progress: (s) => ({ current: Math.min(s.bestStreak, 10), target: 10 }) },
  { id: 'streak-25', category: 'Streaks', title: 'Legendary', description: 'Win 25 boards in a row.', icon: 'rocket-outline',
    track: 'streaks', check: (s) => s.bestStreak >= 25, progress: (s) => ({ current: Math.min(s.bestStreak, 25), target: 25 }) },
  { id: 'streak-50', category: 'Streaks', title: 'Untouchable', description: 'Win 50 boards in a row.', icon: 'star-outline',
    track: 'streaks', check: (s) => s.bestStreak >= 50, progress: (s) => ({ current: Math.min(s.bestStreak, 50), target: 50 }) },

  // --- Dedication (tracks: days-played, day-streak, playtime) --------------
  { id: 'days-7', category: 'Dedication', title: 'Regular', description: 'Play on 7 different days.', icon: 'calendar-outline',
    track: 'days-played', check: (s) => s.daysPlayed.length >= 7, progress: (s) => ({ current: Math.min(s.daysPlayed.length, 7), target: 7 }) },
  { id: 'days-30', category: 'Dedication', title: 'Habit Formed', description: 'Play on 30 different days.', icon: 'calendar-outline',
    track: 'days-played', check: (s) => s.daysPlayed.length >= 30, progress: (s) => ({ current: Math.min(s.daysPlayed.length, 30), target: 30 }) },
  { id: 'days-100', category: 'Dedication', title: 'Centurion', description: 'Play on 100 different days.', icon: 'trophy-outline',
    track: 'days-played', check: (s) => s.daysPlayed.length >= 100, progress: (s) => ({ current: Math.min(s.daysPlayed.length, 100), target: 100 }) },

  { id: 'daystreak-3', category: 'Dedication', title: 'Three in a Row', description: 'Play 3 days in a row.', icon: 'flame-outline',
    track: 'day-streak', check: (s) => s.bestDayStreak >= 3, progress: (s) => ({ current: Math.min(s.bestDayStreak, 3), target: 3 }) },
  { id: 'daystreak-7', category: 'Dedication', title: 'Weekly Ritual', description: 'Play 7 days in a row.', icon: 'flame-outline',
    track: 'day-streak', check: (s) => s.bestDayStreak >= 7, progress: (s) => ({ current: Math.min(s.bestDayStreak, 7), target: 7 }) },
  { id: 'daystreak-30', category: 'Dedication', title: 'Monthly Devotion', description: 'Play 30 days in a row.', icon: 'moon-outline',
    track: 'day-streak', check: (s) => s.bestDayStreak >= 30, progress: (s) => ({ current: Math.min(s.bestDayStreak, 30), target: 30 }) },
  { id: 'daystreak-90', category: 'Dedication', title: 'Quarterly Devotion', description: 'Play 90 days in a row.', icon: 'sunny-outline',
    track: 'day-streak', check: (s) => s.bestDayStreak >= 90, progress: (s) => ({ current: Math.min(s.bestDayStreak, 90), target: 90 }) },
  { id: 'daystreak-150', category: 'Dedication', title: 'Unbreakable', description: 'Play 150 days in a row.', icon: 'snow-outline',
    track: 'day-streak', check: (s) => s.bestDayStreak >= 150, progress: (s) => ({ current: Math.min(s.bestDayStreak, 150), target: 150 }) },
  { id: 'daystreak-365', category: 'Dedication', title: 'Full Year', description: 'Play 365 days in a row.', icon: 'earth-outline',
    track: 'day-streak', check: (s) => s.bestDayStreak >= 365, progress: (s) => ({ current: Math.min(s.bestDayStreak, 365), target: 365 }) },

  { id: 'playtime-1h', category: 'Dedication', title: 'Getting Comfortable', description: 'Play for a total of 1 hour.', icon: 'time-outline',
    track: 'playtime', format: formatMs, check: (s) => s.totalPlaytimeMs >= 3600000, progress: (s) => ({ current: Math.min(s.totalPlaytimeMs, 3600000), target: 3600000 }) },
  { id: 'playtime-10h', category: 'Dedication', title: 'Invested', description: 'Play for a total of 10 hours.', icon: 'hourglass-outline',
    track: 'playtime', format: formatMs, check: (s) => s.totalPlaytimeMs >= 36000000, progress: (s) => ({ current: Math.min(s.totalPlaytimeMs, 36000000), target: 36000000 }) },
  { id: 'playtime-50h', category: 'Dedication', title: 'Overflow Addict', description: 'Play for a total of 50 hours.', icon: 'flame-outline',
    track: 'playtime', format: formatMs, check: (s) => s.totalPlaytimeMs >= 180000000, progress: (s) => ({ current: Math.min(s.totalPlaytimeMs, 180000000), target: 180000000 }) },
  { id: 'playtime-100h', category: 'Dedication', title: 'Devoted', description: 'Play for a total of 100 hours.', icon: 'medal-outline',
    track: 'playtime', format: formatMs, check: (s) => s.totalPlaytimeMs >= 360000000, progress: (s) => ({ current: Math.min(s.totalPlaytimeMs, 360000000), target: 360000000 }) },
  { id: 'playtime-200h', category: 'Dedication', title: 'No Life', description: 'Play for a total of 200 hours.', icon: 'skull-outline',
    track: 'playtime', format: formatMs, check: (s) => s.totalPlaytimeMs >= 720000000, progress: (s) => ({ current: Math.min(s.totalPlaytimeMs, 720000000), target: 720000000 }) },
  { id: 'playtime-500h', category: 'Dedication', title: 'Time Lord', description: 'Play for a total of 500 hours.', icon: 'planet-outline',
    track: 'playtime', format: formatMs, check: (s) => s.totalPlaytimeMs >= 1800000000, progress: (s) => ({ current: Math.min(s.totalPlaytimeMs, 1800000000), target: 1800000000 }) },
  { id: 'playtime-1000h', category: 'Dedication', title: 'Eternal Player', description: 'Play for a total of 1000 hours.', icon: 'infinite-outline',
    track: 'playtime', format: formatMs, check: (s) => s.totalPlaytimeMs >= 3600000000, progress: (s) => ({ current: Math.min(s.totalPlaytimeMs, 3600000000), target: 3600000000 }) },

  // --- Daily Challenges (source: 'daily' — checked against dailyStats, not
  // the ladder stats blob; track: daily-completed, daily-<difficulty>) -------
  { id: 'daily-1', category: 'Daily Challenges', title: 'Daily Debut', description: 'Complete your first daily challenge.', icon: 'today-outline',
    source: 'daily', track: 'daily-completed', check: (d) => totalDailyDaysWon(d) >= 1, progress: (d) => ({ current: Math.min(totalDailyDaysWon(d), 1), target: 1 }) },
  { id: 'daily-10', category: 'Daily Challenges', title: 'Daily Habit', description: 'Complete 10 daily challenges.', icon: 'calendar-outline',
    source: 'daily', track: 'daily-completed', check: (d) => totalDailyDaysWon(d) >= 10, progress: (d) => ({ current: Math.min(totalDailyDaysWon(d), 10), target: 10 }) },
  { id: 'daily-25', category: 'Daily Challenges', title: 'Daily Devotee', description: 'Complete 25 daily challenges.', icon: 'ribbon-outline',
    source: 'daily', track: 'daily-completed', check: (d) => totalDailyDaysWon(d) >= 25, progress: (d) => ({ current: Math.min(totalDailyDaysWon(d), 25), target: 25 }) },
  { id: 'daily-50', category: 'Daily Challenges', title: 'Daily Legend', description: 'Complete 50 daily challenges.', icon: 'trophy-outline',
    source: 'daily', track: 'daily-completed', check: (d) => totalDailyDaysWon(d) >= 50, progress: (d) => ({ current: Math.min(totalDailyDaysWon(d), 50), target: 50 }) },
  { id: 'daily-100', category: 'Daily Challenges', title: 'Daily Icon', description: 'Complete 100 daily challenges.', icon: 'medal-outline',
    source: 'daily', track: 'daily-completed', check: (d) => totalDailyDaysWon(d) >= 100, progress: (d) => ({ current: Math.min(totalDailyDaysWon(d), 100), target: 100 }) },
  { id: 'daily-200', category: 'Daily Challenges', title: 'Daily Immortal', description: 'Complete 200 daily challenges.', icon: 'diamond-outline',
    source: 'daily', track: 'daily-completed', check: (d) => totalDailyDaysWon(d) >= 200, progress: (d) => ({ current: Math.min(totalDailyDaysWon(d), 200), target: 200 }) },
  { id: 'daily-500', category: 'Daily Challenges', title: 'Daily Eternal', description: 'Complete 500 daily challenges.', icon: 'infinite-outline',
    source: 'daily', track: 'daily-completed', check: (d) => totalDailyDaysWon(d) >= 500, progress: (d) => ({ current: Math.min(totalDailyDaysWon(d), 500), target: 500 }) },
  ...dailyPerDifficultyAchievements,

  // --- Flavor ------------------------------------------------------------
  { id: 'speedrunner', category: 'Flavor', title: 'Speedrunner', description: 'Clear a board in under 15 seconds.', icon: 'stopwatch-outline',
    check: (s) => s.bestClearTimeMs != null && s.bestClearTimeMs <= 15000 },
];

export const ACHIEVEMENT_CATEGORIES = [...new Set(ACHIEVEMENTS.map((a) => a.category))];
export const ACHIEVEMENTS_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// Display title for each track, keyed by the `track` id used above. Purely
// presentational — the ladder itself is just the achievements that share a
// `track`, in the order they appear in ACHIEVEMENTS.
export const TRACK_META = {
  levels: { title: 'Level Milestones' },
  'grid-sizes': { title: 'Grid Sizes' },
  flawless: { title: 'Flawless Clears' },
  chains: { title: 'Chain Reactions' },
  taps: { title: 'Taps' },
  boards: { title: 'Boards Cleared' },
  streaks: { title: 'Win Streaks' },
  'days-played': { title: 'Days Played' },
  'day-streak': { title: 'Daily Streak' },
  playtime: { title: 'Total Playtime' },
  'daily-completed': { title: 'Daily Challenges Completed' },
  ...Object.fromEntries(DAILY_DIFFICULTY_ORDER.map((id) => [`daily-${id}`, { title: `${DAILY_DIFFICULTIES[id].label} Daily Challenges` }])),
};

// How an achievement's progress renders as text: `format` wins if present
// (e.g. durations); otherwise a bare "current/target" — the title/description
// already say what's being counted, so the fraction doesn't need to repeat it.
export function progressLabel(achievement, progress) {
  if (achievement.format) return achievement.format(progress.current, progress.target);
  return `${progress.current}/${progress.target}`;
}

// Groups each category's achievements into display units: a 'track' entry
// per distinct track (its full tier ladder, in order) and a 'single' entry
// per standalone achievement. Used by AchievementsScreen to render one
// tappable ladder-summary row per track, and a plain card per standalone.
export function groupForDisplay() {
  return ACHIEVEMENT_CATEGORIES.map((category) => {
    const inCategory = ACHIEVEMENTS.filter((a) => a.category === category);
    const seenTracks = new Set();
    const groups = [];
    for (const a of inCategory) {
      if (!a.track) {
        groups.push({ type: 'single', achievement: a });
        continue;
      }
      if (seenTracks.has(a.track)) continue;
      seenTracks.add(a.track);
      groups.push({
        type: 'track',
        id: a.track,
        meta: TRACK_META[a.track],
        items: inCategory.filter((x) => x.track === a.track),
      });
    }
    return { category, groups };
  });
}
