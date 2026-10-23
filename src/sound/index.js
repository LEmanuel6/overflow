// Sound effects — tap, burst, and the per-band wipe/reveal tick. Native
// implementation via expo-audio. Short, percussive, UI-style feedback only;
// no soundtrack/music. Unlike ads/purchases/leaderboards, expo-audio works
// in Expo Go / a plain dev client, so this is actually testable in the fast
// dev loop without a custom EAS build.
let createAudioPlayer = null;
try {
  ({ createAudioPlayer } = require('expo-audio'));
} catch (e) { /* no native audio module in this runtime — sounds just don't play */ }

const TAP_SOUND = require('../../assets/audio/click1.ogg');
const SWEEP_SOUND = require('../../assets/audio/rollover2.ogg');
// 5 variants of the same impact, rotated rather than replaying one on
// every burst — see playBurst() below.
const BURST_SOUNDS = [
  require('../../assets/audio/impactWood_light_000.ogg'),
  require('../../assets/audio/impactWood_light_001.ogg'),
  require('../../assets/audio/impactWood_light_002.ogg'),
  require('../../assets/audio/impactWood_light_003.ogg'),
  require('../../assets/audio/impactWood_light_004.ogg'),
];

// A small pool per sound rather than one shared player — these are all
// "fire and forget" and need to overlap cleanly (a fast chain reaction
// fires several burst/tick sounds within a few hundred ms of each other;
// restarting a single player would cut the previous copy off instead of
// layering). createAudioPlayer() instances aren't tied to a component and
// persist until explicitly released, which is exactly what a pooled,
// module-level SFX needs. POOL_SIZE is a starting guess at "enough to
// cover realistic overlap," not a measured number.
const POOL_SIZE = 6;

// Returns { play, players } rather than just the play function — exposing
// the underlying players lets preloadSounds() below actually watch their
// `isLoaded` flag instead of just hoping they're ready by the time they're
// first used.
function makePool(source) {
  if (!createAudioPlayer) return null;
  let players;
  try {
    players = Array.from({ length: POOL_SIZE }, () => createAudioPlayer(source));
  } catch (e) { return null; }
  let next = 0;
  const play = () => {
    try {
      const player = players[next];
      next = (next + 1) % POOL_SIZE;
      player.seekTo(0);
      // play() can return a promise on web, which rejects under the
      // browser's autoplay policy until the user has interacted with the
      // page at least once — a plain try/catch doesn't catch that (it's an
      // async rejection, not a synchronous throw), so it showed up as an
      // unhandled promise rejection in the console. Swallowed the same way
      // a native playback failure already is: a sound not playing once
      // shouldn't affect gameplay.
      player.play()?.catch?.(() => {});
    } catch (e) { /* a single play failing shouldn't affect gameplay */ }
  };
  return { play, players };
}

// Polls a pool's players for `isLoaded` rather than trusting a fixed delay —
// the actual decode time varies by device, so a guessed setTimeout either
// wastes time on a fast phone or isn't long enough on a slow one. Resolves
// as soon as every player in the pool reports loaded, or after timeoutMs
// regardless (so a single stuck/erroring player — or a platform where
// isLoaded never flips, which shouldn't happen per expo-audio's API but
// isn't worth hanging the loading screen over) can't block launch forever.
function waitUntilLoaded(pool, timeoutMs) {
  if (!pool) return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const ready = pool.players.every((p) => { try { return p.isLoaded; } catch (e) { return true; } });
      if (ready || Date.now() - start > timeoutMs) { resolve(); return; }
      setTimeout(check, 40);
    };
    check();
  });
}

// Pools are built lazily (not at module load) so a runtime with no native
// audio module (web, or Expo Go without expo-audio's native code) never
// pays for/attempts the native calls at all until a sound is actually
// requested — same "safe until needed" shape as src/ads and src/purchases.
//
// Each sound group gets its OWN lazy builder rather than one shared
// ensurePools() that built all three in a single batch. Calling preloadSounds()
// still wasn't enough to stop the first few real sounds from landing silently —
// building all 42 players (6 tap + 6 sweep + 5 burst variants x 6) in one go
// meant every pool was competing with every other for whatever native decode
// capacity the device has, so none of them reliably finished loading in time.
// Splitting these apart lets preloadSounds() (below) prioritise the ones
// actually needed first — sweep, then tap — and stagger bursts in afterwards.
let tapPool = null;
function ensureTapPool() {
  if (!tapPool) tapPool = makePool(TAP_SOUND);
  return tapPool;
}
let sweepPool = null;
function ensureSweepPool() {
  if (!sweepPool) sweepPool = makePool(SWEEP_SOUND);
  return sweepPool;
}
let burstPools = null;
function ensureBurstPools() {
  if (!burstPools) burstPools = BURST_SOUNDS.map(makePool);
  return burstPools;
}

// App.js calls this once, early at launch (same spirit as initAds()), and —
// unlike the earlier version of this function — actually AWAITS it, gating
// the loading screen itself on the result (see App.js's warmupSettled
// effect). Staggering sound loading behind the scenes was never going to be
// reliable: how long decode actually takes depends on the device, so no
// fixed delay could be trusted not to still lose the race against a
// player's first tap. Blocking launch on it instead mirrors the exact
// tradeoff already made for the daily boards above (costs every launch
// however long it takes, in exchange for nothing ever being silently not
// ready) — same philosophy, same place.
//
// sweep is the very FIRST sound a player hears — it plays during the
// board's entrance reveal, which fires the instant a board loads in, before
// any tap is even possible — so it and tap (right behind it) are the ones
// actually waited on. Bursts only ever fire after a chain reaction, which
// needs at least one successful tap first, so they have the most runway and
// are just kicked off in the background, not awaited.
const CRITICAL_LOAD_TIMEOUT_MS = 4000;
export function preloadSounds() {
  const sweep = ensureSweepPool();
  const tap = ensureTapPool();
  ensureBurstPools();
  return Promise.all([
    waitUntilLoaded(sweep, CRITICAL_LOAD_TIMEOUT_MS),
    waitUntilLoaded(tap, CRITICAL_LOAD_TIMEOUT_MS),
  ]);
}

// Module-level mute switch — App.js calls this whenever the Settings
// screen's Sound toggle changes (see useSettings.js), so every call site
// below (and every consumer of useGame, ladder or daily) stays unaware of
// the setting itself. Starts true to match useSettings' own default.
let enabled = true;
export function setSoundEnabled(v) { enabled = v; }

export function playTap() {
  if (!enabled) return;
  ensureTapPool()?.play();
}

// Rotates through the 5 burst variants rather than replaying the same
// sample every time, so a long chain reaction doesn't sound like one
// identical pop firing repeatedly.
let nextBurstVariant = 0;
export function playBurst() {
  if (!enabled) return;
  const bursts = ensureBurstPools();
  const pool = bursts[nextBurstVariant];
  nextBurstVariant = (nextBurstVariant + 1) % bursts.length;
  pool?.play();
}

// One per diagonal band during the win-wipe / board-reveal sweep — not one
// per individual cell, since several cells share a band and firing that
// many identical sounds at the exact same instant would just pile up into
// a loud blob rather than a light cascading tick (see useGame.js's
// diagonalBands/runWinWipe/runBoardReveal, which this is called from).
export function playSweepTick() {
  if (!enabled) return;
  ensureSweepPool()?.play();
}
