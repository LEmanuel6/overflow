import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

// Picks up exactly where the native splash (app.json's expo-splash-screen
// plugin: same ./assets/splash.png, same #1B1A17 background) leaves off —
// rendered the instant that native splash hides (see App.js), so there's no
// visible seam between the two. Stays up until the daily-board warm-up
// finishes, with a progress bar the native splash can't show on its own
// (expo-splash-screen is a static image — no live, JS-driven progress).
//
// Leon's explicit choice to hold launch here rather than let the Daily
// Challenge button sit tappable-but-unresponsive while the heavy Expert/
// Master board generation blocks the JS thread (see App.js) — the
// alternative (don't hold, let it resolve in the background) was offered
// and declined in favour of this, a real wait up front over a silent one
// later.
//
// Colours are hardcoded, not pulled from the theme — this renders before
// ThemeProvider mounts (settings.darkMode may not even be loaded from
// storage yet), and the native splash it's continuing is itself always
// dark regardless of the player's theme choice, so matching THAT exactly
// is what avoids a visible seam, not matching whatever theme ends up active.
export default function LoadingScreen({ progress }) {
  return (
    <View style={styles.container}>
      <Image source={require('../../assets/splash.png')} style={styles.mark} resizeMode="contain" />
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1B1A17', alignItems: 'center', justifyContent: 'center' },
  mark: { width: 180, height: 180 },
  track: {
    marginTop: 40, width: 160, height: 4, borderRadius: 2,
    backgroundColor: '#4A4536', overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#E0A542', borderRadius: 2 },
});
