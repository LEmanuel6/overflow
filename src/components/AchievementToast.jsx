import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const DISPLAY_MS = 3200;
const ANIM_MS = 220;

// A stack of "Achievement Unlocked" banners, rendered once in App.js above
// whichever screen is active (ladder or daily both funnel unlocks into the
// same queue — see useAchievementToastQueue) so it works regardless of which
// one triggered it. `achievements` is the currently-visible list (oldest
// first); each one animates and times out independently (see ToastItem), so
// several unlocking at once stack up rather than waiting for one another.
//
// Anchored to the BOTTOM (not the top) — Leon's call: that's where the
// screen tends to have the most unused space (below GameScreen's Play/Reset
// buttons, below the Menu's hero section). The stack grows upward from that
// fixed bottom edge as items are added, so a new arrival pushes earlier ones
// up rather than overlapping them.
export default function AchievementToast({ theme, achievements, onDone }) {
  const insets = useSafeAreaInsets();
  if (!achievements.length) return null;

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 20 }]} pointerEvents="none">
      {achievements.map((a) => (
        <ToastItem key={a.id} theme={theme} achievement={a} onDone={() => onDone(a.id)} />
      ))}
    </View>
  );
}

// Owns its own full lifecycle — slides/fades in on mount, holds, then
// slides/fades out and reports onDone() so the parent can actually drop it
// from the list. Keeping this per-item (rather than one shared Animated.Value
// in the parent) is what lets several toasts animate independently while
// stacked.
function ToastItem({ theme, achievement, onDone }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }).start(onDone);
    }, DISPLAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Starts below its resting spot (translateY positive = further down) and
  // animates up to 0 — reads as sliding in from the bottom edge.
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
      <View style={[styles.card, { backgroundColor: theme.color.vessel, borderColor: theme.color.ok }]}>
        <View style={[styles.badge, { backgroundColor: theme.color.okSoft, borderColor: theme.color.ok }]}>
          <Ionicons name={achievement.icon} size={18} color={theme.color.ok} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.label, { color: theme.color.ok, fontFamily: theme.font.bold }]}>ACHIEVEMENT UNLOCKED</Text>
          <Text style={[styles.title, { color: theme.color.ink, fontFamily: theme.font.bold }]} numberOfLines={1}>
            {achievement.title}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16, alignItems: 'center',
    gap: 8, zIndex: 50, elevation: 50,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    width: '100%', maxWidth: 380, padding: 10, paddingRight: 16,
    borderWidth: 1, borderRadius: 10,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  text: { flex: 1 },
  label: { fontSize: 10, letterSpacing: 1 },
  title: { fontSize: 15, marginTop: 1 },
});
