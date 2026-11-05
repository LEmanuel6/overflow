// Sound effects — tap, burst, and the wipe/reveal whoosh. Native
// implementation via expo-audio. Short, percussive, UI-style feedback only;
// no soundtrack/music. Unlike ads/purchases/leaderboards, expo-audio works
// in Expo Go / a plain dev client, so this is actually testable in the fast
// dev loop without a custom EAS build.
let createAudioPlayer = null;
let setAudioModeAsync = null;
try {
  ({ createAudioPlayer, setAudioModeAsync } = require('expo-audio'));
} catch (e) { /* no native audio module in this runtime — sounds just don't play */ }

// expo-audio never has its audio session configured anywhere else in this
// app, so it's left on its default interruptionMode — 'doNotMix', which
// requests EXCLUSIVE audio focus on every play() call. That default is fine
// for a single voice, but these are a pool of short, overlapping one-shot
// SFX by design (see makePool below): a second tap landing while the first
// tap's sound is still playing, or two diagonal-band wipe/reveal ticks
// firing a beat apart, each call play() on a DIFFERENT pool player — and
// under 'doNotMix' the newer call can steal focus and cut the still-playing
// one off instead of the two layering, which is exactly the "second tap's
// sound missing" symptom. 'mixWithOthers' tells the session this app's own
// sounds (and other apps') can all play at once.
let audioModeConfigured = false;
function ensureAudioMode() {
  if (audioModeConfigured || !setAudioModeAsync) return;
  audioModeConfigured = true;
  setAudioModeAsync({ interruptionMode: 'mixWithOthers', playsInSilentMode: true }).catch(() => {});
}

const TAP_SOUND = require('../../assets/audio/click1.ogg');
// Played once per win-wipe/board-reveal sweep (see useGame.js's runWinWipe/
// runBoardReveal) — replaced the old approach of one short "tick" per
// diagonal band (5-9 rapid, individually-triggered plays within under a
// second for a 4x4/5x5 board), which was its own source of raggedness: that
// many discrete native play() calls fired that close together is inherently
// more fragile-feeling than one continuous sound covering the same sweep.
// Currently a placeholder
// (a copy of the old tick sound) — swap this file for a real whoosh/swoosh
// clip whenever Leon has one; no code change needed, just replace the file.
const WHOOSH_SOUND = require('../../assets/audio/whoosh.ogg');
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
// The whoosh plays once per sweep (never several in a rapid burst the way
// tap/burst can), so it only needs enough slots to cover a new sweep
// starting while the previous one's tail is still audible — a much smaller
// pool means much less redundant decode work at launch for a sound that
// doesn't need 6 copies.
const WHOOSH_POOL_SIZE = 2;

// Returns { play, players } rather than just the play function — exposing
// the underlying players lets preloadSounds() below actually watch their
// `isLoaded` flag instead of just hoping they're ready by the time they're
// first used.
function makePool(source, poolSize = POOL_SIZE) {
  if (!createAudioPlayer) return null;
  let players;
  try {
    players = Array.from({ length: poolSize }, () => createAudioPlayer(source));
  } catch (e) { return null; }
  let next = 0;
  const play = () => {
    try {
      const player = players[next];
      next = (next + 1) % poolSize;
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

// REMOVED: this used to mute each player, play() it, wait 80ms, then pause/
// seek/un-mute it, to pre-pay the native audio stream's one-time open
// latency before a real sound ever needed it. Real on-device evidence (an
// in-app debug log, not a guess) showed it doing lasting damage instead: a
// pool's burst sounds — the ones with the most players (30, round-robin
// across 5 variants) — never played a single audible sound despite every
// play() call reporting success with zero errors, while tap (6 players)
// only glitched briefly after launch and whoosh (2 players) seemed fine —
// a scaling pattern that points squarely at this mute/unmute dance leaving
// some fraction of slots reporting `muted: false` without the underlying
// native player actually being restored to audible, worse with more
// players primed at once. It also wasn't reliably fixing the thing it was
// for (tap was still briefly silent after launch even with this in place),
// so removing it outright is a net win, not just a safer tradeoff. The
// cost is whatever one-time native stream-open latency the very first play
// of each slot pays on its own — real, but far better than permanently
// silent.

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
// actually needed first — whoosh, then tap — and stagger bursts in afterwards.
let tapPool = null;
function ensureTapPool() {
  ensureAudioMode();
  if (!tapPool) tapPool = makePool(TAP_SOUND);
  return tapPool;
}
let whooshPool = null;
function ensureWhooshPool() {
  ensureAudioMode();
  if (!whooshPool) whooshPool = makePool(WHOOSH_SOUND, WHOOSH_POOL_SIZE);
  return whooshPool;
}
let burstPools = null;
function ensureBurstPools() {
  ensureAudioMode();
  // NOT `BURST_SOUNDS.map(makePool)` — Array.map calls its callback with
  // (element, index, array), and makePool's second parameter is poolSize,
  // so the array index was silently overriding the intended default pool
  // size for every single burst variant (0 players for the first variant,
  // 1-4 for the rest instead of 6). Wrapping it drops those extra args.
  if (!burstPools) burstPools = BURST_SOUNDS.map((source) => makePool(source));
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
// whoosh is the very FIRST sound a player hears — it plays during the
// board's entrance reveal, which fires the instant a board loads in, before
// any tap is even possible — so it and tap load first. Bursts used to be
// left loading in the background (not awaited) on the theory that they only
// ever fire after a chain reaction, so they'd have plenty of runway before
// they were actually needed — but a player clearing level 1 within a couple
// seconds of reaching the Menu can trigger a burst before that background
// load has actually finished, which is indistinguishable from "the burst
// sound doesn't play." Now EVERYTHING is awaited — see the Promise.all
// below — so the loading screen simply doesn't let go until every sound,
// bursts included, is genuinely ready. Slower than the previous approach,
// but nothing after this point is still loading in the background.
//
// Burst pools are still CREATED (ensureBurstPools()) only after whoosh/tap
// are already settled, not at the very start — createAudioPlayer() kicks
// off real native decode work the instant it's called, so building all 30
// burst players (5 sounds x 6 slots) at the same moment as whoosh/tap would
// still compete with them for decode capacity even though all of it is
// awaited either way now.
const CRITICAL_LOAD_TIMEOUT_MS = 6000;
export function preloadSounds() {
  const whoosh = ensureWhooshPool();
  const tap = ensureTapPool();
  return Promise.all([
    waitUntilLoaded(whoosh, CRITICAL_LOAD_TIMEOUT_MS),
    waitUntilLoaded(tap, CRITICAL_LOAD_TIMEOUT_MS),
  ]).then(() => {
    const bursts = ensureBurstPools();
    return Promise.all(bursts.map((pool) => waitUntilLoaded(pool, CRITICAL_LOAD_TIMEOUT_MS)));
  });
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

// Once per win-wipe (board clearing out) or board-reveal (a fresh board
// sweeping in) — see useGame.js's runWinWipe/runBoardReveal, which call this
// exactly once at the start of the sweep rather than once per diagonal band.
export function playWhoosh() {
  if (!enabled) return;
  ensureWhooshPool()?.play();
}
