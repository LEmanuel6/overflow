// useSettings — small persisted app-wide preferences (theme, sound, ...).
// Kept separate from useGame's level/stats persistence since these are
// meta/app settings, not game progress.

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = 'overflow:settings:v1';
const DEFAULTS = { darkMode: true, sound: true };

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULTS);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) setSettings((s) => ({ ...s, ...JSON.parse(raw) }));
      } catch (e) { /* first run or storage unavailable — defaults stand */ }
    })();
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return {
    darkMode: settings.darkMode,
    sound: settings.sound,
    setDarkMode: (v) => update({ darkMode: v }),
    setSound: (v) => update({ sound: v }),
  };
}
