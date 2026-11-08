// Sound effects — tap, burst, and the wipe/reveal whoosh.
//
// Native (iOS/Android) playback goes through ./expo-game-sfx's SoundPool
// (Android) / AVAudioPlayer-pool (iOS) native module instead of expo-audio.
// expo-audio's AudioPlayer is backed by a full streaming pipeline — ExoPlayer
// on Android, AVPlayer on iOS — meant for long-form media. Building 30+
// instances of it for every tap/burst/whoosh variant meant each one's
// underlying native output stream only actually opened on ITS OWN first real
// play() call, which isLoaded/STATE_READY never covers (that only confirms
// the audio data is decoded, not that the native playback path is open).
// That's what caused "random sound missing right after launch" even with
// preloadSounds() blocking launch until every pool reported loaded. An
// earlier attempt to pre-pay that cost (mute → play → pause → unmute, across
// every pool slot near-simultaneously) left some players permanently muted
// instead — see the old revision of this file. SoundPool/AVAudioPlayer are
// built for exactly this (a handful of short one-shot SFX, played rapidly,
// overlapping cleanly), so there's no equivalent "first play" tax to hide.
//
// Web has no such pipeline and isn't affected by any of this, so it keeps
// using expo-audio's own (HTMLAudioElement-backed) implementation unchanged.
import { Platform } from 'react-native';
import { Asset } from 'expo-asset';

let setAudioModeAsync = null;
try {
  ({ setAudioModeAsync } = require('expo-audio'));
} catch (e) { /* no native audio module in this runtime — sounds just don't play */ }

let audioModeConfigured = false;
function ensureAudioMode() {
  if (audioModeConfigured || !setAudioModeAsync) return;
  audioModeConfigured = true;
  // Belt-and-suspenders session config — SoundPool/AVAudioPlayer don't need
  // this to overlap within the app the way expo-audio's ExoPlayer pools did,
  // but it's free and already proven safe.
  setAudioModeAsync({ interruptionMode: 'mixWithOthers', playsInSilentMode: true }).catch(() => {});
}

const TAP_SOUND = require('../../assets/audio/click1.ogg');
// Currently a placeholder (a copy of the old tick sound) — swap this file
// for a real whoosh/swoosh clip whenever Leon has one; no code change
// needed, just replace the file.
const WHOOSH_SOUND = require('../../assets/audio/whoosh.ogg');
// 5 variants of the same impact, rotated rather than replaying one on every
// burst — see playBurst() below.
const BURST_SOUNDS = [
  require('../../assets/audio/impactWood_light_000.ogg'),
  require('../../assets/audio/impactWood_light_001.ogg'),
  require('../../assets/audio/impactWood_light_002.ogg'),
  require('../../assets/audio/impactWood_light_003.ogg'),
  require('../../assets/audio/impactWood_light_004.ogg'),
];

let enabled = true;
export function setSoundEnabled(v) { enabled = v; }

const CRITICAL_LOAD_TIMEOUT_MS = 6000;
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

let ExpoGameSfx = null;
if (Platform.OS !== 'web') {
  try {
    ExpoGameSfx = require('../../modules/expo-game-sfx').default;
  } catch (e) { /* local native module missing (e.g. Expo Go) — sounds just don't play */ }
}

const NATIVE_KEYS = { tap: 'tap', whoosh: 'whoosh', burst: BURST_SOUNDS.map((_, i) => `burst${i}`) };

// Resolves a require()'d asset to a plain local file path and hands it to
// the native module to decode/prime once. downloadAsync() is a no-op once
// expo-asset has already copied the bundled asset to a local file, so this
// is cheap on every launch after the first.
async function loadNativeSound(key, moduleId) {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  await ExpoGameSfx.loadSound(key, uri);
}

function preloadNative() {
  const entries = [
    [NATIVE_KEYS.tap, TAP_SOUND],
    [NATIVE_KEYS.whoosh, WHOOSH_SOUND],
    ...NATIVE_KEYS.burst.map((key, i) => [key, BURST_SOUNDS[i]]),
  ];
  return Promise.all(
    entries.map(([key, moduleId]) => withTimeout(loadNativeSound(key, moduleId).catch(() => {}), CRITICAL_LOAD_TIMEOUT_MS))
  );
}

// --- Web fallback -----------------------------------------------------
// expo-audio's own (HTMLAudioElement-backed) players — no native stream-open
// cost to work around here, so this stays the original, simpler pool shape.
let createAudioPlayer = null;
if (Platform.OS === 'web') {
  try {
    ({ createAudioPlayer } = require('expo-audio'));
  } catch (e) { /* no audio module in this runtime */ }
}
const WEB_POOL_SIZE = 6;
function makeWebPool(source, poolSize = WEB_POOL_SIZE) {
  if (!createAudioPlayer) return null;
  let players;
  try {
    players = Array.from({ length: poolSize }, () => createAudioPlayer(source));
  } catch (e) { return null; }
  let next = 0;
  return () => {
    try {
      const player = players[next];
      next = (next + 1) % poolSize;
      player.seekTo(0);
      player.play()?.catch?.(() => {});
    } catch (e) { /* a single play failing shouldn't affect gameplay */ }
  };
}
let webTapPlay = null;
let webWhooshPlay = null;
let webBurstPlays = null;
function preloadWeb() {
  webTapPlay = makeWebPool(TAP_SOUND);
  webWhooshPlay = makeWebPool(WHOOSH_SOUND, 2);
  webBurstPlays = BURST_SOUNDS.map((source) => makeWebPool(source));
  return Promise.resolve();
}

// --- Public API ---------------------------------------------------------

export function preloadSounds() {
  ensureAudioMode();
  if (Platform.OS === 'web') return preloadWeb();
  if (!ExpoGameSfx) return Promise.resolve();
  return preloadNative();
}

export function playTap() {
  if (!enabled) return;
  if (Platform.OS === 'web') { webTapPlay?.(); return; }
  ExpoGameSfx?.play(NATIVE_KEYS.tap);
}

// Rotates through the 5 burst variants rather than replaying the same
// sample every time, so a long chain reaction doesn't sound like one
// identical pop firing repeatedly.
let nextBurstVariant = 0;
export function playBurst() {
  if (!enabled) return;
  const i = nextBurstVariant;
  nextBurstVariant = (nextBurstVariant + 1) % BURST_SOUNDS.length;
  if (Platform.OS === 'web') { webBurstPlays?.[i]?.(); return; }
  ExpoGameSfx?.play(NATIVE_KEYS.burst[i]);
}

// Once per win-wipe (board clearing out) or board-reveal (a fresh board
// sweeping in) — see useGame.js's runWinWipe/runBoardReveal, which call this
// exactly once at the start of the sweep rather than once per diagonal band.
export function playWhoosh() {
  if (!enabled) return;
  if (Platform.OS === 'web') { webWhooshPlay?.(); return; }
  ExpoGameSfx?.play(NATIVE_KEYS.whoosh);
}
