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

function makePool(source) {
  if (!createAudioPlayer) return null;
  let players;
  try {
    players = Array.from({ length: POOL_SIZE }, () => createAudioPlayer(source));
  } catch (e) { return null; }
  let next = 0;
  return () => {
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
}

// Pools are built lazily (not at module load) so a runtime with no native
// audio module (web, or Expo Go without expo-audio's native code) never
// pays for/attempts the native calls at all until a sound is actually
// requested — same "safe until needed" shape as src/ads and src/purchases.
let pools = null;
function ensurePools() {
  if (pools) return pools;
  pools = {
    tap: makePool(TAP_SOUND),
    sweep: makePool(SWEEP_SOUND),
    bursts: BURST_SOUNDS.map(makePool),
  };
  return pools;
}

// App.js calls this once, early at launch (same spirit as initAds()) — NOT
// relying on ensurePools()'s own lazy trigger. createAudioPlayer() loads its
// buffer asynchronously; left lazy, the player's very first tap would be the
// same instant all 42 players (6 tap + 6 sweep + 5 burst variants x 6) get
// created at once, so several of the first real taps/bursts could land
// before their player's buffer had actually finished loading and play()
// silently did nothing. Warming this up well before the player can interact
// gives every pool time to finish loading first.
export function preloadSounds() {
  ensurePools();
}

// Module-level mute switch — App.js calls this whenever the Settings
// screen's Sound toggle changes (see useSettings.js), so every call site
// below (and every consumer of useGame, ladder or daily) stays unaware of
// the setting itself. Starts true to match useSettings' own default.
let enabled = true;
export function setSoundEnabled(v) { enabled = v; }

export function playTap() {
  if (!enabled) return;
  ensurePools().tap?.();
}

// Rotates through the 5 burst variants rather than replaying the same
// sample every time, so a long chain reaction doesn't sound like one
// identical pop firing repeatedly.
let nextBurstVariant = 0;
export function playBurst() {
  if (!enabled) return;
  const { bursts } = ensurePools();
  const play = bursts[nextBurstVariant];
  nextBurstVariant = (nextBurstVariant + 1) % bursts.length;
  play?.();
}

// One per diagonal band during the win-wipe / board-reveal sweep — not one
// per individual cell, since several cells share a band and firing that
// many identical sounds at the exact same instant would just pile up into
// a loud blob rather than a light cascading tick (see useGame.js's
// diagonalBands/runWinWipe/runBoardReveal, which this is called from).
export function playSweepTick() {
  if (!enabled) return;
  ensurePools().sweep?.();
}
