// Shared "has the player bought Remove Ads?" state, used by both the native
// (RevenueCat) and web/dev-stub purchase implementations.
//
// The last known value is saved locally so a launch with no network still
// knows the player is a buyer — the store (RevenueCat) is the source of truth
// and overwrites it whenever it can be reached (which also handles refunds).
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = 'overflow:iap:v1';

let adsRemoved = false;
const listeners = new Set();

export function getAdsRemoved() {
  return adsRemoved;
}

// Update the flag; persists and notifies subscribers only on a real change.
export function setAdsRemoved(next) {
  if (next === adsRemoved) return;
  adsRemoved = next;
  AsyncStorage.setItem(STORE_KEY, JSON.stringify({ adsRemoved })).catch(() => {});
  listeners.forEach((fn) => fn(adsRemoved));
}

// Resolves once the saved value has been read (never rejects) — callers that
// decide whether to show ads wait on this so a buyer never sees a flash of ads.
export async function loadSavedAdsRemoved() {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) adsRemoved = !!JSON.parse(raw).adsRemoved;
  } catch (e) { /* storage unavailable — default (not removed) stands */ }
}

export function useAdsRemoved() {
  const [value, setValue] = useState(adsRemoved);
  useEffect(() => {
    setValue(adsRemoved); // pick up a value loaded between render and effect
    listeners.add(setValue);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}
