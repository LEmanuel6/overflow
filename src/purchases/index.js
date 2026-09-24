// In-app purchase: one non-consumable "Remove ads" (banner + level-clear
// interstitials; the optional watch-to-continue rewarded ads stay). Native
// implementation via RevenueCat; web / dev-without-keys gets index.web.js's
// stub logic below.
//
// SETUP (see docs in the project notes): create the product in Play Console /
// App Store Connect, add it to RevenueCat with an entitlement whose id is
// ENTITLEMENT_ID, put it in the current offering, then paste RevenueCat's
// PUBLIC SDK keys below. Until a key is set the purchase UI stays hidden in
// release builds (in __DEV__ a local stub stands in so the flow is testable).
//
// react-native-purchases needs native code — like the ads module it's
// required lazily so Expo Go (no native module) degrades to "not available"
// instead of crashing at import.
import { Platform } from 'react-native';
import {
  getAdsRemoved, setAdsRemoved, loadSavedAdsRemoved, useAdsRemoved,
} from './store';

export { getAdsRemoved, useAdsRemoved };

let Purchases = null;
try {
  Purchases = require('react-native-purchases').default;
} catch (e) { /* no native purchases module in this runtime (e.g. Expo Go) */ }

// RevenueCat PUBLIC SDK keys (Project settings -> API keys): Google Play
// "goog_...", App Store "appl_...". Public by design — they ship in the app.
const REVENUECAT_KEYS = { android: null, ios: null };
const ENTITLEMENT_ID = 'no_ads';

const apiKey = REVENUECAT_KEYS[Platform.OS];
const live = !!(Purchases && apiKey);
// Dev-only stand-in when real purchases aren't configured: "buying" just flips
// the local flag, so both states of the UI can be exercised without a store.
export const isPurchaseStub = __DEV__ && !live;

export function isPurchaseAvailable() {
  return live || isPurchaseStub;
}

const entitled = (info) => !!info?.entitlements?.active?.[ENTITLEMENT_ID];

// Resolves once the saved value is loaded (RevenueCat is refreshed in the
// background and never blocks this), so callers can safely decide about ads.
export const purchasesReady = (async () => {
  await loadSavedAdsRemoved();
  if (!live) return;
  try {
    Purchases.configure({ apiKey });
    Purchases.addCustomerInfoUpdateListener((info) => setAdsRemoved(entitled(info)));
    // Offline / store unreachable just keeps the saved value.
    Purchases.getCustomerInfo().then((info) => setAdsRemoved(entitled(info))).catch(() => {});
  } catch (e) { /* misconfigured — leave purchases unavailable this session */ }
})();

async function findPackage() {
  const current = (await Purchases.getOfferings()).current;
  return current?.lifetime ?? current?.availablePackages?.[0] ?? null;
}

// Localised price string from the store (e.g. "£4.99"), or null if unknown.
export async function getRemoveAdsPrice() {
  if (isPurchaseStub) return '£4.99';
  if (!live) return null;
  try { return (await findPackage())?.product?.priceString ?? null; } catch (e) { return null; }
}

// -> 'purchased' | 'cancelled' | 'error'
export async function buyRemoveAds() {
  if (isPurchaseStub) { setAdsRemoved(true); return 'purchased'; }
  if (!live) return 'error';
  try {
    const pkg = await findPackage();
    if (!pkg) return 'error';
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    if (!entitled(customerInfo)) return 'error';
    setAdsRemoved(true);
    return 'purchased';
  } catch (e) {
    return e?.userCancelled ? 'cancelled' : 'error';
  }
}

// -> 'restored' | 'none' | 'error'. Required by Apple: a way to get an earlier
// purchase back on a new device / reinstall.
export async function restorePurchases() {
  if (isPurchaseStub) return getAdsRemoved() ? 'restored' : 'none';
  if (!live) return 'error';
  try {
    const info = await Purchases.restorePurchases();
    if (!entitled(info)) return 'none';
    setAdsRemoved(true);
    return 'restored';
  } catch (e) {
    return 'error';
  }
}

// Dev testing only: undo the stubbed purchase.
export function devClearPurchase() {
  if (isPurchaseStub) setAdsRemoved(false);
}
