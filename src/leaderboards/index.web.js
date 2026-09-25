// Web build (and any non-Android platform): no leaderboards — Play Games
// Services is Android-only; Game Center comes later for iOS. Same exports as
// index.js so callers never need a platform check.
export function isLeaderboardsAvailable() {
  return false;
}

export function isDailyLeaderboardAvailable() {
  return false;
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
