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

export const ACHIEVEMENTS = [
  // --- Milestones -------------------------------------------------------
  { id: 'first-steps', category: 'Milestones', title: 'First Steps', description: 'Clear level 1.', icon: 'footsteps-outline',
    check: (s) => s.best > 1 },
  { id: 'level-10', category: 'Milestones', title: 'Warming Up', description: 'Clear level 10.', icon: 'flag-outline',
    check: (s) => s.best > 10, progress: (s) => ({ current: Math.min(s.best - 1, 10), target: 10 }) },
  { id: 'level-25', category: 'Milestones', title: 'Quarter Century', description: 'Clear level 25.', icon: 'ribbon-outline',
    check: (s) => s.best > 25, progress: (s) => ({ current: Math.min(s.best - 1, 25), target: 25 }) },
  { id: 'level-50', category: 'Milestones', title: 'Half a Hundred', description: 'Clear level 50.', icon: 'medal-outline',
    check: (s) => s.best > 50, progress: (s) => ({ current: Math.min(s.best - 1, 50), target: 50 }) },
  { id: 'level-100', category: 'Milestones', title: 'Century Club', description: 'Clear level 100.', icon: 'trophy-outline',
    check: (s) => s.best > 100, progress: (s) => ({ current: Math.min(s.best - 1, 100), target: 100 }) },
  { id: 'level-200', category: 'Milestones', title: 'Deep Run', description: 'Clear level 200.', icon: 'diamond-outline',
    check: (s) => s.best > 200, progress: (s) => ({ current: Math.min(s.best - 1, 200), target: 200 }) },

  // --- Grid sizes ---------------------------------------------------------
  { id: 'tier-4x4', category: 'Grid Sizes', title: '4×4 Cleared', description: 'Clear a 4×4 board.', icon: 'grid-outline',
    check: (s) => (s.clearedByTier['4'] || 0) > 0 },
  { id: 'tier-5x5', category: 'Grid Sizes', title: '5×5 Cleared', description: 'Clear a 5×5 board.', icon: 'grid-outline',
    check: (s) => (s.clearedByTier['5'] || 0) > 0 },
  { id: 'tier-6x6', category: 'Grid Sizes', title: '6×6 Cleared', description: 'Clear a 6×6 board.', icon: 'grid-outline',
    check: (s) => (s.clearedByTier['6'] || 0) > 0 },
  { id: 'tier-7x7', category: 'Grid Sizes', title: '7×7 Cleared', description: 'Clear a 7×7 board.', icon: 'grid-outline',
    check: (s) => (s.clearedByTier['7'] || 0) > 0 },
  { id: 'tier-8x8', category: 'Grid Sizes', title: '8×8 Cleared', description: 'Clear an 8×8 board.', icon: 'grid-outline',
    check: (s) => (s.clearedByTier['8'] || 0) > 0 },

  // --- Skill ---------------------------------------------------------------
  { id: 'flawless', category: 'Skill', title: 'Flawless', description: 'Clear a board without losing a life.', icon: 'shield-checkmark-outline',
    check: (s) => s.flawlessClears > 0 },
  { id: 'perfectionist', category: 'Skill', title: 'Perfectionist', description: 'Clear 10 boards flawlessly.', icon: 'sparkles-outline',
    check: (s) => s.flawlessClears >= 10, progress: (s) => ({ current: Math.min(s.flawlessClears, 10), target: 10 }) },
  { id: 'nail-biter', category: 'Skill', title: 'Nail-Biter', description: 'Win a board on your last life.', icon: 'heart-outline',
    check: (s) => s.narrowestWinLives === 1 },
  { id: 'chain-reaction', category: 'Skill', title: 'Chain Reaction', description: 'Trigger a cascade of 5+ bursts from one tap.', icon: 'link-outline',
    check: (s) => s.longestChain >= 5 },
  { id: 'domino-effect', category: 'Skill', title: 'Domino Effect', description: 'Trigger a cascade of 10+ bursts from one tap.', icon: 'layers-outline',
    check: (s) => s.longestChain >= 10 },
  { id: 'iron-will', category: 'Skill', title: 'Iron Will', description: 'Win 5 boards in a row without losing a life on any of them.', icon: 'barbell-outline',
    check: (s) => s.bestFlawlessStreak >= 5, progress: (s) => ({ current: Math.min(s.bestFlawlessStreak, 5), target: 5 }) },

  // --- Volume ----------------------------------------------------------
  { id: 'taps-100', category: 'Volume', title: 'Tapping Away', description: 'Make 100 taps.', icon: 'finger-print-outline',
    check: (s) => s.totalTaps >= 100, progress: (s) => ({ current: Math.min(s.totalTaps, 100), target: 100 }) },
  { id: 'taps-1000', category: 'Volume', title: 'Tap Machine', description: 'Make 1,000 taps.', icon: 'hand-left-outline',
    check: (s) => s.totalTaps >= 1000, progress: (s) => ({ current: Math.min(s.totalTaps, 1000), target: 1000 }) },
  { id: 'taps-10000', category: 'Volume', title: 'Relentless', description: 'Make 10,000 taps.', icon: 'flash-outline',
    check: (s) => s.totalTaps >= 10000, progress: (s) => ({ current: Math.min(s.totalTaps, 10000), target: 10000 }) },
  { id: 'boards-50', category: 'Volume', title: 'Board Clearer', description: 'Clear 50 boards.', icon: 'checkmark-done-outline',
    check: (s) => s.boardsCleared >= 50, progress: (s) => ({ current: Math.min(s.boardsCleared, 50), target: 50 }) },
  { id: 'boards-100', category: 'Volume', title: 'Board Crusher', description: 'Clear 100 boards.', icon: 'checkmark-done-circle-outline',
    check: (s) => s.boardsCleared >= 100, progress: (s) => ({ current: Math.min(s.boardsCleared, 100), target: 100 }) },
  { id: 'boards-500', category: 'Volume', title: 'Board Annihilator', description: 'Clear 500 boards.', icon: 'infinite-outline',
    check: (s) => s.boardsCleared >= 500, progress: (s) => ({ current: Math.min(s.boardsCleared, 500), target: 500 }) },

  // --- Streaks ---------------------------------------------------------
  { id: 'streak-5', category: 'Streaks', title: 'On a Roll', description: 'Win 5 boards in a row.', icon: 'flame-outline',
    check: (s) => s.bestStreak >= 5, progress: (s) => ({ current: Math.min(s.bestStreak, 5), target: 5 }) },
  { id: 'streak-10', category: 'Streaks', title: 'Unstoppable', description: 'Win 10 boards in a row.', icon: 'flash-outline',
    check: (s) => s.bestStreak >= 10, progress: (s) => ({ current: Math.min(s.bestStreak, 10), target: 10 }) },
  { id: 'streak-25', category: 'Streaks', title: 'Legendary', description: 'Win 25 boards in a row.', icon: 'rocket-outline',
    check: (s) => s.bestStreak >= 25, progress: (s) => ({ current: Math.min(s.bestStreak, 25), target: 25 }) },

  // --- Flavor ------------------------------------------------------------
  { id: 'comeback-kid', category: 'Flavor', title: 'Comeback Kid', description: 'Clear a board right after a loss.', icon: 'arrow-undo-outline',
    check: (s) => s.comebackWins > 0 },
  { id: 'green-thumb', category: 'Flavor', title: 'Green Thumb', description: 'Clear a board that was more than half green at some point.', icon: 'leaf-outline',
    check: (s) => s.greenThumbClears > 0 },
  { id: 'speedrunner', category: 'Flavor', title: 'Speedrunner', description: 'Clear a board in under 15 seconds.', icon: 'stopwatch-outline',
    check: (s) => s.bestClearTimeMs != null && s.bestClearTimeMs <= 15000 },
];

export const ACHIEVEMENT_CATEGORIES = [...new Set(ACHIEVEMENTS.map((a) => a.category))];
export const ACHIEVEMENTS_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
