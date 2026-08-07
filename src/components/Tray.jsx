import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const TABS = [
  { key: 'menu', icon: 'home-outline', label: 'Home' },
  { key: 'stats', icon: 'stats-chart-outline', label: 'Stats' },
  { key: 'achievements', icon: 'trophy-outline', label: 'Achievements' },
  { key: 'settings', icon: 'settings-outline', label: 'Settings' },
];

// Rendered once, persistently, by App.js (not nested inside each screen) so
// switching between tabs doesn't tear the tray itself down and rebuild it —
// that full remount was the actual source of the "flicker on the bottom bar"
// (a background-color mismatch was the wrong diagnosis; this component
// disappearing and reappearing on every tap was the real one). Since it's no
// longer nested inside a screen's own SafeAreaView, it computes its own
// bottom safe-area inset directly.
export default function Tray({ theme, active, onHome, onStats, onAchievements, onSettings }) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const handlers = { menu: onHome, stats: onStats, achievements: onAchievements, settings: onSettings };

  return (
    <View style={[styles.tray, { paddingBottom: insets.bottom + 6 }]}>
      {TABS.map((t) => (
        <TrayButton
          key={t.key}
          styles={styles}
          theme={theme}
          icon={t.icon}
          label={t.label}
          isActive={active === t.key}
          onPress={handlers[t.key]}
        />
      ))}
    </View>
  );
}

function TrayButton({ styles, theme, icon, label, isActive, onPress }) {
  const color = isActive ? theme.color.ink : theme.color.inkSoft;
  return (
    <Pressable style={styles.trayButton} onPress={onPress} hitSlop={8}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.trayLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    tray: {
      flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
      borderTopWidth: 1, borderColor: theme.color.gridLine,
      backgroundColor: theme.color.paper,
      paddingTop: 10,
    },
    trayButton: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 3 },
    trayLabel: { fontFamily: theme.font.semiBold, fontSize: 14, letterSpacing: 0.5 },
  });
}
