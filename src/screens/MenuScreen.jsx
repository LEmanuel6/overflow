import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import Tray from '../components/Tray';
import ConfirmDialog from '../components/ConfirmDialog';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from '../data/achievements';
import { localDateStr, totalAttemptsForDay, completedCountForDay } from '../state/useDailyStats';
import { DAILY_DIFFICULTY_ORDER } from '../engine';

const RECENT_LIMIT = 3;

export default function MenuScreen({ level, stats, onPlay, onReset, onHome, onStats, onAchievements, onSettings, dailyStats, onDaily }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Daily-sourced achievements (source: 'daily') live in the separate
  // dailyStats blob, not the ladder stats blob — see achievements.js.
  const blobFor = (a) => (a.source === 'daily' ? dailyStats : stats);
  const unlockedCount = ACHIEVEMENTS.filter((a) => { const b = blobFor(a); return b && a.check(b); }).length;
  const [confirmingReset, setConfirmingReset] = useState(false);

  const handleReset = () => {
    setConfirmingReset(false);
    onReset();
  };

  const mergedUnlockedAt = { ...stats.unlockedAt, ...(dailyStats?.unlockedAt || {}) };
  const recent = Object.entries(mergedUnlockedAt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, RECENT_LIMIT)
    .map(([id]) => ACHIEVEMENTS_BY_ID[id])
    .filter(Boolean);

  const today = localDateStr();
  const totalAttemptsToday = dailyStats ? totalAttemptsForDay(dailyStats, today) : 0;
  const completedToday = dailyStats ? completedCountForDay(dailyStats, today) : 0;
  const dailySubtitle = totalAttemptsToday > 0
    ? `${completedToday}/${DAILY_DIFFICULTY_ORDER.length} completed · ${totalAttemptsToday} attempt${totalAttemptsToday === 1 ? '' : 's'} today`
    : 'Not played yet today';

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable style={styles.recent} onPress={onAchievements}>
        <Text style={styles.recentLabel}>Recent achievements</Text>
        {recent.length === 0 ? (
          <View style={styles.recentEmptyRow}>
            <View style={styles.badge}>
              <Ionicons name="trophy-outline" size={26} color={theme.color.inkSoft} />
            </View>
            <Text style={styles.recentEmpty}>Clear a board to unlock your first one</Text>
          </View>
        ) : (
          <View style={styles.recentRow}>
            {recent.map((a) => (
              <View key={a.id} style={styles.badgeSlot}>
                <View style={[styles.badge, styles.badgeUnlocked]}>
                  <Ionicons name={a.icon} size={26} color={theme.color.ok} />
                </View>
                <Text style={styles.badgeTitle} numberOfLines={2}>{a.title}</Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>

      <Pressable style={styles.dailyCard} onPress={onDaily}>
        <View style={styles.dailyBadge}>
          <Ionicons name="today-outline" size={22} color={theme.color.inkSoft} />
        </View>
        <View style={styles.dailyText}>
          <Text style={styles.dailyTitle}>Daily Challenge</Text>
          <Text style={styles.dailySubtitle}>{dailySubtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.color.inkSoft} />
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>OVERFLOW</Text>
        <Text style={styles.level}>Level {level}</Text>
        <Text style={styles.sub}>{unlockedCount} / {ACHIEVEMENTS.length} achievements</Text>

        <Pressable style={styles.button} onPress={onPlay}>
          <Text style={styles.buttonText}>Play</Text>
        </Pressable>

        <Pressable style={styles.resetButton} onPress={() => setConfirmingReset(true)}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>
      </View>

      <Tray theme={theme} active="menu" onHome={onHome} onStats={onStats} onAchievements={onAchievements} onSettings={onSettings} />

      <ConfirmDialog
        theme={theme}
        visible={confirmingReset}
        title="Reset progress?"
        message="This clears your level, stats, achievements, and daily challenge history. Settings are kept."
        confirmLabel="Reset"
        onCancel={() => setConfirmingReset(false)}
        onConfirm={handleReset}
      />
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.color.paper },
    recent: {
      alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
      borderBottomWidth: 1, borderColor: theme.color.gridLine,
    },
    recentLabel: {
      fontFamily: theme.font.bold, fontSize: 14, color: theme.color.inkSoft,
      textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, textAlign: 'center',
    },
    recentEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    recentEmpty: { fontFamily: theme.font.regular, fontSize: 14, color: theme.color.inkSoft, opacity: 0.75, flexShrink: 1 },
    recentRow: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
    badgeSlot: { alignItems: 'center', width: 92 },
    badge: {
      width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.color.vessel, borderWidth: 1, borderColor: theme.color.vesselEdge,
    },
    badgeUnlocked: { backgroundColor: theme.color.okSoft, borderColor: theme.color.ok },
    badgeTitle: {
      fontFamily: theme.font.regular, fontSize: 14, color: theme.color.inkSoft, marginTop: 6, textAlign: 'center',
    },
    dailyCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginHorizontal: 20, marginTop: 16, padding: 12,
      backgroundColor: theme.color.vessel, borderWidth: 1, borderColor: theme.color.vesselEdge,
      borderRadius: theme.radius,
    },
    dailyBadge: {
      width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.vesselEdge,
    },
    dailyText: { flex: 1 },
    dailyTitle: { fontFamily: theme.font.bold, fontSize: 16, color: theme.color.ink },
    dailySubtitle: { fontFamily: theme.font.regular, fontSize: 13, color: theme.color.inkSoft, marginTop: 2 },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    title: {
      fontFamily: theme.font.bold, fontSize: 40,
      letterSpacing: 6, color: theme.color.ink, marginBottom: 8,
    },
    level: {
      fontFamily: theme.font.regular, fontSize: 15, color: theme.color.inkSoft,
      marginBottom: 2,
    },
    sub: {
      fontFamily: theme.font.regular, fontSize: 14, color: theme.color.inkSoft, opacity: 0.75,
      marginBottom: 32,
    },
    button: {
      backgroundColor: theme.color.ink,
      paddingVertical: 14, paddingHorizontal: 40, borderRadius: theme.radius,
    },
    buttonText: { fontFamily: theme.font.bold, fontSize: 16, color: theme.color.paper, letterSpacing: 1 },
    resetButton: { marginTop: 14, paddingVertical: 6, paddingHorizontal: 12 },
    resetButtonText: {
      fontFamily: theme.font.semiBold, fontSize: 14, color: theme.color.burst, letterSpacing: 0.5,
    },
  });
}
