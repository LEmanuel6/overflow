// Ads (Google AdMob) — native implementation. Web gets index.web.js (no-ops).
// No banner: Leon decided against it, so this module only ever shows
// full-screen ads (interstitial + rewarded) — never a persistent strip.
//
// react-native-google-mobile-ads needs native code that only exists in a
// custom/EAS build — NOT in Expo Go. Requiring it there throws at import
// time, so it's required lazily inside try/catch: in a runtime without the
// native module the app just runs with no ads instead of crashing.
import { Platform } from 'react-native';
import { getAdsRemoved, purchasesReady } from '../purchases';

let Ads = null;
try {
  Ads = require('react-native-google-mobile-ads');
} catch (e) { /* no native ads module in this runtime (e.g. Expo Go) */ }

// REAL ad unit IDs (AdMob console -> Apps -> Ad units). A slot left null
// falls back to Google's TEST unit, which is safe for development/preview
// builds but EARNS NOTHING — a store release with a slot still null is a
// silent revenue bug. iOS units come later (Apple stage); Android's are in.
const REAL_UNIT_IDS = {
  interstitial: { android: 'ca-app-pub-4040127785814300/1052253361', ios: null },
  rewarded: { android: 'ca-app-pub-4040127785814300/2790867130', ios: null },
};

// Forces Google's TEST ad units (guaranteed fill, always shows, labelled
// "Test Ad" on screen) for the `preview` EAS profile — see eas.json's
// EXPO_PUBLIC_FORCE_TEST_ADS. Real ad serving depends on the AdMob app
// being linked to a live Play Store listing, which can't happen until
// Play Console is unblocked (see PROJECT.md) — so testing with real unit
// IDs in the meantime can't tell "the integration is broken" apart from
// "the account just has no fill yet." Test units sidestep that entirely:
// they're unconditional, so if one doesn't show, the bug is genuinely in
// this code, not Google's account-linking status. Only `preview` sets this
// env var; a real production build (no env var set) still gets real ads.
const FORCE_TEST_ADS = process.env.EXPO_PUBLIC_FORCE_TEST_ADS === 'true';

function unitIdFor(slot, testId) {
  return (!__DEV__ && !FORCE_TEST_ADS && REAL_UNIT_IDS[slot]?.[Platform.OS]) || testId;
}

let initPromise = null;
let privacyOptionsRequired = false;

// Google's consent policy requires an in-app way to re-open the consent form
// wherever it was shown (EEA/UK etc.). Settings shows a "Privacy options" row
// only when this is true — see SettingsScreen.
export function isPrivacyOptionsRequired() {
  return privacyOptionsRequired;
}

export async function showPrivacyOptions() {
  if (!Ads) return;
  try { await Ads.AdsConsent.showPrivacyOptionsForm(); } catch (e) { /* form unavailable */ }
}

// Runs the consent flow (Google's UMP — shows the GDPR/US-state privacy form
// only where legally required), then starts the ads SDK. Safe to call more
// than once; resolves to whether ads may be requested.
export function initAds() {
  if (!Ads) return Promise.resolve(false);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus, default: mobileAds } = Ads;
      const info = await AdsConsent.gatherConsent();
      privacyOptionsRequired =
        info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
      if (!info.canRequestAds) return false;
      await mobileAds().initialize();
      // have the full-screen ads ready before they're needed — but a buyer of
      // Remove Ads never sees interstitials, so don't fetch one for them.
      await purchasesReady;
      if (!getAdsRemoved()) interstitialSlot.load();
      rewardedSlot.load();
      return true;
    } catch (e) {
      return false; // consent/init failure just means no ads this session
    }
  })();
  return initPromise;
}

// --- full-screen ads (interstitial + rewarded) ------------------------------
// One ad per format is kept preloaded, so showing is instant; after each one
// closes the next is loaded. A full-screen ad is single-use in the SDK.
const REWARDED_LOAD_WAIT_MS = 6000; // player is actively waiting on this one
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createSlot(kind) {
  const rewarded = kind === 'rewarded';
  let ad = null;
  let loaded = false;
  let loading = false;

  function load() {
    if (!Ads || loaded || loading) return;
    const { InterstitialAd, RewardedAd, AdEventType, RewardedAdEventType, TestIds } = Ads;
    loading = true;
    const next = (rewarded ? RewardedAd : InterstitialAd).createForAdRequest(
      unitIdFor(kind, rewarded ? TestIds.REWARDED : TestIds.INTERSTITIAL),
    );
    ad = next;
    const offLoaded = next.addAdEventListener(rewarded ? RewardedAdEventType.LOADED : AdEventType.LOADED, () => {
      if (ad !== next) return;
      loaded = true; loading = false;
      offLoaded(); offError();
    });
    const offError = next.addAdEventListener(AdEventType.ERROR, () => {
      if (ad !== next) return;
      loading = false; ad = null; // next show()/load() retries
      offLoaded(); offError();
    });
    next.load();
  }

  // Shows the ad if one is ready (waiting up to waitMs for it to finish
  // loading). Resolves 'earned' (rewarded ad watched to the end), 'closed'
  // (interstitial shown / rewarded dismissed early), or 'unavailable'.
  async function show(waitMs = 0) {
    if (!Ads || !(await initAds())) return 'unavailable';
    load();
    const deadline = Date.now() + waitMs;
    while (!loaded && Date.now() < deadline) await sleep(150);
    if (!loaded) return 'unavailable';

    const { AdEventType, RewardedAdEventType } = Ads;
    const shown = ad;
    ad = null; loaded = false;
    return new Promise((resolve) => {
      let earned = false;
      let done = false;
      const offs = [];
      const finish = (result) => {
        if (done) return;
        done = true;
        offs.forEach((off) => off());
        resolve(result);
        load(); // line up the next one
      };
      if (rewarded) offs.push(shown.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }));
      offs.push(shown.addAdEventListener(AdEventType.CLOSED, () => finish(rewarded && earned ? 'earned' : 'closed')));
      offs.push(shown.addAdEventListener(AdEventType.ERROR, () => finish('unavailable')));
      shown.show().catch(() => finish('unavailable'));
    });
  }

  return { load, show };
}

const interstitialSlot = createSlot('interstitial');
const rewardedSlot = createSlot('rewarded');

// Whether the UI should offer a rewarded option at all. In a runtime without
// the native ads module (Expo Go, dev on web) it's offered in __DEV__ only,
// and showRewarded() just grants the reward — so the continue flows stay
// testable without a native build. Never true in a real release without ads.
export function isRewardedAvailable() {
  return !!Ads || __DEV__;
}

// -> 'earned' | 'closed' (dismissed before the reward) | 'unavailable' (no fill,
// offline, consent declined). Only 'earned' should grant the reward.
export async function showRewarded() {
  if (!Ads) return __DEV__ ? 'earned' : 'unavailable';
  return rewardedSlot.show(REWARDED_LOAD_WAIT_MS);
}

// Shows an interstitial if one is ready right now (never for a Remove Ads
// buyer); otherwise resolves at once — gameplay never waits on an ad that
// isn't loaded. Always resolves.
export async function showInterstitial() {
  if (!Ads) return;
  await purchasesReady;
  if (getAdsRemoved()) return; // Remove Ads covers interstitials
  await interstitialSlot.show(0);
}

// Whether Settings should offer the Ad Inspector row — dev builds, or any
// build with EXPO_PUBLIC_FORCE_TEST_ADS set (currently just `preview`).
// Never true in a real production build.
export function isAdInspectorAvailable() {
  return __DEV__ || FORCE_TEST_ADS;
}

// Opens Google's on-device Ad Inspector — shows per-request status
// (succeeded/failed and why), which ad unit was called, and whether this
// device is currently recognised as a registered AdMob test device. Wired to
// a Settings row gated by isAdInspectorAvailable() (see SettingsScreen).
//
// Returns a result object instead of silently swallowing failures — this is
// the diagnostic tool, so a silent failure here defeats the point. Explicitly
// awaits initAds() first (safe/idempotent — returns the cached promise if
// already run) rather than assuming the launch-time call succeeded, since
// "the inspector won't open" and "ads won't load" plausibly share the same
// root cause (consent/init never completing).
// -> { ok: true } | { ok: false, reason: string }
export async function openAdInspector() {
  if (!Ads) return { ok: false, reason: 'No native ads module in this build.' };
  const ready = await initAds();
  if (!ready) {
    return { ok: false, reason: 'initAds() did not complete — consent/init is likely stuck or failing (see gatherConsent/initialize in initAds).' };
  }
  try {
    await Ads.default().openAdInspector();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}
