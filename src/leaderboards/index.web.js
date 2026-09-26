// Web build (and any non-Android platform): no real leaderboards — Play
// Games Services is Android-only; Game Center comes later for iOS. Same
// exports as index.js so callers never need a platform check. The preview
// flags stay live here in __DEV__ so the entry points (with their
// "(preview)" label) can be checked from the fast web dev loop.
export function isLeaderboardsAvailable() {
  return false;
}

export function isDailyLeaderboardAvailable() {
  return false;
}

export function isLeaderboardsPreview() {
  return __DEV__;
}

export function isDailyLeaderboardPreview() {
  return __DEV__;
}

export function submitLevelScore() {
  return Promise.resolve();
}

export function submitDailyTime() {
  return Promise.resolve();
}

export function showLevelLeaderboard() {
  return Promise.resolve();
}

export function showDailyLeaderboard() {
  return Promise.resolve();
}
