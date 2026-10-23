import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import ConfirmDialog from '../components/ConfirmDialog';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from '../data/achievements';
import { dailyDateStr, totalAttemptsForDay, completedCountForDay } from '../state/useDailyStats';
import { DAILY_DIFFICULTY_ORDER } from '../engine';
import { isLeaderboardsAvailable, isLeaderboardsPreview, showLevelLeaderboard } from '../leaderboards';

const RECENT_LIMIT = 3;

// A miniature of the app icon itself (assets/icon.png: a neat, un-rotated
// 2x2 grid of game cells — green, neutral, burst, signal) — recomposed from
// theme tokens rather than a baked image, so it re-colours correctly for
// dark/light mode automatically. Sits in its own block below the Play/Reset
// buttons — see MenuScreen below — not layered behind anything, so it never
// competes with text for legibility.
const ICON_CELLS = [
  { bg: 'okSoft', border: 'ok' },
  { bg: 'vessel', border: 'vesselEdge' },
  { bg: 'burstSoft', border: 'burst' },
  { bg: 'signalSoft', border: 'signal' },
];

function PlayBlob({ theme }) {
  return (
    <View style={blobStyles.grid} pointerEvents="none">
      {ICON_CELLS.map((c, i) => (
        <View
          key={i}
          style={[blobStyles.cell, { backgroundColor: theme.color[c.bg], borderColor: theme.color[c.border] }]}
        />
      ))}
    </View>
  );
}

const blobStyles = StyleSheet.create({
  grid: {
    width: 112, marginTop: 32, flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  cell: {
    width: 52, height: 52, borderRadius: 12, borderWidth: 2,
  },
});

// Tray is rendered once, persistently, by App.js — not here (see Tray.jsx).
export default function MenuScreen({ level, stats, onPlay, onReset, onAchievements, dailyStats, onDaily, overallPoints }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Daily-sourced achievements (source: 'daily') live in the separate
  // dailyStats blob, not the ladder stats blob — see achievements.js.
  const blobFor = (a) => (a.source === 'daily' ? dailyStats : stats);
  const unlockedCount = ACHIEVEMENTS.filter((a) => { const b = blobFor(a); return b && a.check(b); }).length;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [dailyCardWidth, setDailyCardWidth] = useState(0);

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

  const today = dailyDateStr();
  const totalAttemptsToday = dailyStats ? totalAttemptsForDay(dailyStats, today) : 0;
  const completedToday = dailyStats ? completedCountForDay(dailyStats, today) : 0;
  const dailyAllComplete = completedToday >= DAILY_DIFFICULTY_ORDER.length;
  const dailySubtitle = totalAttemptsToday > 0
    ? `${completedToday}/${DAILY_DIFFICULTY_ORDER.length} completed · ${totalAttemptsToday} attempt${totalAttemptsToday === 1 ? '' : 's'} today`
    : 'Not played yet today';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
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

      <View style={styles.ctaRow}>
        <Pressable
          style={[
            styles.dailyCard,
            dailyAllComplete && { borderColor: theme.color.ok },
          ]}
          onPress={onDaily}
          onLayout={(e) => setDailyCardWidth(e.nativeEvent.layout.width)}
        >
          {dailyCardWidth > 0 && (
            <View
              style={[
                styles.dailyFill,
                {
                  width: Math.round(dailyCardWidth * (completedToday / DAILY_DIFFICULTY_ORDER.length)),
                  backgroundColor: dailyAllComplete ? theme.color.okSoft : theme.color.signalSoft,
                },
              ]}
            />
          )}
          <View style={styles.dailyBadge}>
            <Ionicons name="today-outline" size={20} color={theme.color.inkSoft} />
          </View>
          <View style={styles.dailyText}>
            <Text style={styles.dailyTitle} numberOfLines={1}>Daily Challenge</Text>
            <Text style={styles.dailySubtitle} numberOfLines={1}>{dailySubtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={dailyAllComplete ? theme.color.ok : theme.color.vesselEdge} />
        </Pressable>

        {(isLeaderboardsAvailable() || isLeaderboardsPreview()) && (
          <Pressable style={styles.dailyCard} onPress={showLevelLeaderboard}>
            <View style={styles.dailyBadge}>
              <Ionicons name="trophy-outline" size={20} color={theme.color.inkSoft} />
            </View>
            <View style={styles.dailyText}>
              <Text style={styles.dailyTitle} numberOfLines={1}>Leaderboard</Text>
              <Text style={styles.dailySubtitle} numberOfLines={1}>
                {isLeaderboardsAvailable() ? `${overallPoints} point${overallPoints === 1 ? '' : 's'}` : 'Preview'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.color.vesselEdge} />
          </Pressable>
        )}
      </View>

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

        <PlayBlob theme={theme} />
      </View>

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
    recentRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    // width is wide enough for the longest single word seen in an achievement
    // title so far (e.g. "Comfortable", "Grandmaster", "Intermediate") to sit
    // on one line at badgeTitle's font size — a too-narrow slot has no space
    // left to wrap at, so RN falls back to a mid-word break instead.
    badgeSlot: { alignItems: 'center', width: 100 },
    badge: {
      width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.color.vessel, borderWidth: 1, borderColor: theme.color.vesselEdge,
    },
    badgeUnlocked: { backgroundColor: theme.color.okSoft, borderColor: theme.color.ok },
    badgeTitle: {
      fontFamily: theme.font.regular, fontSize: 12, color: theme.color.inkSoft, marginTop: 6, textAlign: 'center',
    },
    // Daily Challenge and Leaderboard sit side by side (see ctaRow) rather
    // than stacked — both dropped their distinct accent colour (no more blue
    // leaderboard badge/border, no more red "nothing done yet" daily state)
    // so the row reads as one consistent neutral pair; the daily card alone
    // keeps its progress colouring (fill bar, green border/chevron once all
    // 4 are complete) since that's informational, not just decorative.
    ctaRow: { flexDirection: 'row', marginHorizontal: 20, marginTop: 16, gap: 10 },
    dailyCard: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
      padding: 10,
      backgroundColor: theme.color.vessel, borderWidth: 1, borderColor: theme.color.vesselEdge,
      borderRadius: theme.radius, overflow: 'hidden',
    },
    // Fills left-to-right with how many of today's 4 difficulties are
    // completed — the same muted *Soft background fill a cell itself shows
    // (signalSoft while at cap, okSoft once safe/pushes-nothing), not the
    // brighter border colour — amber while partial, green once all 4 are
    // done. The card's own border also switches to the matching bright
    // green cell-border colour (ok) once all 4 are done — see the inline
    // style on the Pressable itself, same "all complete" condition. Leon's
    // call, reusing the exact same state colours the board itself uses
    // rather than inventing new ones. Absolutely positioned behind the card's
    // existing row content (declared first in the JSX, so it paints under
    // it) — `overflow: hidden` on dailyCard above keeps it clipped to the
    // card's own rounded corners.
    dailyFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
    dailyBadge: {
      width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.vesselEdge,
    },
    dailyText: { flex: 1 },
    dailyTitle: { fontFamily: theme.font.bold, fontSize: 14, color: theme.color.ink },
    dailySubtitle: { fontFamily: theme.font.regular, fontSize: 12, color: theme.color.inkSoft, marginTop: 2 },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    title: {
      fontFamily: theme.font.bold, fontSize: 40,
      letterSpacing: 6, color: theme.color.ink, marginBottom: 8,
    },
    level: {
      fontFamily: theme.font.semiBold, fontSize: 15, color: theme.color.signal,
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
