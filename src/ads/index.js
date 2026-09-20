// Ads (Google AdMob) — native implementation. Web gets index.web.js (no-ops).
//
// react-native-google-mobile-ads needs native code that only exists in a
// custom/EAS build — NOT in Expo Go. Requiring it there throws at import
// time, so it's required lazily inside try/catch: in a runtime without the
// native module the app just runs with no ads instead of crashing.
import React, { useEffect, useState } from 'react';
import { View, Platform, StyleSheet } from 'react-native';

let Ads = null;
try {
  Ads = require('react-native-google-mobile-ads');
} catch (e) { /* no native ads module in this runtime (e.g. Expo Go) */ }

// REAL ad unit IDs go here once the AdMob account exists (AdMob console ->
// Apps -> Ad units). Until then every slot falls back to Google's TEST IDs,
// which is safe to develop and to install preview builds with — but test ads
// EARN NOTHING, so a store release with these still null is a silent revenue
// bug. Fill these in before publishing (and swap the test app IDs in
// app.json's react-native-google-mobile-ads plugin entry).
const REAL_UNIT_IDS = {
  banner: { android: null, ios: null },
  interstitial: { android: null, ios: null },
  rewarded: { android: null, ios: null },
};

function unitIdFor(slot, testId) {
  return (!__DEV__ && REAL_UNIT_IDS[slot]?.[Platform.OS]) || testId;
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
      interstitialSlot.load(); // have the full-screen ads ready before they're needed
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

// Shows an interstitial if one is ready right now; otherwise resolves at once —
// gameplay never waits on an ad that isn't loaded. Always resolves.
export async function showInterstitial() {
  if (!Ads) return;
  await interstitialSlot.show(0);
}

// Anchored adaptive banner. Renders nothing until the SDK is ready (so a
// player who declines consent, or a runtime without the native module, gets
// no empty strip). Keep it well clear of tappable game cells — accidental-
// click placement violates AdMob policy.
export function AdBanner({ style }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    initAds().then((ok) => { if (alive) setReady(ok); });
    return () => { alive = false; };
  }, []);

  if (!Ads || !ready) return null;
  const { BannerAd, BannerAdSize, TestIds } = Ads;
  return (
    <View style={[styles.wrap, style]}>
      <BannerAd
        unitId={unitIdFor('banner', TestIds.ADAPTIVE_BANNER)}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%' },
});
