// Web build: no real purchases (the store SDKs are native-only). Same exports
// as index.js. In __DEV__ a local stub makes the Remove Ads flow testable in
// the browser; in a non-dev web build purchases are simply unavailable.
import {
  getAdsRemoved, setAdsRemoved, loadSavedAdsRemoved, useAdsRemoved,
} from './store';

export { getAdsRemoved, useAdsRemoved };

export const isPurchaseStub = __DEV__;

export function isPurchaseAvailable() {
  return __DEV__;
}

export const purchasesReady = loadSavedAdsRemoved();

export async function getRemoveAdsPrice() {
  return __DEV__ ? '£4.99' : null;
}

export async function buyRemoveAds() {
  if (!__DEV__) return 'error';
  setAdsRemoved(true);
  return 'purchased';
}

export async function restorePurchases() {
  if (!__DEV__) return 'error';
  return getAdsRemoved() ? 'restored' : 'none';
}

export function devClearPurchase() {
  if (__DEV__) setAdsRemoved(false);
}
