// Web build: no ads (AdMob is native-only). Same exports as index.js so
// callers never need a platform check. The one exception is the rewarded
// stub: in dev it grants the reward instantly so the continue flows can be
// exercised in the browser.
export function initAds() {
  return Promise.resolve(false);
}

export function isPrivacyOptionsRequired() {
  return false;
}

export function showPrivacyOptions() {
  return Promise.resolve();
}

export function isRewardedAvailable() {
  return __DEV__;
}

export function showRewarded() {
  return Promise.resolve(__DEV__ ? 'earned' : 'unavailable');
}

export function showInterstitial() {
  return Promise.resolve();
}

export function isAdInspectorAvailable() {
  return false; // native-only, no equivalent on web
}

export function openAdInspector() {
  return Promise.resolve({ ok: false, reason: 'Ad Inspector is native-only.' });
}
