// Leaderboards — native implementation via Google Play Games Services
// (Android only; web/iOS get index.web.js's no-ops — Game Center comes later
// once there's an actual iOS build). "Sign in" is Play Games' own native
// account picker, not a login screen we build — the player is already signed
// into a Google account on the device.
//
// Two kinds of leaderboard:
//  - ladder: one persistent leaderboard, highest level reached. Submitting a
//    lower score than a player's existing best is a no-op on Google's side,
//    so every win can submit unconditionally — no "is this a new best?"
//    bookkeeping needed here.
//  - daily challenge: one persistent leaderboard PER DIFFICULTY TIER (times
//    aren't comparable across tiers — different board size/caps), ranked
//    ascending (lower ms = better). Play Games' own leaderboard UI has a
//    built-in Today/This Week/All Time toggle, so a single persistent
//    leaderboard doubles as the daily one with no extra plumbing — the one
//    caveat is that Google's "Today" boundary is its own (not necessarily
//    the local-midnight boundary the rest of the Daily Challenge uses, see
//    useDailyStats.js's localDateStr), which could mismatch right around
//    midnight for a given player. Accepted as a minor, non-blocking gap.
//
// react-native-google-play-games needs native code that only exists in a
// custom/EAS build — NOT in Expo Go — so it's required lazily inside
// try/catch, same pattern as src/ads and src/purchases.
import { Platform } from 'react-native';

let GooglePlayGames = null;
try {
  GooglePlayGames = require('react-native-google-play-games').default;
} catch (e) { /* no native module in this runtime (e.g. Expo Go) */ }

const live = !!GooglePlayGames && Platform.OS === 'android';

// REAL leaderboard IDs (Play Console -> Grow users -> Play Games Services ->
// Leaderboards). Left null until Play Games Services is set up there —
// every call is a safe no-op until then, same placeholder pattern as
// REAL_UNIT_IDS in src/ads and REVENUECAT_KEYS in src/purchases.
const LEVEL_LEADERBOARD_ID = null;
const DAILY_LEADERBOARD_IDS = {
  beginner: null,
  intermediate: null,
  expert: null,
  master: null,
};

export function isLeaderboardsAvailable() {
  return live && !!LEVEL_LEADERBOARD_ID;
}

export function isDailyLeaderboardAvailable(difficulty) {
  return live && !!DAILY_LEADERBOARD_IDS[difficulty];
}

// Dev-only: true once the real IDs aren't set up yet, so the entry points
// (Menu card, Daily Hub / Daily Challenge trophy buttons) can still render —
// with a "(preview)" label — for Leon to judge placement/copy before Play
// Console is unblocked. Tapping one in this state is a no-op (see
// showLevelLeaderboard/showDailyLeaderboard below); there's nothing real to
// open yet. Auto-stops being true the moment a real ID lands, so the label
// disappears on its own rather than needing to be remembered and removed.
// Works on every platform in dev (not just Android) — this previews OUR OWN
// UI, not Play Games itself, so it's useful from the fast web dev loop too.
export function isLeaderboardsPreview() {
  return __DEV__ && !isLeaderboardsAvailable();
}

export function isDailyLeaderboardPreview(difficulty) {
  return __DEV__ && !isDailyLeaderboardAvailable(difficulty);
}

let signInPromise = null;

// Ensures the player is signed in before a submit/show call — Play Games'
// own native sheet, nothing custom built here. Safe to call repeatedly;
// resolves false (never throws) if the player has no Google account signed
// in or dismisses the prompt, so callers can just no-op on false.
async function ensureSignedIn() {
  if (!live) return false;
  if (signInPromise) return signInPromise;
  signInPromise = (async () => {
    try {
      if (await GooglePlayGames.isAuthenticated()) return true;
      await GooglePlayGames.signIn();
      return true;
    } catch (e) {
      signInPromise = null; // let a later call retry rather than sticking on one failure
      return false;
    }
  })();
  return signInPromise;
}

// Fire-and-forget: called on every ladder win (see GameScreen). Never throws.
export async function submitLevelScore(level) {
  if (!isLeaderboardsAvailable()) return;
  try {
    if (!(await ensureSignedIn())) return;
    await GooglePlayGames.submitScore(LEVEL_LEADERBOARD_ID, level);
  } catch (e) { /* leaderboard submit failing shouldn't affect gameplay */ }
}

// Fire-and-forget: called on every daily-challenge win (see
// DailyChallengeScreen). Never throws.
export async function submitDailyTime(difficulty, timeMs) {
  const id = DAILY_LEADERBOARD_IDS[difficulty];
  if (!live || !id) return;
  try {
    if (!(await ensureSignedIn())) return;
    await GooglePlayGames.submitScore(id, Math.round(timeMs));
  } catch (e) { /* leaderboard submit failing shouldn't affect gameplay */ }
}

// Opens Play Games' native leaderboard UI. Both resolve quietly (no-op) if
// signed out/unavailable, rather than surfacing an error to the player over
// what's a secondary feature.
export async function showLevelLeaderboard() {
  if (!isLeaderboardsAvailable()) return;
  try {
    if (!(await ensureSignedIn())) return;
    await GooglePlayGames.showLeaderboard(LEVEL_LEADERBOARD_ID);
  } catch (e) { /* ignore */ }
}

export async function showDailyLeaderboard(difficulty) {
  const id = DAILY_LEADERBOARD_IDS[difficulty];
  if (!live || !id) return;
  try {
    if (!(await ensureSignedIn())) return;
    await GooglePlayGames.showLeaderboard(id);
  } catch (e) { /* ignore */ }
}
