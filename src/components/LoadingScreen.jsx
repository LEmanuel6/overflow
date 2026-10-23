import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Picks up exactly where the native splash (app.json's expo-splash-screen
// plugin: same 2x2 cell mark, same #1B1A17 background) leaves off — rendered
// the instant that native splash hides (see App.js), so there's no visible
// seam between the two. Stays up until the daily-board warm-up finishes,
// with a progress bar the native splash can't show on its own
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
// The hardcoded hexes below are the dark palette's ok/signal/burst/ink/
// vessel/vesselEdge (see theme.js) — same colours, just literal since
// useTheme() isn't available yet.
//
// The mark itself is recomposed as four live cells (matching
// assets/splash.png and assets/icon.png's own 2x2 layout: green "1" top-
// left, neutral "3" top-right, amber "5" bottom-right, burst "8" bottom-
// left) rather than that static image, so it re-colours correctly and lines
// up exactly with the track below it. Static (no pulse animation) — an
// earlier staggered-pulse version was tried and dropped: it runs alongside
// genuinely heavy synchronous work (Expert/Master's exact-solver board
// generation, see App.js, ~200-450ms+ blocking the JS thread per tier),
// which isn't worth fighting for a launch-screen flourish — Leon's call.
//
// MARK_SIZE (180) is the size this mark actually renders at — but it's NOT
// what app.json's expo-splash-screen `imageWidth` should be set to.
// assets/splash.png is a 1024x1024 canvas with the visible 2x2 grid only
// filling a centred 650x650 box inside it (padding baked into the asset,
// typical icon/splash safe-zone margin) — `imageWidth` scales the WHOLE
// padded canvas, not just the visible content, so setting it to 180
// rendered the visible grid at only ~114px (180 * 650/1024), nowhere near
// this component's edge-to-edge 180px mark. The correct value to make the
// VISIBLE content land at 180px is `180 * (1024/650)` ≈ 284 — that's what
// app.json is actually set to. If splash.png is ever re-exported with
// different padding, recompute this ratio rather than assuming 180 is
// correct just because MARK_SIZE is 180.
//
// The track is positioned via its own absolutely-positioned wrapper
// (trackWrap), not grouped into the same centered flex column as the mark —
// grouping them would shift the mark's vertical centre upward to make room
// for the bar beneath it, moving it away from the native splash's own
// true-centre position.
const MARK_SIZE = 180;
const CELL_GAP = 12;
const CELL_SIZE = (MARK_SIZE - CELL_GAP) / 2;
const TRACK_WIDTH = 160;
const TRACK_GAP = 40; // space between the mark's bottom edge and the track

const CELLS = [
  { value: '1', bg: '#1D3129', border: '#4FAE8D', text: '#4FAE8D', col: 0, row: 0 },
  { value: '3', bg: '#242219', border: '#4A4536', text: '#EDE8DC', col: 1, row: 0 },
  { value: '5', bg: '#3D2F17', border: '#E0A542', text: '#E0A542', col: 1, row: 1 },
  { value: '8', bg: '#3D211A', border: '#E2593C', text: '#E2593C', col: 0, row: 1 },
];

export default function LoadingScreen({ progress }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const fillWidth = Math.round(clamped * TRACK_WIDTH);

  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        {CELLS.map((c) => (
          <View
            key={c.value}
            style={[
              styles.cell,
              { left: c.col * (CELL_SIZE + CELL_GAP), top: c.row * (CELL_SIZE + CELL_GAP), backgroundColor: c.bg, borderColor: c.border },
            ]}
          >
            <Text style={[styles.cellText, { color: c.text }]}>{c.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.trackWrap}>
        <View style={styles.track}>
          <View style={{ width: fillWidth, height: '100%', overflow: 'hidden' }}>
            <LinearGradient
              colors={['#4FAE8D', '#E0A542', '#E2593C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: TRACK_WIDTH, height: '100%' }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1B1A17', alignItems: 'center', justifyContent: 'center' },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
  cell: {
    position: 'absolute', width: CELL_SIZE, height: CELL_SIZE,
    borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center',
  },
  cellText: { fontSize: 32, fontWeight: '700' },
  trackWrap: {
    position: 'absolute', top: '50%', marginTop: MARK_SIZE / 2 + TRACK_GAP,
    width: '100%', alignItems: 'center',
  },
  track: {
    width: TRACK_WIDTH, height: 4, borderRadius: 2,
    backgroundColor: '#4A4536', overflow: 'hidden',
  },
});
